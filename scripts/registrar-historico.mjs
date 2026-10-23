import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function load(rel, sandbox) {
  const code = fs.readFileSync(path.join(root, rel), "utf8");
  vm.runInNewContext(code, sandbox, { filename: rel });
}

const modelBox = { module: { exports: {} }, exports: {} };
load("js/model.js", modelBox);
const model = modelBox.module.exports;

const histBox = { module: { exports: {} }, exports: {} };
load("js/historico.js", histBox);
const historico = histBox.module.exports;

const configBox = { window: {} };
load("js/config.js", configBox);
const config = configBox.window.APURACAO;

const dry = process.argv.includes("--dry-run");
const arquivo = path.join(root, "data", "historico-" + config.code + ".json");

function ler() {
  if (!fs.existsSync(arquivo)) {
    return { eleicao: String(config.code), abrangencia: "br", pontos: [] };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(arquivo, "utf8"));
  } catch (err) {
    console.error("JSON inválido em " + arquivo);
    process.exit(1);
  }
  if (!parsed || String(parsed.eleicao) !== String(config.code)) {
    console.error("data/historico-" + config.code + ".json não é da eleição configurada.");
    process.exit(1);
  }
  return {
    eleicao: String(config.code),
    abrangencia: "br",
    pontos: historico.normalizar(parsed.pontos || []),
  };
}

async function main() {
  const url = model.fileUrl(config, "br");
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  } catch (err) {
    console.error("Falha ao baixar " + url);
    process.exit(1);
  }
  if (!response.ok) {
    console.error("Falha ao baixar " + url + " (HTTP " + response.status + ")");
    process.exit(1);
  }
  const json = await response.json();
  const scope = model.parseScope(json);
  const pair = model.selectPair(scope.candidates, config.selection);
  const ponto = historico.pontoOficial(scope, pair);
  if (!historico.pontoValido(ponto)) {
    console.error("O arquivo oficial do Brasil não trouxe dg, hg, pst e os dois candidatos.");
    process.exit(1);
  }
  if (ponto.dg !== String(json.dg) || ponto.hg !== String(json.hg) || ponto.pst !== String(json.s.pst)) {
    console.error("O ponto não reproduz dg, hg e pst oficiais.");
    process.exit(1);
  }
  if (!(model.num(ponto.pst) > 0)) {
    console.log(
      "sem ponto novo: " +
        ponto.dg +
        " " +
        ponto.hg +
        " está em " +
        ponto.pst +
        " de urnas; a série começa quando houver apuração"
    );
    return;
  }

  const doc = ler();
  const mesclado = historico.mesclar(doc.pontos, ponto);
  const mudou = JSON.stringify(mesclado) !== JSON.stringify(doc.pontos);
  if (!mudou) {
    const jaTem = doc.pontos.some(function (item) { return historico.chave(item) === historico.chave(ponto); });
    console.log(
      jaTem
        ? "sem ponto novo: " + ponto.dg + " " + ponto.hg + " já está na série"
        : "sem ponto novo: " + ponto.dg + " " + ponto.hg + " não é mais recente que o último ponto"
    );
    return;
  }
  if (dry) {
    console.log("dry-run: incluiria " + ponto.dg + " " + ponto.hg);
    console.log(JSON.stringify(ponto, null, 2));
    return;
  }
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const tmp = arquivo + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify({ eleicao: doc.eleicao, abrangencia: "br", pontos: mesclado }, null, 2) + "\n");
  fs.renameSync(tmp, arquivo);
  console.log("COMMIT Registra apuração oficial de " + ponto.dg + " " + ponto.hg);
}

main().catch(function (err) {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
