import fs from "node:fs";
import vm from "node:vm";

const modelCode = fs.readFileSync(new URL("../js/model.js", import.meta.url), "utf8");
const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(modelCode, sandbox);
const model = sandbox.module.exports;

const configCode = fs.readFileSync(new URL("../js/config.js", import.meta.url), "utf8");
const configBox = { window: {} };
vm.runInNewContext(configCode, configBox);
const config = configBox.window.APURACAO;

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function cand(pvapN, lado) {
  return { pvapN, lado, vapN: pvapN, nome: lado, sq: lado, n: lado };
}

assert(model.colorFor({ pstN: 0 }, [cand(10, "lula"), cand(0, "flavio")]) === "neutro", "0% é neutro");
assert(model.colorFor({ pstN: null }, [cand(10, "lula"), cand(0, "flavio")]) === "neutro", "sem pst é neutro");
assert(model.colorFor({ pstN: 100 }, [cand(50, "lula"), cand(48.1, "flavio")]) === "gelo", "1,9 ponto é gelo");
assert(model.colorFor({ pstN: 100 }, [cand(50, "lula"), cand(48, "flavio")]) === "lula-1", "2 pontos, Lula");
assert(model.colorFor({ pstN: 100 }, [cand(40, "lula"), cand(49.9, "flavio")]) === "flavio-1", "9,9 pontos, Flávio");
assert(model.colorFor({ pstN: 100 }, [cand(60, "lula"), cand(50, "flavio")]) === "lula-2", "10 pontos, Lula");
assert(model.colorFor({ pstN: 100 }, [cand(40, "flavio"), cand(59.9, "lula")]) === "lula-2", "19,9 pontos, Lula");
assert(model.colorFor({ pstN: 100 }, [cand(70, "flavio"), cand(50, "lula")]) === "flavio-3", "20 pontos, Flávio");
assert(model.colorFor({ pstN: 80 }, [null, cand(10, "lula")]) === "neutro", "candidato ausente");

const runoff = model.selectPair(
  [
    { nome: "C", vapN: 100, st: "Não eleito", sq: "3", n: "3" },
    { nome: "A", vapN: 10, st: "2º turno", sq: "1", n: "1" },
    { nome: "B", vapN: 9, st: "2º turno", sq: "2", n: "2" },
  ],
  "runoff"
);
assert(runoff.map((c) => c.nome).join(",") === "A,B", "runoff usa quem foi ao 2º turno");

const top2 = model.selectPair(
  [
    { nome: "C", vapN: 5, st: "", sq: "3", n: "3" },
    { nome: "A", vapN: 50, st: "", sq: "1", n: "1" },
    { nome: "B", vapN: 40, st: "", sq: "2", n: "2" },
  ],
  "top2"
);
assert(top2.map((c) => c.nome).join(",") === "A,B", "top2 ordena por votos");

const soDois = model.selectPair(
  [
    { nome: "L", vapN: 0, st: "", sq: "1", n: "13" },
    { nome: "F", vapN: 0, st: "", sq: "2", n: "22" },
  ],
  "runoff"
);
assert(soDois.length === 2, "2º turno com dois candidatos");

const alvos = ["br", "sp", "mg", "ba", "rj", "rs", "pe"];
const relatorio = [];
for (const uf of alvos) {
  const url = model.fileUrl(config, uf);
  const response = await fetch(url);
  if (!response.ok) throw new Error(url + " -> " + response.status);
  const json = await response.json();
  const scope = model.parseScope(json);
  assert(scope.eleicao === String(config.code), uf + " eleição");
  assert(scope.pst === String(json.s.pst), uf + " pst");
  assert(scope.brancos.n === String(json.v.vb) && scope.brancos.p === String(json.v.pvb), uf + " brancos");
  assert(scope.nulos.n === String(json.v.tvn) && scope.nulos.p === String(json.v.ptvn), uf + " nulos");
  assert(scope.abstencao.n === String(json.e.a) && scope.abstencao.p === String(json.e.pa), uf + " abstenção");
  assert(scope.dg === json.dg && scope.hg === json.hg, uf + " horário");
  const pair = model.selectPair(scope.candidates, config.selection);
  assert(pair.length === 2, uf + " precisa de dois nomes");
  for (const c of pair) {
    const bruto = achar(json, c.sq);
    assert(bruto, uf + " candidato " + c.sq);
    assert(c.vap === String(bruto.vap), uf + " vap " + c.nome);
    assert(c.pvap === String(bruto.pvap), uf + " pvap " + c.nome);
  }
  relatorio.push({
    uf: uf.toUpperCase(),
    pst: scope.pst,
    dg: scope.dg + " " + scope.hg,
    c1: pair[0].nome + " " + pair[0].pvap + "% " + Number(pair[0].vap).toLocaleString("pt-BR"),
    c2: pair[1].nome + " " + pair[1].pvap + "% " + Number(pair[1].vap).toLocaleString("pt-BR"),
    brancos: scope.brancos.p + "% " + Number(scope.brancos.n).toLocaleString("pt-BR"),
    nulos: scope.nulos.p + "% " + Number(scope.nulos.n).toLocaleString("pt-BR"),
    abst: scope.abstencao.p + "% " + Number(scope.abstencao.n).toLocaleString("pt-BR"),
    cor: model.colorFor(scope, pair),
  });
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

console.log(JSON.stringify({ code: config.code, selection: config.selection, relatorio }, null, 2));
console.log("OK");
