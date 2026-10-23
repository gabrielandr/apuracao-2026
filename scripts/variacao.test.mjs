import fs from "node:fs";
import vm from "node:vm";

const modelCode = fs.readFileSync(new URL("../js/model.js", import.meta.url), "utf8");
const modelBox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(modelCode, modelBox);
const model = modelBox.module.exports;

const configCode = fs.readFileSync(new URL("../js/config.js", import.meta.url), "utf8");
const configBox = { window: {} };
vm.runInNewContext(configCode, configBox);
const config = configBox.window.APURACAO;

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const exemplo = model.variacaoTurno({
  code: "6258",
  pstN: 40,
  numeros: ["22", "13"],
  atuais: [
    { n: "22", nome: "LULA", pvap: "52,00" },
    { n: "13", nome: "FLAVIO BOLSONARO", pvap: "48,00" },
  ],
  base: [
    { n: "22", nome: "FLAVIO BOLSONARO", pvap: "51,00" },
    { n: "13", nome: "LULA", pvap: "49,00" },
  ],
});
assert(exemplo.situacao === "apurando", "2º turno com urna apurada compara");
assert(model.formatPontos(exemplo.linhas[0].delta) === "+1,00 p.p.", "22 sobe 1 ponto pelo número, não pelo nome");
assert(exemplo.linhas[0].sinal === "alta", "alta");
assert(model.formatPontos(exemplo.linhas[1].delta) === "−1,00 p.p.", "13 cai 1 ponto");
assert(exemplo.linhas[1].sinal === "queda", "queda");
assert(exemplo.linhas[0].pvapAtual === "52,00" && exemplo.linhas[0].pvapPrimeiro === "51,00", "textos oficiais");

const igual = model.variacaoTurno({
  code: "6258",
  pstN: 10,
  numeros: ["22"],
  atuais: [{ n: "22", pvap: "47,03" }],
  base: [{ n: "22", pvap: "47,03" }],
});
assert(igual.linhas[0].sinal === "neutro" && model.formatPontos(igual.linhas[0].delta) === "0,00 p.p.", "sem variação");

const teste = model.variacaoTurno({
  code: "6257",
  pstN: 100,
  numeros: ["22", "13"],
  atuais: [
    { n: "22", pvap: "47,03" },
    { n: "13", pvap: "45,16" },
  ],
  base: [
    { n: "22", pvap: "1,00" },
    { n: "13", pvap: "2,00" },
  ],
});
assert(teste.situacao === "antes", "1º turno não compara com ele mesmo");
assert(teste.linhas.every((linha) => linha.delta == null), "não inventa variação no teste");
assert(teste.linhas[0].pvapPrimeiro === "47,03" && teste.linhas[0].pvapAtual === "", "mostra o pvap oficial do turno atual");

const zero = model.variacaoTurno({
  code: "6258",
  pstN: 0,
  numeros: ["22", "13"],
  atuais: [
    { n: "22", pvap: "0,00" },
    { n: "13", pvap: "0,00" },
  ],
  base: [
    { n: "22", pvap: "47,03" },
    { n: "13", pvap: "45,16" },
  ],
});
assert(zero.situacao === "aguardando", "0% de urnas aguarda apuração");
assert(zero.linhas.every((linha) => linha.delta == null && linha.pvapAtual === ""), "não calcula queda a partir do zero");
assert(zero.linhas[0].pvapPrimeiro === "47,03", "mantém o 1º turno oficial");

const arquivo = JSON.parse(fs.readFileSync(new URL("../data/primeiro-turno.json", import.meta.url), "utf8"));
assert(arquivo.eleicao === "6257", "arquivo é o 1º turno");
for (const uf of ["br", "sp", "ba"]) {
  const url = model.fileUrl(Object.assign({}, config, { code: "6257" }), uf);
  const response = await fetch(url);
  if (!response.ok) throw new Error(url);
  const json = await response.json();
  const salvo = arquivo.recortes[uf];
  assert(salvo.dg === String(json.dg) && salvo.hg === String(json.hg) && salvo.pst === String(json.s.pst), uf + " horário e urnas");
  for (const numero of ["22", "13"]) {
    const bruto = achar(json, numero);
    const item = salvo.candidatos.find((c) => c.n === numero);
    assert(item && Object.keys(item).join(",") === "n,nome,pvap,vap", uf + " campos de " + numero);
    assert(item.pvap === String(bruto.pvap) && item.vap === String(bruto.vap) && item.nome === String(bruto.nmu || bruto.nm), uf + " " + numero);
  }
  console.log(uf + " " + salvo.candidatos.map((c) => c.n + " " + c.pvap + "%").join(" · "));
}

const segundo = model.fileUrl(Object.assign({}, config, { code: "6258" }), "br");
const resposta2 = await fetch(segundo);
if (!resposta2.ok) throw new Error(segundo);
const json2 = await resposta2.json();
const scope2 = model.parseScope(json2);
const previa = model.variacaoTurno({
  code: "6258",
  pstN: scope2.pstN,
  numeros: ["22", "13"],
  atuais: scope2.candidates.filter((c) => c.n === "22" || c.n === "13"),
  base: arquivo.recortes.br.candidatos,
});
assert(scope2.pst === "0,00" && previa.situacao === "aguardando", "6258 real ainda sem apuração");
console.log("OK variacao 6258 pst " + scope2.pst);

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
