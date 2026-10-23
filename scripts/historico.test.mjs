import fs from "node:fs";
import vm from "node:vm";

const modelCode = fs.readFileSync(new URL("../js/model.js", import.meta.url), "utf8");
const modelBox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(modelCode, modelBox);
const model = modelBox.module.exports;

const histCode = fs.readFileSync(new URL("../js/historico.js", import.meta.url), "utf8");
const histBox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(histCode, histBox);
const historico = histBox.module.exports;

const graficoCode = fs.readFileSync(new URL("../js/grafico.js", import.meta.url), "utf8");
const graficoBox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(graficoCode, graficoBox);
const grafico = graficoBox.module.exports;

const configCode = fs.readFileSync(new URL("../js/config.js", import.meta.url), "utf8");
const configBox = { window: {} };
vm.runInNewContext(configCode, configBox);
const config = configBox.window.APURACAO;

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

assert(historico.formatDelta("48,00", "48,12") === "+0,12 p.p.", "alta de 0,12 ponto");
assert(historico.formatDelta("46,00", "45,90") === "-0,10 p.p.", "queda de 0,10 ponto");
assert(historico.formatDelta("47,03", "47,03") === "0,00 p.p.", "sem variação");

const scope = {
  dg: "05/10/2026",
  hg: "12:51:47",
  pst: "100,00",
  candidates: [],
};
const pair = [
  { nome: "FLAVIO BOLSONARO", pvap: "47,03", vap: "56104503", pvapN: 47.03, sq: "280002551544", partido: "PL", lado: "flavio" },
  { nome: "LULA", pvap: "45,16", vap: "53879538", pvapN: 45.16, sq: "280002542548", partido: "PT", lado: "lula" },
];
const oficial = historico.pontoOficial(scope, pair);
assert(oficial, "ponto oficial");
assert(Object.keys(oficial).join(",") === "dg,hg,pst,candidatos", "só campos do ponto");
assert(Object.keys(oficial.candidatos[0]).join(",") === "nome,pvap,vap", "só campos do candidato");
assert(oficial.dg === "05/10/2026" && oficial.hg === "12:51:47" && oficial.pst === "100,00", "textos oficiais");
assert(!JSON.stringify(oficial).includes("280002551544"), "não guarda sqcand");
assert(!JSON.stringify(oficial).includes("pvapN"), "não guarda número calculado");

const sujo = {
  dg: "25/10/2026",
  hg: "17:00:00",
  pst: "1,00",
  inventado: true,
  candidatos: [
    { nome: "FLAVIO BOLSONARO", pvap: "1,00", vap: "10" },
    { nome: "LULA", pvap: "1,00", vap: "10" },
  ],
};
assert(historico.pontoValido(sujo) === false, "campo inventado invalida o ponto");
assert(historico.mesclar([], sujo).length === 0, "não entra ponto inválido");

// EXEMPLO — não é série oficial. Estes horários e percentuais são fictícios
// e existem só neste teste. Não são gravados em data/.
const exemplo = {
  aviso: "EXEMPLO — não é série oficial",
  pontos: [
    {
      dg: "25/10/2026",
      hg: "17:05:00",
      pst: "1,00",
      candidatos: [
        { nome: "FLAVIO BOLSONARO", pvap: "48,00", vap: "1000" },
        { nome: "LULA", pvap: "46,00", vap: "900" },
      ],
    },
    {
      dg: "25/10/2026",
      hg: "17:10:00",
      pst: "12,00",
      candidatos: [
        { nome: "FLAVIO BOLSONARO", pvap: "48,12", vap: "12000" },
        { nome: "LULA", pvap: "45,90", vap: "11000" },
      ],
    },
    {
      dg: "25/10/2026",
      hg: "17:15:00",
      pst: "28,50",
      candidatos: [
        { nome: "FLAVIO BOLSONARO", pvap: "47,80", vap: "28000" },
        { nome: "LULA", pvap: "46,40", vap: "27000" },
      ],
    },
  ],
};
assert(exemplo.aviso === "EXEMPLO — não é série oficial", "fixture marcada como exemplo");
assert(exemplo.pontos.every(historico.pontoValido), "exemplo tem a forma oficial");

