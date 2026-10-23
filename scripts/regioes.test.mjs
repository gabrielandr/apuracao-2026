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

const pair = [
  { nome: "FLAVIO BOLSONARO", lado: "flavio", sq: "f", n: "22" },
  { nome: "LULA", lado: "lula", sq: "l", n: "13" },
];

function scope(vapF, vapL, vv, st, ts) {
  return {
    secoesTotalizadas: String(st),
    secoesTotal: String(ts),
    validos: String(vv),
    candidates: [
      { sq: "f", n: "22", vap: String(vapF), nome: "FLAVIO BOLSONARO", lado: "flavio" },
      { sq: "l", n: "13", vap: String(vapL), nome: "LULA", lado: "lula" },
    ],
  };
}

const regiao = { id: "x", nome: "Teste", ufs: ["a", "b"] };
const soma = model.agregarRegiao(regiao, [scope(30, 70, 100, 10, 40), scope(30, 270, 300, 30, 60)], pair);
const flavio = soma.candidatos.find((c) => c.lado === "flavio");
const lula = soma.candidatos.find((c) => c.lado === "lula");
assert(flavio.vap === 60 && lula.vap === 340, "soma os votos nominais");
assert(flavio.centesimos === 1500, "60/400 é 15,00%, não a média 20%");
assert(lula.centesimos === 8500, "340/400 é 85,00%");
assert(soma.lider === "lula", "quem tem mais votos lidera");
assert(soma.candidatos[0].lado === "lula", "líder vem primeiro");
assert(soma.urnasCentesimos === 4000, "40 seções de 100 é 40,00%");
assert(model.formatCentesimos(1500) === "15,00%", "formato com vírgula");
assert(model.agregarRegiao(regiao, [scope(1, 1, 2, 1, 1), null], pair).completa === false, "UF ausente não vira zero");

const todas = model.REGIOES.flatMap((r) => r.ufs);
assert(new Set(todas).size === 27 && todas.length === 27, "27 UFs, sem repetir");
assert(!todas.includes("zz") && !todas.includes("br"), "exterior fica fora");

function somaBruta(jsons, sq) {
  return jsons.reduce((total, json) => total + Number(achar(json, sq).vap), 0);
}

function achar(json, sq) {
  for (const agr of json.carg[0].agr || []) {
    for (const par of agr.par || []) {
      for (const cand of par.cand || []) {
        if (String(cand.sqcand) === sq) return cand;
      }
    }
  }
  return null;
}

const alvos = ["sudeste", "nordeste"];
for (const id of alvos) {
  const regiaoOficial = model.REGIOES.find((r) => r.id === id);
  const jsons = await Promise.all(regiaoOficial.ufs.map(async (uf) => {
    const url = model.fileUrl(config, uf);
    const response = await fetch(url);
    if (!response.ok) throw new Error(url + " -> " + response.status);
    return response.json();
  }));
  let vv = 0;
  let st = 0;
  let ts = 0;
  for (const json of jsons) {
    const nominal = json.carg[0].agr.reduce((total, agr) => {
      return total + (agr.par || []).reduce((sub, par) => {
        return sub + (par.cand || []).reduce((acc, cand) => acc + Number(cand.vap), 0);
      }, 0);
    }, 0);
    assert(nominal === Number(json.v.vv), json.cdabr + " vv difere da soma dos vap");
    vv += Number(json.v.vv);
    st += Number(json.s.st);
    ts += Number(json.s.ts);
  }
  const sqFlavio = acharPrimeiro(jsons, "FLAVIO");
  const sqLula = acharPrimeiro(jsons, "LULA");
  const vapF = somaBruta(jsons, sqFlavio);
  const vapL = somaBruta(jsons, sqLula);
  const scopes = jsons.map((json) => model.parseScope(json));
  const nacional = [
    { nome: "FLAVIO BOLSONARO", lado: "flavio", sq: sqFlavio, n: achar(jsons[0], sqFlavio).n },
    { nome: "LULA", lado: "lula", sq: sqLula, n: achar(jsons[0], sqLula).n },
  ];
  const calculado = model.agregarRegiao(regiaoOficial, scopes, nacional);
  assert(calculado.completa, id + " completa");
  assert(calculado.candidatos.find((c) => c.lado === "flavio").vap === vapF, id + " vap Flávio");
  assert(calculado.candidatos.find((c) => c.lado === "lula").vap === vapL, id + " vap Lula");
  assert(calculado.validos === vv, id + " válidos");
  assert(calculado.secoesTotalizadas === st && calculado.secoesTotal === ts, id + " seções");
  assert(calculado.candidatos[0].centesimos === model.centesimosDe(calculado.candidatos[0].vap, vv), id + " percentual do líder");
  const linha = calculado.nome + " — " + calculado.candidatos.map((c) => c.lado + " " + model.formatCentesimos(c.centesimos) + " (" + c.vap + ")").join(" x ");
  console.log(linha + " · urnas " + model.formatCentesimos(calculado.urnasCentesimos) + " · válidos " + vv);
}

function acharPrimeiro(jsons, trecho) {
  for (const json of jsons) {
    for (const agr of json.carg[0].agr || []) {
      for (const par of agr.par || []) {
        for (const cand of par.cand || []) {
          if (String(cand.nmu || cand.nm).includes(trecho)) return String(cand.sqcand);
        }
      }
    }
  }
  throw new Error("candidato " + trecho);
}

console.log("OK regioes");
