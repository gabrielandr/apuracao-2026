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
      validos: json && json.v && json.v.vv != null ? String(json.v.vv) : "",
      candidates,
    };
  }

  const REGIOES = [
    { id: "norte", nome: "Norte", ufs: ["ac", "ap", "am", "pa", "ro", "rr", "to"] },
    { id: "nordeste", nome: "Nordeste", ufs: ["al", "ba", "ce", "ma", "pb", "pe", "pi", "rn", "se"] },
    { id: "centro-oeste", nome: "Centro-Oeste", ufs: ["df", "go", "ms", "mt"] },
    { id: "sudeste", nome: "Sudeste", ufs: ["es", "mg", "rj", "sp"] },
    { id: "sul", nome: "Sul", ufs: ["pr", "rs", "sc"] },
  ];

  function inteiroOficial(value) {
    if (value == null || value === "") return null;
    const texto = String(value).trim();
    if (!/^\d+$/.test(texto)) return null;
    return Number(texto);
  }

  function centesimosDe(parte, total) {
    if (parte == null || total == null || total <= 0 || parte < 0) return null;
    return Math.floor((parte * 10000 + Math.floor(total / 2)) / total);
  }

  function formatCentesimos(centesimos) {
    if (centesimos == null) return "—";
    const abs = Math.abs(centesimos);
    const inteiro = Math.floor(abs / 100);
    const frac = String(abs % 100).padStart(2, "0");
    return (centesimos < 0 ? "-" : "") + inteiro + "," + frac + "%";
  }

  function agregarRegiao(regiao, scopes, pair) {
    const base = {
      id: regiao.id,
      nome: regiao.nome,
      ufs: regiao.ufs.slice(),
      completa: false,
      candidatos: [],
      lider: "",
      urnasCentesimos: null,
      validos: null,
      secoesTotalizadas: null,
      secoesTotal: null,
    };
    if (!pair || pair.length !== 2 || !scopes || scopes.length !== regiao.ufs.length) return base;
    let st = 0;
    let ts = 0;
    let validos = 0;
    const votos = [0, 0];
    for (let i = 0; i < scopes.length; i += 1) {
      const scope = scopes[i];
      if (!scope) return base;
      const totalizadas = inteiroOficial(scope.secoesTotalizadas);
      const total = inteiroOficial(scope.secoesTotal);
      const vv = inteiroOficial(scope.validos);
      const alinhados = alignPair(scope, pair);
      const vap0 = alinhados[0] ? inteiroOficial(alinhados[0].vap) : null;
      const vap1 = alinhados[1] ? inteiroOficial(alinhados[1].vap) : null;
      if (totalizadas == null || total == null || vv == null || vap0 == null || vap1 == null) return base;
      st += totalizadas;
      ts += total;
      validos += vv;
      votos[0] += vap0;
      votos[1] += vap1;
    }
    const candidatos = [0, 1].map(function (i) {
      return {
        nome: pair[i].nome,
        lado: pair[i].lado,
        vap: votos[i],
        centesimos: centesimosDe(votos[i], validos),
      };
    });
    candidatos.sort(function (a, b) { return b.vap - a.vap; });
    return {
      id: regiao.id,
      nome: regiao.nome,
      ufs: regiao.ufs.slice(),
      completa: true,
      candidatos: candidatos,
      lider: candidatos[0].vap > candidatos[1].vap ? candidatos[0].lado : "",
      urnasCentesimos: centesimosDe(st, ts),
      validos: validos,
      secoesTotalizadas: st,
      secoesTotal: ts,
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

  function pvapCentesimos(oficial) {
    const valor = num(oficial);
    if (valor == null) return null;
    return Math.round(valor * 100);
  }

  function formatPontos(delta) {
    if (delta == null) return "";
    const corpo = formatCentesimos(Math.abs(delta)).replace("%", "");
    if (delta > 0) return "+" + corpo + " p.p.";
    if (delta < 0) return "−" + corpo + " p.p.";
    return "0,00 p.p.";
  }

  function variacaoTurno(entrada) {
    const code = String((entrada && entrada.code) || "");
    const numeros = (entrada && entrada.numeros) || [];
    const atuais = (entrada && entrada.atuais) || [];
    const base = (entrada && entrada.base) || [];
    const pstN = entrada ? entrada.pstN : null;
    let situacao = "apurando";
    if (code !== "6258") situacao = "antes";
    else if (pstN == null || pstN <= 0) situacao = "aguardando";
    const linhas = numeros.map(function (numero) {
      const n = String(numero);
      const atual = atuais.find(function (c) { return c && String(c.n) === n; }) || null;
      const anterior = base.find(function (c) { return c && String(c.n) === n; }) || null;
      const pvapAtual = atual && atual.pvap != null && atual.pvap !== "" ? String(atual.pvap) : "";
      const pvapPrimeiro = situacao === "antes"
        ? pvapAtual
        : (anterior && anterior.pvap != null && anterior.pvap !== "" ? String(anterior.pvap) : "");
      let delta = null;
      if (situacao === "apurando" && pvapAtual && pvapPrimeiro) {
        const origem = pvapCentesimos(pvapPrimeiro);
        const agora = pvapCentesimos(pvapAtual);
        if (origem != null && agora != null) delta = agora - origem;
      }
      return {
        n: n,
        pvapAtual: situacao === "apurando" ? pvapAtual : "",
        pvapPrimeiro: pvapPrimeiro,
        delta: delta,
        sinal: delta == null ? "" : delta > 0 ? "alta" : delta < 0 ? "queda" : "neutro",
      };
    });
    return { situacao: situacao, linhas: linhas };
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
    REGIOES: REGIOES,
    inteiroOficial: inteiroOficial,
    centesimosDe: centesimosDe,
    formatCentesimos: formatCentesimos,
    agregarRegiao: agregarRegiao,
    pvapCentesimos: pvapCentesimos,
    formatPontos: formatPontos,
    variacaoTurno: variacaoTurno,
  };
});