const base = historico.mesclar([], exemplo.pontos[0]);
assert(base.length === 1, "primeiro ponto entra");
assert(historico.mesclar(base, exemplo.pontos[0]).length === 1, "não duplica dg+hg");
assert(historico.mesclar(base, exemplo.pontos[1]).length === 2, "ponto mais novo entra");
const repetido = historico.mesclar([exemplo.pontos[0], exemplo.pontos[1]], exemplo.pontos[1]);
assert(repetido.length === 2, "repetir o último não duplica");
const antigo = historico.mesclar([exemplo.pontos[1]], exemplo.pontos[0]);
assert(antigo.length === 1 && antigo[0].hg === "17:10:00", "ponto mais antigo não é inserido");
const tres = historico.mesclar([exemplo.pontos[0], exemplo.pontos[1]], exemplo.pontos[2]);
assert(tres.length === 3, "terceiro ponto entra no fim");

const anotado = historico.anotar(exemplo.pontos, model.ladoDe);
assert(anotado[0].candidatos[0].primeiro === true, "primeiro ponto não tem variação");
assert(anotado[0].candidatos[0].delta === "", "delta vazio no primeiro");
const flavio2 = anotado[1].candidatos.find(function (c) { return c.lado === "flavio"; });
const lula2 = anotado[1].candidatos.find(function (c) { return c.lado === "lula"; });
assert(flavio2.delta === "+0,12 p.p.", "Flávio sobe 0,12 no exemplo");
assert(lula2.delta === "-0,10 p.p.", "Lula cai 0,10 no exemplo");
assert(anotado[2].candidatos.find(function (c) { return c.lado === "flavio"; }).delta === "-0,32 p.p.", "queda seguinte");

const desenho = grafico.layout(anotado);
const serieFlavio = desenho.series.find(function (s) { return s.lado === "flavio"; });
const serieLula = desenho.series.find(function (s) { return s.lado === "lula"; });
assert(serieFlavio.cor === "#4040fb", "cor do Flávio");
assert(serieLula.cor === "#bb0b0b", "cor do Lula");
assert(serieFlavio.pontos[1].x > serieFlavio.pontos[0].x, "X acompanha as urnas apuradas");
assert(serieFlavio.pontos[2].x > serieFlavio.pontos[1].x, "X segue crescente");
assert(serieFlavio.pontos[1].y < serieFlavio.pontos[0].y, "alta de pvap sobe no gráfico");
assert(serieLula.pontos[1].y > serieLula.pontos[0].y, "queda de pvap desce no gráfico");
assert(serieFlavio.pontos[0].x < desenho.plot.x + desenho.plot.w * 0.05, "1% de urnas fica no começo do eixo");

const destino = new URL("../data/historico-" + config.code + ".json", import.meta.url);
assert(!fs.existsSync(destino), "o teste não grava data/historico");

const url = model.fileUrl(config, "br");
const response = await fetch(url);
if (!response.ok) throw new Error(url + " -> " + response.status);
const json = await response.json();
const aoVivo = model.parseScope(json);
const par = model.selectPair(aoVivo.candidates, config.selection);
const real = historico.pontoOficial(aoVivo, par);
assert(historico.pontoValido(real), "ponto real válido");
assert(real.dg === String(json.dg) && real.hg === String(json.hg), "horário real");
assert(real.pst === String(json.s.pst), "pst real");
real.candidatos.forEach(function (cand) {
  assert(Object.keys(cand).join(",") === "nome,pvap,vap", "candidato real sem campo extra");
  const bruto = achar(json, cand.nome);
  assert(bruto, "nome publicado " + cand.nome);
  assert(cand.pvap === String(bruto.pvap) && cand.vap === String(bruto.vap), "pvap e vap idênticos ao JSON");
});
assert(real.candidatos.some(function (c) { return c.nome.indexOf("LULA") !== -1 && c.pvap === "45,16" && c.vap === "53879538"; }), "Lula no ponto real");
assert(real.candidatos.some(function (c) { return c.nome.indexOf("FLAVIO") !== -1 && c.pvap === "47,03" && c.vap === "56104503"; }), "Flávio no ponto real");
assert(historico.mesclar([real], real).length === 1, "o ponto real não duplica");

function achar(payload, nome) {
  for (const agr of payload.carg[0].agr || []) {
    for (const par of agr.par || []) {
      for (const cand of par.cand || []) {
        if ((cand.nmu || cand.nm) === nome) return cand;
      }
    }
  }
  return null;
}

console.log("OK historico " + real.dg + " " + real.hg + " pst " + real.pst);
