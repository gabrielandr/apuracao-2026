import fs from "node:fs";
import vm from "node:vm";

function load(rel) {
  const code = fs.readFileSync(new URL(rel, import.meta.url), "utf8");
  const box = { module: { exports: {} }, exports: {} };
  vm.runInNewContext(code, box, { filename: rel });
  return box.module.exports;
}

const model = load("../js/model.js");
const parciais = JSON.parse(fs.readFileSync(new URL("../data/primeiro-turno-parciais.json", import.meta.url), "utf8"));
const primeiro = JSON.parse(fs.readFileSync(new URL("../data/primeiro-turno.json", import.meta.url), "utf8"));

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function vap(uf, n) {
  const cand = primeiro.recortes[uf].candidatos.find(function (item) { return item.n === n; });
  assert(cand, "candidato " + n + " em " + uf);
  return Number(cand.vap);
}

assert(parciais.eleicao === "6257", "eleição da série");
assert(parciais.colunas.join(",") === "pst,flavio,lula", "colunas");
assert(parciais.fonte.indexOf("ArvorCo/PNAD") !== -1, "fonte");
assert(!parciais.serie.exterior && !parciais.serie.zz, "exterior fica de fora");
assert(Object.keys(parciais.serie).sort().join(",") === "br,centro-oeste,nordeste,norte,sudeste,sul", "recortes");

function confereSerie(id) {
  const serie = parciais.serie[id];
  assert(serie.length > 10, id + " tem pontos");
  let anterior = 0;
  serie.forEach(function (ponto) {
    assert(ponto.length === 3, id + " ponto enxuto");
    assert(ponto[0] > anterior && ponto[0] <= 10000, id + " pst crescente " + ponto[0]);
    assert(ponto[1] >= 0 && ponto[2] >= 0, id + " percentuais");
    anterior = ponto[0];
  });
  const fim = serie[serie.length - 1];
  assert(fim[0] === 10000, id + " termina em 100%");
  assert(fim[1] === model.centesimosDe(parciais.fim[id].flavio, parciais.fim[id].vv), id + " flavio final");
  assert(fim[2] === model.centesimosDe(parciais.fim[id].lula, parciais.fim[id].vv), id + " lula final");
  const perto = model.pontoMaisProximo(serie, 5000);
  const cmp = model.compararMesmaApuracao(serie, perto.pst, perto.flavio, perto.lula);
  assert(cmp.deltaFlavio === 0 && cmp.deltaLula === 0, id + " contra si mesma é zero");
  assert(cmp.base.pst === perto.pst && cmp.base.distancia === 0, id + " acha o próprio ponto");
  const final = model.pontoMaisProximo(serie, 10000);
  assert(final.pst === 10000 && final.flavio === fim[1] && final.lula === fim[2], id + " 100% é o final");
}

Object.keys(parciais.serie).forEach(confereSerie);

const brOficial = primeiro.recortes.br.candidatos;
assert(parciais.fim.br.flavio === vap("br", "22") && parciais.fim.br.lula === vap("br", "13"), "votos nacionais oficiais");
assert(parciais.serie.br[parciais.serie.br.length - 1][1] === model.pvapCentesimos(brOficial.find(function (c) { return c.n === "22"; }).pvap), "pvap Flávio");
assert(parciais.serie.br[parciais.serie.br.length - 1][2] === model.pvapCentesimos(brOficial.find(function (c) { return c.n === "13"; }).pvap), "pvap Lula");

model.REGIOES.forEach(function (regiao) {
  const f = regiao.ufs.reduce(function (total, uf) { return total + vap(uf, "22"); }, 0);
  const l = regiao.ufs.reduce(function (total, uf) { return total + vap(uf, "13"); }, 0);
  assert(parciais.fim[regiao.id].flavio === f && parciais.fim[regiao.id].lula === l, "votos " + regiao.nome);
  assert(model.regiaoDe(regiao.ufs[0]).id === regiao.id, "uf da região");
});
assert(model.regiaoDe("rj").nome === "Sudeste", "RJ é Sudeste");
assert(model.regiaoDe("zz") == null, "exterior sem região");

const serie = [[1000, 10, 90], [3000, 40, 60], [3000, 41, 59]];
const empate = model.pontoMaisProximo([[4900, 1, 2], [5100, 3, 4]], 5000);
assert(empate.pst === 4900, "empate fica no pst menor");
assert(model.pontoMaisProximo(serie, 3000).flavio === 40, "o primeiro ponto daquele pst permanece se a série não foi colapsada");

console.log("OK parciais");
const meio = model.pontoMaisProximo(parciais.serie.br, 5000);
const sudeste = model.pontoMaisProximo(parciais.serie.sudeste, 5000);
console.log("br ~50", meio.pst, meio.flavio, meio.lula);
console.log("sudeste ~50", sudeste.pst, sudeste.flavio, sudeste.lula);
