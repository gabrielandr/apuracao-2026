/**
 * Série de atualizações oficiais do Brasil.
 * Cada ponto guarda só dg, hg, pst e, por candidato, nome, pvap e vap.
 * A variação em pontos percentuais é conta de exibição: não entra no arquivo.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ApuracaoHistorico = api;
})(typeof self !== "undefined" ? self : this, function () {
  function num(value) {
    if (value == null || value === "") return null;
    const n = Number(String(value).trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  function chave(ponto) {
    return String(ponto.dg) + "|" + String(ponto.hg);
  }

  function instante(dg, hg) {
    const data = String(dg || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const hora = String(hg || "").match(/^(\d{2}):(\d{2}):(\d{2})$/);
    if (!data || !hora) return null;
    const dia = Number(data[1]);
    const mes = Number(data[2]);
    const ano = Number(data[3]);
    const hh = Number(hora[1]);
    const mm = Number(hora[2]);
    const ss = Number(hora[3]);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    if (hh > 23 || mm > 59 || ss > 59) return null;
    return Date.UTC(ano, mes - 1, dia, hh, mm, ss);
  }

  function candidatoOficial(cand) {
    if (!cand || typeof cand !== "object") return null;
    const nome = cand.nome == null ? "" : String(cand.nome);
    const pvap = cand.pvap == null ? "" : String(cand.pvap);
    const vap = cand.vap == null ? "" : String(cand.vap);
    if (!nome.trim() || !pvap.trim() || !/^\d+$/.test(vap)) return null;
    const pvapN = num(pvap);
    if (pvapN == null || pvapN < 0 || pvapN > 100) return null;
    return { nome: nome, pvap: pvap, vap: vap };
  }

  function pontoOficial(scope, pair) {
    if (!scope || !pair || pair.length !== 2) return null;
    const candidatos = [];
    for (let i = 0; i < pair.length; i += 1) {
      const item = candidatoOficial(pair[i]);
      if (!item) return null;
      candidatos.push(item);
    }
    const ponto = {
      dg: scope.dg == null ? "" : String(scope.dg),
      hg: scope.hg == null ? "" : String(scope.hg),
      pst: scope.pst == null ? "" : String(scope.pst),
      candidatos: candidatos,
    };
    return pontoValido(ponto) ? ponto : null;
  }

  function pontoValido(ponto) {
    if (!ponto || typeof ponto !== "object" || Array.isArray(ponto)) return false;
    const chaves = Object.keys(ponto);
    if (chaves.length !== 4) return false;
    if (chaves.indexOf("dg") === -1 || chaves.indexOf("hg") === -1 || chaves.indexOf("pst") === -1 || chaves.indexOf("candidatos") === -1) {
      return false;
    }
    if (instante(ponto.dg, ponto.hg) == null) return false;
    const pstN = num(ponto.pst);
    if (pstN == null || pstN < 0 || pstN > 100) return false;
    if (!Array.isArray(ponto.candidatos) || ponto.candidatos.length !== 2) return false;
    for (let i = 0; i < ponto.candidatos.length; i += 1) {
      const cand = ponto.candidatos[i];
      if (!cand || typeof cand !== "object" || Array.isArray(cand)) return false;
      const campos = Object.keys(cand);
      if (campos.length !== 3 || campos.indexOf("nome") === -1 || campos.indexOf("pvap") === -1 || campos.indexOf("vap") === -1) {
        return false;
      }
      if (!candidatoOficial(cand)) return false;
    }
    return true;
  }

  function copiar(ponto) {
    return {
      dg: String(ponto.dg),
      hg: String(ponto.hg),
      pst: String(ponto.pst),
      candidatos: ponto.candidatos.map(function (cand) {
        return { nome: String(cand.nome), pvap: String(cand.pvap), vap: String(cand.vap) };
      }),
    };
  }

  function normalizar(pontos) {
    const acc = [];
    (pontos || []).forEach(function (ponto) {
      if (!pontoValido(ponto)) return;
      const quando = instante(ponto.dg, ponto.hg);
      if (acc.some(function (item) { return chave(item) === chave(ponto); })) return;
      if (acc.length) {
        const fim = instante(acc[acc.length - 1].dg, acc[acc.length - 1].hg);
        if (fim != null && quando <= fim) return;
      }
      acc.push(copiar(ponto));
    });
    return acc;
  }

  function mesclar(pontos, ponto) {
    const lista = (pontos || []).slice();
    if (ponto) lista.push(ponto);
    return normalizar(lista);
  }

  function formatDelta(anterior, atual) {
    const a = num(anterior);
    const b = num(atual);
    if (a == null || b == null) return "";
    const delta = Math.round((b - a) * 100) / 100;
    const texto = Math.abs(delta).toFixed(2).replace(".", ",");
    if (delta > 0) return "+" + texto + " p.p.";
    if (delta < 0) return "-" + texto + " p.p.";
    return "0,00 p.p.";
  }

  function mesmoCandidato(a, b, ladoDe) {
    const ladoA = ladoDe(a.nome);
    const ladoB = ladoDe(b.nome);
    if (ladoA !== "outro" && ladoA === ladoB) return true;
    return a.nome === b.nome;
  }

  function anotar(pontos, ladoDe) {
    const serie = normalizar(pontos);
    return serie.map(function (ponto, index) {
      const anterior = index > 0 ? serie[index - 1] : null;
      return {
        dg: ponto.dg,
        hg: ponto.hg,
        pst: ponto.pst,
        pstN: num(ponto.pst),
        candidatos: ponto.candidatos.map(function (cand) {
          const previo = anterior
            ? anterior.candidatos.find(function (item) { return mesmoCandidato(item, cand, ladoDe); })
            : null;
          return {
            nome: cand.nome,
            pvap: cand.pvap,
            vap: cand.vap,
            pvapN: num(cand.pvap),
            lado: ladoDe(cand.nome),
            delta: previo ? formatDelta(previo.pvap, cand.pvap) : "",
            primeiro: !previo,
          };
        }),
      };
    });
  }

  return {
    num: num,
    chave: chave,
    instante: instante,
    pontoOficial: pontoOficial,
    pontoValido: pontoValido,
    normalizar: normalizar,
    mesclar: mesclar,
    formatDelta: formatDelta,
    anotar: anotar,
  };
});
