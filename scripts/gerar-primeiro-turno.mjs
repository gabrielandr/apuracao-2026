import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function load(rel, sandbox) {
  vm.runInNewContext(fs.readFileSync(path.join(root, rel), "utf8"), sandbox, { filename: rel });
}

const modelBox = { module: { exports: {} }, exports: {} };
load("js/model.js", modelBox);
const model = modelBox.module.exports;

const configBox = { window: {} };
load("js/config.js", configBox);
const base = configBox.window.APURACAO;
const config = Object.assign({}, base, { code: "6257" });

const numeros = ["13", "22"];
const abrangencias = ["br"].concat(model.UFS, ["zz"]);

function oficial(cand) {
  return {
    n: String(cand.n),
    nome: String(cand.nmu || cand.nm),
    pvap: String(cand.pvap),
    vap: String(cand.vap),
  };
}

function achar(json, numero) {
  for (const agr of json.carg[0].agr || []) {
    for (const par of agr.par || []) {
      for (const cand of par.cand || []) {
        if (String(cand.n) === numero) return cand;
      }
    }
  }
  return null;
}

const recortes = {};
for (const uf of abrangencias) {
  const url = model.fileUrl(config, uf);
  const response = await fetch(url);
  if (!response.ok) {
    console.error(url + " -> " + response.status);
    process.exit(1);
  }
  const json = await response.json();
  const candidatos = [];
  for (const numero of numeros) {
    const cand = achar(json, numero);
    if (!cand || cand.pvap == null || cand.vap == null) {
      console.error(uf + " sem candidato " + numero);
      process.exit(1);
    }
    candidatos.push(oficial(cand));
  }
  recortes[uf] = {
    dg: String(json.dg),
    hg: String(json.hg),
    pst: String(json.s.pst),
    candidatos: candidatos,
  };
}

const arquivo = path.join(root, "data", "primeiro-turno.json");
fs.mkdirSync(path.dirname(arquivo), { recursive: true });
fs.writeFileSync(arquivo, JSON.stringify({ eleicao: "6257", recortes: recortes }, null, 2) + "\n");
console.log("gravado " + Object.keys(recortes).length + " recortes");
