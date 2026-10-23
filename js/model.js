/**
 * Leitura dos arquivos EA20 (resultado unificado, sufixo -u.json).
 * Não calcula voto: percentuais exibidos saem dos campos oficiais.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ApuracaoModel = api;
})(typeof self !== "undefined" ? self : this, function () {
  const UFS = [
    "ac", "al", "am", "ap", "ba", "ce", "df", "es", "go", "ma", "mg", "ms",
    "mt", "pa", "pb", "pe", "pi", "pr", "rj", "rn", "ro", "rr", "rs", "sc",
    "se", "sp", "to",
  ];

  const NOMES = {
    br: "Brasil",
    zz: "Exterior",
    ac: "Acre",
    al: "Alagoas",
    am: "Amazonas",
    ap: "Amapá",
    ba: "Bahia",
    ce: "Ceará",
    df: "Distrito Federal",
    es: "Espírito Santo",
    go: "Goiás",
    ma: "Maranhão",
    mg: "Minas Gerais",
    ms: "Mato Grosso do Sul",
    mt: "Mato Grosso",
    pa: "Pará",
    pb: "Paraíba",
    pe: "Pernambuco",
    pi: "Piauí",
    pr: "Paraná",
    rj: "Rio de Janeiro",
    rn: "Rio Grande do Norte",
    ro: "Rondônia",
    rr: "Roraima",
    rs: "Rio Grande do Sul",
    sc: "Santa Catarina",
    se: "Sergipe",
    sp: "São Paulo",
    to: "Tocantins",
  };

  function num(value) {
    if (value == null || value === "") return null;
    const n = Number(String(value).trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  function ladoDe(nome, partido) {
    const normalizado = String(nome || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
    const sigla = String(partido || "").toUpperCase();
    if (normalizado.includes("LULA")) return "lula";
    if (normalizado.includes("FLAVIO") || normalizado.includes("BOLSONARO")) return "flavio";
    if (sigla === "PT") return "lula";
    if (sigla === "PL") return "flavio";
    return "outro";
  }

  function fileUrl(config, uf) {
    const cargo = String(config.cargo).padStart(4, "0");
    const ele = String(config.code).padStart(6, "0");
    const abrangencia = String(uf).toLowerCase();
    return (
      config.base +
      "/" +
      config.ambiente +
      "/" +
      config.cycle +
      "/" +
      config.code +
      "/dados/" +
      abrangencia +
      "/" +
      abrangencia +
      "-c" +
      cargo +
      "-e" +
      ele +
      "-u.json"
    );
  }

  function photoUrl(config, sq) {
    if (!/^\d+$/.test(String(sq || ""))) return "";
    return (
      config.base +
      "/" +
      config.ambiente +
      "/" +
      config.cycle +
      "/" +
      config.code +
      "/fotos/br/" +
      sq +
      ".jpeg"
    );
  }

  function parseScope(json) {
    const candidates = [];
    const cargo = json && json.carg && json.carg[0];
    for (const agr of (cargo && cargo.agr) || []) {
      for (const par of agr.par || []) {
        for (const cand of par.cand || []) {
          candidates.push({
            n: String(cand.n || ""),
            sq: String(cand.sqcand || ""),
            nome: cand.nmu || cand.nm || "Candidato",
            partido: par.sg || "",
            vap: cand.vap == null ? "" : String(cand.vap),
            vapN: num(cand.vap) || 0,
            pvap: cand.pvap == null ? "" : String(cand.pvap),
            pvapN: num(cand.pvapn != null && cand.pvapn !== "" ? cand.pvapn : cand.pvap),
            st: cand.st || "",
            lado: ladoDe(cand.nmu || cand.nm, par.sg),
          });
        }
      }
    }
    return {
      uf: String((json && json.cdabr) || "").toLowerCase(),
      turno: json ? String(json.t || "") : "",
      eleicao: json ? String(json.ele || "") : "",
      dg: (json && json.dg) || "",
      hg: (json && json.hg) || "",
      andamento: (json && json.and) || "",
      pst: json && json.s ? String(json.s.pst ?? "") : "",
      pstN: json && json.s ? num(json.s.pst) : null,
      secoesTotalizadas: json && json.s ? String(json.s.st ?? "") : "",
      secoesTotal: json && json.s ? String(json.s.ts ?? "") : "",
      brancos: {
        n: json && json.v ? String(json.v.vb ?? "") : "",
        p: json && json.v ? String(json.v.pvb ?? "") : "",
      },
      nulos: {
        n: json && json.v ? String(json.v.tvn ?? "") : "",
        p: json && json.v ? String(json.v.ptvn ?? "") : "",
      },
      abstencao: {
        n: json && json.e ? String(json.e.a ?? "") : "",
        p: json && json.e ? String(json.e.pa ?? "") : "",
      },
      candidates,
    };
  }

  function selectPair(candidates, selection) {
    const byVotes = candidates.slice().sort(function (a, b) {
      return b.vapN - a.vapN || a.nome.localeCompare(b.nome, "pt");
    });
    if (selection === "runoff") {
      const classificados = candidates.filter(function (c) {
        return /turno/i.test(c.st || "");
      });
      if (classificados.length >= 2) {
        return classificados
          .slice()
          .sort(function (a, b) {
            return b.vapN - a.vapN;
          })
          .slice(0, 2);
      }
      if (candidates.length <= 2) return byVotes;
    }
    return byVotes.slice(0, 2);
  }

  function alignPair(scope, nationalPair) {
    return nationalPair.map(function (ref) {
      return (
        scope.candidates.find(function (c) {
          return ref.sq && c.sq === ref.sq;
        }) ||
        scope.candidates.find(function (c) {
          return ref.n && c.n === ref.n;
        }) ||
        null
      );
    });
  }

  function colorFor(scope, pair) {
    if (!scope || scope.pstN == null || scope.pstN <= 0) return "neutro";
    if (!pair || !pair[0] || !pair[1]) return "neutro";
    const a = pair[0];
    const b = pair[1];
    if (!Number.isFinite(a.pvapN) || !Number.isFinite(b.pvapN)) return "neutro";
    const diff = Math.abs(a.pvapN - b.pvapN);
    if (diff < 2) return "gelo";
    const leader = a.pvapN > b.pvapN ? a : b;
    if (leader.lado !== "lula" && leader.lado !== "flavio") return "gelo";
    const tom = diff >= 20 ? "3" : diff >= 10 ? "2" : "1";
    return leader.lado + "-" + tom;
  }

  function formatInt(value) {
    if (value == null || value === "") return "—";
    const n = Number(String(value).replace(",", "."));
    if (!Number.isFinite(n)) return "—";
    return Math.round(n).toLocaleString("pt-BR");
  }

  function formatPct(official) {
    if (official == null || official === "") return "—";
    const text = String(official).trim();
    return text.includes("%") ? text : text + "%";
  }

  function compactPct(official) {
    if (official == null || official === "") return "—";
    let text = String(official).trim().replace("%", "");
    if (text.includes(",")) text = text.replace(/0+$/, "").replace(/,$/, "");
    if (!text) text = "0";
    return text + "%";
  }

  return {
    UFS: UFS,
    NOMES: NOMES,
    num: num,
    ladoDe: ladoDe,
    fileUrl: fileUrl,
    photoUrl: photoUrl,
    parseScope: parseScope,
    selectPair: selectPair,
    alignPair: alignPair,
    colorFor: colorFor,
    formatInt: formatInt,
    formatPct: formatPct,
    compactPct: compactPct,
  };
});
