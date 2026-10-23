import fs from "node:fs";
import vm from "node:vm";

const noitePath = process.argv[2];
const linhaPath = process.argv[3];
const destino = new URL("../data/primeiro-turno-parciais.json", import.meta.url);
if (!noitePath || !linhaPath) {
  console.error("uso: node scripts/gerar-parciais.mjs noite_regioes.json linha_do_tempo.json");
  process.exit(1);
}

const modelCode = fs.readFileSync(new URL("../js/model.js", import.meta.url), "utf8");
const modelBox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(modelCode, modelBox);
const model = modelBox.module.exports;

const IDS = {
  Norte: "norte",
  Nordeste: "nordeste",
  "Centro-Oeste": "centro-oeste",
  Sudeste: "sudeste",
  Sul: "sul",
};

function pstCentesimos(pst) {
  if (pst == null || !Number.isFinite(Number(pst)) || Number(pst) <= 0) return null;
  return Math.round(Number(pst) * 100);
}

function serieDe(linhas, ler) {
  const porPst = new Map();
  const ordem = [];
  linhas.forEach(function (row) {
    const lido = ler(row);
    if (!lido) return;
    const pst = pstCentesimos(lido.pst);
    const flavio = model.centesimosDe(lido.flavio, lido.vv);
    const lula = model.centesimosDe(lido.lula, lido.vv);
    if (pst == null || pst <= 0 || pst > 10000 || flavio == null || lula == null) return;
    if (!porPst.has(pst)) ordem.push(pst);
    porPst.set(pst, [pst, flavio, lula, lido.vv, lido.flavio, lido.lula]);
  });
  ordem.sort(function (a, b) { return a - b; });
  const pontos = ordem.map(function (pst) {
    const item = porPst.get(pst);
    return [item[0], item[1], item[2]];
  });
  const ultimo = porPst.get(ordem[ordem.length - 1]);
  return {
    pontos: pontos,
    fim: ultimo
      ? { vv: ultimo[3], flavio: ultimo[4], lula: ultimo[5] }
      : null,
  };
}

const noite = JSON.parse(fs.readFileSync(noitePath, "utf8"));
const linha = JSON.parse(fs.readFileSync(linhaPath, "utf8"));

const vCols = linha.nacional.versoes.colunas;
const vIdx = Object.fromEntries(vCols.map(function (nome, i) { return [nome, i]; }));
const versoes = linha.nacional.versoes.linhas
  .filter(function (row) { return row[vIdx.marcada_regressiva] !== true; })
  .slice()
  .sort(function (a, b) { return String(a[vIdx.gerado_em]).localeCompare(String(b[vIdx.gerado_em])); });
const nacional = serieDe(versoes, function (row) {
  return {
    pst: row[vIdx.pst],
    vv: row[vIdx.vv],
    flavio: row[vIdx.flavio],
    lula: row[vIdx.lula],
  };
});

const mCols = noite.minutos.colunas;
const mIdx = Object.fromEntries(mCols.map(function (nome, i) { return [nome, i]; }));
const porRegiao = {};
noite.minutos.linhas.forEach(function (row) {
  const nome = row[mIdx.regiao];
  if (!IDS[nome]) return;
  if (!porRegiao[nome]) porRegiao[nome] = [];
  porRegiao[nome].push(row);
});

const serie = { br: nacional.pontos };
const fim = { br: nacional.fim };
Object.keys(IDS).forEach(function (nome) {
  const id = IDS[nome];
  const feito = serieDe(porRegiao[nome] || [], function (row) {
    return {
      pst: row[mIdx.pst],
      vv: row[mIdx.vv],
      flavio: row[mIdx.flavio],
      lula: row[mIdx.lula],
    };
  });
  serie[id] = feito.pontos;
  fim[id] = feito.fim;
});

const primeiro = JSON.parse(fs.readFileSync(new URL("../data/primeiro-turno.json", import.meta.url), "utf8"));
function vapOficial(uf, n) {
  const cand = primeiro.recortes[uf].candidatos.find(function (item) { return item.n === n; });
  if (!cand) throw new Error("sem candidato " + n + " em " + uf);
  return Number(cand.vap);
}
const oficialBr = {
  flavio: vapOficial("br", "22"),
  lula: vapOficial("br", "13"),
};
if (fim.br.flavio !== oficialBr.flavio || fim.br.lula !== oficialBr.lula) {
  throw new Error("votos nacionais finais não batem com primeiro-turno.json");
}
if (serie.br[serie.br.length - 1][1] !== model.pvapCentesimos("47,03") || serie.br[serie.br.length - 1][2] !== model.pvapCentesimos("45,16")) {
  throw new Error("percentual nacional final não bate com o pvap oficial");
}
model.REGIOES.forEach(function (regiao) {
  const f = regiao.ufs.reduce(function (total, uf) { return total + vapOficial(uf, "22"); }, 0);
  const l = regiao.ufs.reduce(function (total, uf) { return total + vapOficial(uf, "13"); }, 0);
  if (fim[regiao.id].flavio !== f || fim[regiao.id].lula !== l) {
    throw new Error("votos finais de " + regiao.nome + " não batem com primeiro-turno.json");
  }
  const ultimo = serie[regiao.id][serie[regiao.id].length - 1];
  if (ultimo[0] !== 10000) throw new Error(regiao.nome + " não termina em 100%");
  if (ultimo[1] !== model.centesimosDe(f, fim[regiao.id].vv) || ultimo[2] !== model.centesimosDe(l, fim[regiao.id].vv)) {
    throw new Error("percentual final de " + regiao.nome + " não sai dos votos");
  }
});

const doc = {
  eleicao: "6257",
  fonte: "ArvorCo/PNAD: captura de terceiros dos arquivos oficiais do TSE (eleição 6257). O nacional reúne as versões do arquivo do Brasil; cada região, a soma dos arquivos das UFs, sem o Exterior.",
  nota: "Percentuais recalculados como votos do candidato divididos pelos votos válidos. A ordem em que as urnas entram difere entre os turnos; comparar na mesma porcentagem apurada é uma aproximação.",
  colunas: ["pst", "flavio", "lula"],
  unidade: "centesimos",
  serie: serie,
  fim: fim,
};
fs.writeFileSync(destino, JSON.stringify(doc) + "\n");
const bytes = fs.statSync(destino).size;
console.log("OK parciais " + bytes + " bytes");
Object.keys(serie).forEach(function (id) {
  const ultimo = serie[id][serie[id].length - 1];
  console.log(id, serie[id].length, "fim", ultimo.join(","));
});
