(function () {
  const config = window.APURACAO;
  const model = window.ApuracaoModel;
  const CACHE_KEY = "apuracao-2026:" + config.code;

  const aviso = document.getElementById("aviso");
  const titulo = document.getElementById("titulo-escopo");
  const subtitulo = document.getElementById("subtitulo");
  const nota = document.getElementById("nota-teste");
  const pstEl = document.getElementById("pst");
  const secoesEl = document.getElementById("secoes");
  const atualizacaoEl = document.getElementById("atualizacao");
  const consultaEl = document.getElementById("consulta");
  const painel = document.getElementById("painel");
  const mapa = document.getElementById("mapa");
  const seletor = document.getElementById("recorte");
  const fonte = document.getElementById("fonte");
  const linkTse = document.getElementById("link-tse");
  const dot = document.getElementById("dot");
  const graficoEl = document.getElementById("grafico");
  const graficoLegenda = document.getElementById("grafico-legenda");
  const graficoTabela = document.getElementById("grafico-tabela");
  const graficoOrigem = document.getElementById("grafico-origem");
  const graficoLeitura = document.getElementById("grafico-leitura");
  const graficoTitulo = document.getElementById("grafico-titulo");
  const graficoNota = document.getElementById("grafico-nota");
  const notaRegioes = document.getElementById("nota-regioes");
  const abaSegundo = document.getElementById("aba-segundo");
  const abaPrimeiro = document.getElementById("aba-primeiro");
  const secaoVariacao = document.querySelector(".variacao");
  const variacaoTitulo = document.getElementById("variacao-titulo");
  const variacaoEstado = document.getElementById("variacao-estado");
  const variacaoLista = document.getElementById("variacao-lista");
  const simulacaoEl = document.getElementById("simulacao");

  const historicoApi = window.ApuracaoHistorico;
  const graficoApi = window.ApuracaoGrafico;
  const memory = Object.create(null);
  const memory1 = Object.create(null);
  let historicoArquivo = [];
  let historicoEstado = "vazio";
  let primeiroTurno = null;
  let parciais = null;
  let inflight = false;
  let primeiroOficialEstado = "vazio";
  let carregando1 = null;
  let lastAttemptOk = false;
  let failedUfs = [];

  function cacheRead() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function cacheWrite() {
    const files = {};
    Object.keys(memory).forEach(function (uf) {
      if (memory[uf] && memory[uf].json) {
        files[uf] = { json: memory[uf].json, savedAt: memory[uf].savedAt };
      }
    });
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ files: files }));
    } catch (err) {
      /* cota do navegador cheia: a tela segue com a memória desta aba */
    }
  }

  function hydrate() {
    const cached = cacheRead();
    if (!cached || !cached.files) return;
    Object.keys(cached.files).forEach(function (uf) {
      const entry = cached.files[uf];
      if (entry && entry.json) {
        memory[uf] = { json: entry.json, savedAt: entry.savedAt, fromCache: true };
      }
    });
  }

  function scopeOf(uf) {
    const entry = memory[uf];
    return entry && entry.json ? model.parseScope(entry.json) : null;
  }

  function hashLimpo() {
    return location.hash.replace(/^#\/?/, "").toLowerCase();
  }

  function vistaPrimeiro() {
    return /(^|\/)1turno($|\/)/.test(hashLimpo());
  }

  function currentUf() {
    const partes = hashLimpo().split("/").filter(Boolean);
    const hash = partes.filter(function (parte) {
      return parte !== "1turno" && parte !== "2turno" && parte !== "grafico";
    })[0] || "";
    if (!hash || hash === "br" || hash === "brasil") return "br";
    if (hash === "zz" || model.UFS.indexOf(hash) !== -1) return hash;
    return "br";
  }

  function hashDoRecorte(uf, primeiro) {
    if (primeiro) return uf === "br" ? "#1turno" : "#1turno/" + uf;
    return "#/" + uf;
  }

  function arquivoDados(nome) {
    let path = location.pathname;
    if (!path.endsWith("/")) {
      if (path.split("/").pop().indexOf(".") !== -1) path = path.replace(/\/[^/]*$/, "/");
      else path += "/";
    }
    return path + "data/" + nome;
  }

  function arquivoHistorico() {
    return arquivoDados("historico-" + config.code + ".json");
  }

  function simulacaoAtiva() {
    const valor = new URLSearchParams(location.search).get("simular");
    if (valor == null) return false;
    const texto = valor.trim().toLowerCase();
    return texto !== "" && texto !== "0" && texto !== "off" && texto !== "nao" && texto !== "não";
  }

  function atualizarSimulacao() {
    if (!simulacaoAtiva()) {
      simulacaoEl.hidden = true;
      simulacaoEl.textContent = "";
      return;
    }
    simulacaoEl.hidden = false;
    simulacaoEl.textContent =
      "Simulação: a comparação trata um ponto do 1º turno, perto de 50% das urnas, como se fosse o 2º. Não é a apuração oficial. O mapa e os candidatos seguem o arquivo do TSE.";
  }

  async function carregarParciais() {
    try {
      const response = await fetch(arquivoDados("primeiro-turno-parciais.json"), { cache: "no-cache" });
      if (!response.ok) return;
      const json = await response.json();
      if (!json || String(json.eleicao) !== "6257" || !json.serie || !json.serie.br) return;
      parciais = json;
    } catch (err) {
      parciais = null;
    }
  }

  async function carregarPrimeiroTurno() {
    try {
      const response = await fetch(arquivoDados("primeiro-turno.json"), { cache: "no-cache" });
      if (!response.ok) return;
      const json = await response.json();
      if (!json || String(json.eleicao) !== "6257" || !json.recortes) return;
      primeiroTurno = json;
    } catch (err) {
      primeiroTurno = null;
    }
  }

  function configDaTela() {
    if (!vistaPrimeiro()) return config;
    return {
      code: "6257",
      selection: "top2",
      cycle: config.cycle,
      cargo: config.cargo,
      ambiente: config.ambiente,
      base: config.base,
    };
  }

  function scopeTela(uf) {
    if (!vistaPrimeiro()) return scopeOf(uf);
    const entry = memory1[uf];
    return entry && entry.json ? model.parseScope(entry.json) : null;
  }

  function pairVisivel() {
    const brasil = scopeTela("br");
    if (!brasil) return [];
    return model.selectPair(brasil.candidates, configDaTela().selection);
  }

  function pairNoEscopoVisivel(uf) {
    const nacional = pairVisivel();
    const scope = scopeTela(uf);
    if (!scope || !nacional.length) return [];
    if (uf === "br") return nacional;
    return model.alignPair(scope, nacional);
  }

  function pairNacional() {
    const brasil = scopeOf("br");
    if (!brasil) return [];
    return model.selectPair(brasil.candidates, config.selection);
  }

  function pairNoEscopo(uf) {
    const nacional = pairNacional();
    const scope = scopeOf(uf);
    if (!scope || !nacional.length) return [];
    if (uf === "br") return nacional;
    return model.alignPair(scope, nacional);
  }

  async function fetchJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(function () {
      controller.abort();
    }, 12000);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: "default" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadOne(uf) {
    const url = model.fileUrl(config, uf);
    try {
      const json = await fetchJson(url);
      memory[uf] = { json: json, savedAt: Date.now(), fromCache: false };
      return true;
    } catch (err) {
      if (memory[uf]) memory[uf].fromCache = true;
      return false;
    }
  }

  async function carregarHistorico() {
    try {
      const response = await fetch(arquivoHistorico(), { cache: "no-cache" });
      if (response.status === 404) {
        if (historicoEstado !== "ok") {
          historicoArquivo = [];
          historicoEstado = "ausente";
        }
        return;
      }
      if (!response.ok) throw new Error("HTTP " + response.status);
      const json = await response.json();
      if (!json || String(json.eleicao) !== String(config.code)) throw new Error("eleição");
      historicoArquivo = historicoApi.normalizar(json.pontos || []);
      historicoEstado = "ok";
    } catch (err) {
      if (historicoEstado !== "ok") historicoEstado = "erro";
    }
  }

  function serieBrasil() {
    const brasil = scopeOf("br");
    const aoVivo = brasil ? historicoApi.pontoOficial(brasil, pairNacional()) : null;
    return historicoApi.mesclar(historicoArquivo, aoVivo);
  }

  function loadPrimeiroOficial() {
    if (memory1.br) return Promise.resolve();
    if (carregando1) return carregando1;
    const cfg = {
      code: "6257",
      selection: "top2",
      cycle: config.cycle,
      cargo: config.cargo,
      ambiente: config.ambiente,
      base: config.base,
    };
    primeiroOficialEstado = "carregando";
    const alvos = ["br"].concat(model.UFS, ["zz"]);
    carregando1 = Promise.all(alvos.map(function (uf) {
      return fetchJson(model.fileUrl(cfg, uf)).then(function (json) {
        if (!json || String(json.ele) !== "6257") throw new Error("eleição");
        memory1[uf] = { json: json, savedAt: Date.now() };
      }).catch(function () {
        return null;
      });
    })).then(function () {
      primeiroOficialEstado = memory1.br ? "ok" : "erro";
      carregando1 = null;
      if (vistaPrimeiro()) render();
    });
    return carregando1;
  }

  async function loadAll() {
    if (inflight) return;
    inflight = true;
    const alvos = ["br"].concat(model.UFS, ["zz"]);
    if (!scopeOf("br")) setAviso("Carregando os arquivos oficiais do TSE…", "info");
    try {
      const [results] = await Promise.all([
        Promise.all(
          alvos.map(function (uf) {
            return loadOne(uf).then(function (ok) {
              return { uf: uf, ok: ok };
            });
          })
        ),
        carregarHistorico(),
      ]);
      failedUfs = results
        .filter(function (item) {
          return !item.ok;
        })
        .map(function (item) {
          return item.uf;
        });
      lastAttemptOk = failedUfs.length === 0;
      if (results.some(function (item) { return item.ok; })) cacheWrite();
      render();
    } finally {
      inflight = false;
    }
  }

  function setAviso(text, kind) {
    if (!text) {
      aviso.hidden = true;
      aviso.textContent = "";
      aviso.className = "aviso";
      return;
    }
    aviso.hidden = false;
    aviso.className = "aviso " + (kind || "");
    aviso.textContent = text;
  }

  function horarioBrasilia(date) {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      dateStyle: "short",
      timeStyle: "medium",
    }).format(date);
  }

  function renderAviso() {
    if (!scopeOf("br") && failedUfs.indexOf("br") !== -1) {
      setAviso(
        "A fonte oficial do TSE não respondeu e não há leitura anterior neste navegador. Nenhum número foi estimado.",
        "erro"
      );
      dot.className = "dot erro";
      return;
    }
    if (failedUfs.length) {
      const temLeitura = !!scopeOf("br");
      const muitos = failedUfs.length > 4;
      const texto = muitos
        ? temLeitura
          ? "A fonte oficial do TSE não respondeu nesta consulta. A tela mantém a última leitura válida. Nenhum número foi estimado."
          : "A fonte oficial do TSE não respondeu e não há leitura anterior neste navegador. Nenhum número foi estimado."
        : "A fonte oficial não respondeu para " +
          failedUfs
            .map(function (uf) {
              return model.NOMES[uf] || uf.toUpperCase();
            })
            .join(", ") +
          ". Onde já havia leitura, ela foi mantida. Nenhum número foi estimado.";
      setAviso(texto, "erro");
      dot.className = "dot alerta";
      return;
    }
    if (inflight && !scopeOf("br")) {
      setAviso("Carregando os arquivos oficiais do TSE…", "info");
      return;
    }
    setAviso("", "");
    dot.className = lastAttemptOk ? "dot ok" : "dot";
  }

  function apurando(scope) {
    return !!(scope && scope.pstN != null && scope.pstN > 0);
  }

  function textoAtualizacao(scope) {
    if (!scope || !scope.dg || !scope.hg) return "Atualização do TSE indisponível";
    return "Atualização do TSE: " + scope.dg + " às " + scope.hg + " (horário de Brasília)";
  }

  function renderPainel(uf) {
    const scope = scopeTela(uf);
    const cfg = configDaTela();
    const nome = model.NOMES[uf] || uf.toUpperCase();
    titulo.textContent = nome;
    document.title = nome + " · Apuração 2026";
    sincronizarSeletor(uf);
    fonte.href = model.fileUrl(cfg, uf);
    fonte.textContent = "arquivo oficial " + uf + "-c0001-e" + String(cfg.code).padStart(6, "0") + "-u.json";
    linkTse.href =
      "https://resultados.tse.jus.br/oficial/app/index.html#/eleicao/" +
      cfg.code +
      "/uf/" +
      uf +
      "/cargo/1/vis/nominal/resumo-geral";

    if (!scope) {
      subtitulo.textContent = "Aguardando o arquivo oficial.";
      nota.hidden = true;
      pstEl.textContent = "Aguardando";
      pstEl.classList.add("aguardando");
      pstEl.removeAttribute("data-pst");
      secoesEl.textContent = "";
      atualizacaoEl.textContent = "Atualização do TSE indisponível";
      atualizacaoEl.removeAttribute("data-dg");
      atualizacaoEl.removeAttribute("data-hg");
      consultaEl.textContent = "";
      painel.innerHTML = '<p class="vazio">Aguardando o arquivo oficial do TSE.</p>';
      return;
    }

    const turno = scope.turno === "2" ? "2º turno" : scope.turno === "1" ? "1º turno" : "turno " + scope.turno;
    const comecou = apurando(scope);
    const estadoApuracao = scope.andamento === "f" ? "Apuração encerrada" : comecou ? "Apuração em andamento" : "Aguardando apuração";
    subtitulo.textContent = turno + " · eleição " + scope.eleicao + " · " + estadoApuracao;
    nota.hidden = !(config.selection === "top2" && scope.turno === "1");

    pstEl.textContent = comecou ? model.formatPct(scope.pst) : "Aguardando";
    pstEl.classList.toggle("aguardando", !comecou);
    pstEl.dataset.pst = scope.pst;
    secoesEl.textContent = comecou
      ? model.formatInt(scope.secoesTotalizadas) + " de " + model.formatInt(scope.secoesTotal) + " seções totalizadas"
      : model.formatPct(scope.pst) + " das urnas apuradas";
    atualizacaoEl.textContent = textoAtualizacao(scope);
    atualizacaoEl.dataset.dg = scope.dg;
    atualizacaoEl.dataset.hg = scope.hg;

    const entry = (vistaPrimeiro() ? memory1 : memory)[uf];
    consultaEl.textContent = entry
      ? "Última consulta: " + horarioBrasilia(new Date(entry.savedAt)) + " (Brasília)" + (entry.fromCache ? " · leitura guardada" : "")
      : "";

    const slots = pairNoEscopoVisivel(uf);
    const nacional = pairVisivel();
    painel.innerHTML = "";
    const lista = document.createElement("div");
    lista.className = "lista";
    (nacional.length ? nacional : []).forEach(function (ref, index) {
      const cand = uf === "br" ? ref : slots[index];
      lista.appendChild(renderCandidato(ref, cand, !comecou));
    });
    if (!nacional.length) {
      const vazio = document.createElement("p");
      vazio.className = "vazio";
      vazio.textContent = "O arquivo do Brasil ainda não lista os dois candidatos.";
      lista.appendChild(vazio);
    }
    painel.appendChild(lista);
    if (comecou) painel.appendChild(renderExtras(scope));
  }

  function renderCandidato(ref, cand, aguardando) {
    const article = document.createElement("article");
    article.className = "cand " + (ref.lado || "outro");
    const foto = model.photoUrl(configDaTela(), (cand || ref).sq);
    const wrap = document.createElement("div");
    wrap.className = "avatar-wrap";
    const iniciais = document.createElement("span");
    iniciais.className = "iniciais";
    iniciais.textContent = (ref.nome || "?").slice(0, 1);
    if (foto) {
      const img = document.createElement("img");
      img.alt = "";
      img.width = 58;
      img.height = 58;
      img.src = foto;
      img.addEventListener("error", function () {
        img.replaceWith(iniciais);
      });
      wrap.appendChild(img);
    } else {
      wrap.appendChild(iniciais);
    }

    const corpo = document.createElement("div");
    const nome = document.createElement("h2");
    nome.className = "nome";
    nome.textContent = ref.nome + " ";
    const partido = document.createElement("span");
    partido.className = "partido";
    partido.textContent = ref.partido ? "(" + ref.partido + ")" : "";
    nome.appendChild(partido);
    const votos = document.createElement("p");
    votos.className = "votos";
    const barra = document.createElement("div");
    barra.className = "bar";
    barra.setAttribute("aria-hidden", "true");
    const preenchimento = document.createElement("span");
    const pct = document.createElement("p");
    pct.className = "pct";
    if (aguardando) {
      votos.textContent = "Aguardando apuração";
      preenchimento.style.width = "0%";
      pct.textContent = "—";
    } else if (cand) {
      votos.dataset.vap = cand.vap;
      votos.textContent = model.formatInt(cand.vap) + " votos";
      const largura = Number.isFinite(cand.pvapN) ? Math.max(0, Math.min(100, cand.pvapN)) : 0;
      preenchimento.style.width = largura + "%";
      pct.dataset.pvap = cand.pvap;
      pct.textContent = model.formatPct(cand.pvap);
    } else {
      votos.textContent = "Sem dados neste recorte";
      preenchimento.style.width = "0%";
      pct.textContent = "—";
    }
    barra.appendChild(preenchimento);
    corpo.appendChild(nome);
    corpo.appendChild(votos);
    if (!aguardando) corpo.appendChild(barra);

    article.appendChild(wrap);
    article.appendChild(corpo);
    article.appendChild(pct);
    return article;
  }

  function renderExtras(scope) {
    const bloco = document.createElement("div");
    bloco.className = "extras";
    [
      ["Brancos", scope.brancos],
      ["Nulos", scope.nulos],
      ["Abstenção", scope.abstencao],
    ].forEach(function (item) {
      const cell = document.createElement("div");
      const rotulo = document.createElement("span");
      rotulo.textContent = item[0];
      const forte = document.createElement("strong");
      forte.dataset.p = item[1].p;
      forte.dataset.n = item[1].n;
      forte.textContent = model.formatPct(item[1].p);
      const miudo = document.createElement("small");
      miudo.textContent = model.formatInt(item[1].n);
      cell.appendChild(rotulo);
      cell.appendChild(forte);
      cell.appendChild(miudo);
      bloco.appendChild(cell);
    });
    return bloco;
  }

  function renderMapa() {
    const nacional = pairVisivel();
    model.UFS.forEach(function (uf) {
      const scope = scopeTela(uf);
      const nos = mapa.querySelectorAll('[data-uf="' + uf + '"]');
      const cor = scope && nacional.length === 2 ? model.colorFor(scope, model.alignPair(scope, nacional)) : "neutro";
      const comecou = apurando(scope);
      const texto = comecou ? model.compactPct(scope.pst) : "—";
      const oficial = comecou ? model.formatPct(scope.pst) + " das urnas apuradas" : "aguardando apuração";
      nos.forEach(function (no) {
        if (no.classList.contains("uf") || no.classList.contains("callout")) {
          no.classList.remove("neutro", "gelo", "lula-1", "lula-2", "lula-3", "flavio-1", "flavio-2", "flavio-3");
          no.classList.add(cor);
        }
        no.classList.toggle("selecionado", currentUf() === uf);
        const nome = no.getAttribute("data-nome") || model.NOMES[uf];
        no.setAttribute("aria-label", nome + ", " + oficial + " das urnas apuradas");
        no.querySelectorAll(".pst").forEach(function (label) {
          label.textContent = texto;
        });
      });
    });
  }

  function renderLegenda(anotados) {
    graficoLegenda.replaceChildren();
    if (!anotados.length) return;
    anotados[anotados.length - 1].candidatos.forEach(function (cand) {
      const li = document.createElement("li");
      const marca = document.createElement("i");
      marca.style.background = graficoApi.CORES[cand.lado] || graficoApi.CORES.outro;
      const nome = document.createElement("span");
      nome.textContent = cand.nome;
      nome.style.color = graficoApi.CORES[cand.lado] || graficoApi.CORES.outro;
      const pct = document.createElement("strong");
      pct.textContent = model.formatPct(cand.pvap);
      const variacao = document.createElement("span");
      variacao.className = "variacao";
      variacao.textContent = cand.primeiro ? "primeiro ponto" : cand.delta;
      li.append(marca, nome, pct, variacao);
      graficoLegenda.appendChild(li);
    });
  }

  function nomesDaSerie(anotados) {
    const nomes = [];
    anotados.forEach(function (ponto) {
      ponto.candidatos.forEach(function (cand) {
        const id = cand.lado !== "outro" ? cand.lado : cand.nome;
        let slot = nomes.find(function (item) { return item.id === id; });
        if (!slot) {
          slot = { id: id, lado: cand.lado, nome: cand.nome };
          nomes.push(slot);
        }
        slot.nome = cand.nome;
      });
    });
    return nomes;
  }

  function celula(texto) {
    const td = document.createElement("td");
    td.textContent = texto;
    return td;
  }

  function renderTabela(anotados) {
    const caption = graficoTabela.querySelector("caption");
    graficoTabela.replaceChildren();
    if (caption) graficoTabela.appendChild(caption);
    if (!anotados.length) return;
    const nomes = nomesDaSerie(anotados);
    const thead = document.createElement("thead");
    const linha1 = document.createElement("tr");
    ["Horário do TSE", "Urnas apuradas"].forEach(function (rotulo) {
      const th = document.createElement("th");
      th.scope = "col";
      th.rowSpan = 2;
      th.textContent = rotulo;
      linha1.appendChild(th);
    });
    nomes.forEach(function (item) {
      const th = document.createElement("th");
      th.scope = "colgroup";
      th.colSpan = 3;
      th.textContent = item.nome;
      th.style.color = graficoApi.CORES[item.lado] || graficoApi.CORES.outro;
      linha1.appendChild(th);
    });
    const linha2 = document.createElement("tr");
    nomes.forEach(function () {
      ["Votos válidos", "Variação", "Votos"].forEach(function (rotulo) {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = rotulo;
        linha2.appendChild(th);
      });
    });
    thead.append(linha1, linha2);
    const tbody = document.createElement("tbody");
    anotados.forEach(function (ponto) {
      const tr = document.createElement("tr");
      tr.append(
        celula(ponto.dg + " " + ponto.hg),
        celula(model.formatPct(ponto.pst))
      );
      nomes.forEach(function (item) {
        const cand = ponto.candidatos.find(function (c) {
          return (c.lado !== "outro" ? c.lado : c.nome) === item.id;
        });
        if (!cand) {
          tr.append(celula("—"), celula("—"), celula("—"));
          return;
        }
        tr.append(
          celula(model.formatPct(cand.pvap)),
          celula(cand.primeiro ? "primeiro ponto" : cand.delta || "—"),
          celula(model.formatInt(cand.vap))
        );
      });
      tbody.appendChild(tr);
    });
    graficoTabela.append(thead, tbody);
  }

  function textosGraficoSegundo() {
    graficoTitulo.textContent = "Evolução dos votos válidos";
    graficoNota.textContent = "Um ponto a cada atualização do TSE. O eixo horizontal é o percentual de urnas apuradas; o horário de Brasília aparece no tooltip e na tabela.";
    graficoTabela.querySelector("caption").textContent = "Série oficial do Brasil";
  }

  function pontosDoPrimeiro() {
    const serie = parciais && parciais.serie ? parciais.serie.br : null;
    if (!serie) return [];
    return serie.map(function (ponto, index) {
      const anterior = index > 0 ? serie[index - 1] : null;
      function candidato(nome, lado, centesimos, previo) {
        return {
          nome: nome,
          lado: lado,
          pvap: model.formatCentesimos(centesimos).replace("%", ""),
          pvapN: centesimos / 100,
          vap: "",
          delta: previo == null ? "" : model.formatPontos(centesimos - previo),
          primeiro: previo == null,
        };
      }
      return {
        dg: "",
        hg: "",
        pst: model.formatCentesimos(ponto[0]).replace("%", ""),
        pstN: ponto[0] / 100,
        candidatos: [
          candidato("FLAVIO BOLSONARO", "flavio", ponto[1], anterior ? anterior[1] : null),
          candidato("LULA", "lula", ponto[2], anterior ? anterior[2] : null),
        ],
      };
    });
  }

  function renderTabelaParciais(anotados) {
    const caption = graficoTabela.querySelector("caption");
    graficoTabela.replaceChildren();
    if (caption) graficoTabela.appendChild(caption);
    if (!anotados.length) return;
    const thead = document.createElement("thead");
    const linha1 = document.createElement("tr");
    ["Urnas apuradas", "Flávio", "Variação", "Lula", "Variação"].forEach(function (rotulo) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = rotulo;
      linha1.appendChild(th);
    });
    thead.appendChild(linha1);
    const tbody = document.createElement("tbody");
    anotados.forEach(function (ponto) {
      const flavio = ponto.candidatos[0];
      const lula = ponto.candidatos[1];
      const tr = document.createElement("tr");
      tr.append(
        celula(model.formatPct(ponto.pst)),
        celula(model.formatPct(flavio.pvap)),
        celula(flavio.primeiro ? "primeiro ponto" : flavio.delta || "—"),
        celula(model.formatPct(lula.pvap)),
        celula(lula.primeiro ? "primeiro ponto" : lula.delta || "—")
      );
      tbody.appendChild(tr);
    });
    graficoTabela.append(thead, tbody);
  }

  function renderGraficoPrimeiro() {
    graficoTitulo.textContent = "Evolução no 1º turno";
    graficoNota.textContent = "Série nacional da captura de terceiros dos arquivos oficiais do TSE (ArvorCo/PNAD), eleição 6257. O eixo horizontal é o percentual de urnas apuradas. Não traz o horário de cada atualização do TSE.";
    graficoTabela.querySelector("caption").textContent = "Série nacional do 1º turno, captura ArvorCo/PNAD";
    const pontos = pontosDoPrimeiro();
    if (!pontos.length) {
      graficoLegenda.replaceChildren();
      graficoEl.replaceChildren();
      renderTabelaParciais([]);
      graficoLeitura.textContent = "";
      graficoOrigem.hidden = false;
      graficoOrigem.textContent = "A série do 1º turno não carregou.";
      return;
    }
    renderLegenda(pontos);
    graficoApi.desenhar(graficoEl, pontos, model.formatPct);
    renderTabelaParciais(pontos);
    const ultimo = pontos[pontos.length - 1];
    graficoLeitura.textContent =
      "Final da série: " +
      model.formatPct(ultimo.pst) +
      " das urnas · Flávio " +
      model.formatPct(ultimo.candidatos[0].pvap) +
      " · Lula " +
      model.formatPct(ultimo.candidatos[1].pvap);
    graficoOrigem.hidden = false;
    graficoOrigem.textContent = parciais.fonte || "Captura ArvorCo/PNAD dos arquivos oficiais do TSE.";
  }

  function renderGrafico() {
    if (vistaPrimeiro()) {
      renderGraficoPrimeiro();
      return;
    }
    textosGraficoSegundo();
    const pontos = serieBrasil();
    const comSerie = pontos.some(function (ponto) { return model.num(ponto.pst) > 0; });
    if (!comSerie) {
      const brasil = scopeOf("br");
      graficoLegenda.replaceChildren();
      graficoEl.replaceChildren();
      renderTabela([]);
      graficoLeitura.textContent = brasil && brasil.dg && brasil.hg
        ? textoAtualizacao(brasil) + " · " + model.formatPct(brasil.pst) + " das urnas"
        : "";
      graficoOrigem.hidden = false;
      graficoOrigem.textContent = brasil
        ? "Aguardando apuração. O gráfico entra quando o TSE registrar urnas apuradas."
        : "Aguardando o arquivo oficial do Brasil.";
      return;
    }
    const anotados = historicoApi.anotar(pontos, model.ladoDe);
    renderLegenda(anotados);
    graficoApi.desenhar(graficoEl, anotados, model.formatPct);
    renderTabela(anotados);
    const ultimo = pontos[pontos.length - 1];
    if (ultimo) {
      graficoLeitura.textContent =
        "Última atualização do TSE: " +
        ultimo.dg +
        " às " +
        ultimo.hg +
        " · " +
        model.formatPct(ultimo.pst) +
        " das urnas";
    } else {
      graficoLeitura.textContent = "";
    }
    const publicado = ultimo && historicoArquivo.some(function (item) {
      return historicoApi.chave(item) === historicoApi.chave(ultimo);
    });
    if (!pontos.length) {
      graficoOrigem.hidden = false;
      graficoOrigem.textContent = "Ainda não há atualização oficial do Brasil para desenhar a série.";
    } else if (historicoEstado === "erro" && !historicoArquivo.length) {
      graficoOrigem.hidden = false;
      graficoOrigem.textContent = "Não foi possível ler o histórico publicado. O gráfico mostra a leitura atual do TSE.";
    } else if (historicoEstado === "ausente") {
      graficoOrigem.hidden = false;
      graficoOrigem.textContent = "O histórico publicado ainda não tem arquivo. O gráfico mostra a leitura atual do TSE.";
    } else if (ultimo && !publicado) {
      graficoOrigem.hidden = false;
      graficoOrigem.textContent = "O último ponto é a leitura atual do TSE e ainda não entrou no histórico publicado.";
    } else {
      graficoOrigem.hidden = true;
      graficoOrigem.textContent = "";
    }
  }

  function renderAbas() {
    const primeiro = vistaPrimeiro();
    abaSegundo.setAttribute("aria-selected", primeiro ? "false" : "true");
    abaPrimeiro.setAttribute("aria-selected", primeiro ? "true" : "false");
  }

  function render() {
    const uf = currentUf();
    renderAbas();
    atualizarSimulacao();
    renderAviso();
    renderPainel(uf);
    renderMapa();
    renderRegioes();
    secaoVariacao.hidden = vistaPrimeiro();
    notaRegioes.textContent = vistaPrimeiro()
      ? "soma dos estados do 1º turno, calculada a partir dos arquivos oficiais do TSE."
      : "soma dos estados, calculada a partir dos dados do TSE. A comparação usa a captura ArvorCo/PNAD do 1º turno, na % de urnas mais próxima.";
    if (vistaPrimeiro()) {
      if (!scopeTela("br") && primeiroOficialEstado !== "erro") {
        setAviso("Carregando o arquivo oficial do 1º turno…", "info");
      } else if (!scopeTela("br")) {
        setAviso("O arquivo oficial do 1º turno não respondeu. Nenhum número foi estimado.", "erro");
        dot.className = "dot erro";
      } else {
        setAviso("", "");
        dot.className = "dot ok";
      }
    } else {
      renderVariacao(uf);
    }
    renderGrafico();
  }

  function nomeDoNumero(n, fallback) {
    if (String(n) === "22") return "Flávio";
    if (String(n) === "13") return "Lula";
    return fallback || "Candidato " + n;
  }

  function serieParcial(id) {
    return parciais && parciais.serie ? parciais.serie[id] : null;
  }

  function sinalDe(delta) {
    if (delta == null) return "";
    if (delta > 0) return "alta";
    if (delta < 0) return "queda";
    return "neutro";
  }

  function comparacaoSimulada(id) {
    const serie = serieParcial(id);
    const ponto = model.pontoMaisProximo(serie, 5000);
    if (!ponto) return null;
    return model.compararMesmaApuracao(serie, ponto.pst, ponto.flavio, ponto.lula);
  }

  function comparacaoRealBrasil() {
    const scope = scopeOf("br");
    if (!apurando(scope)) return null;
    const pair = pairNoEscopo("br");
    const flavio = pair.find(function (cand) { return cand && (cand.lado === "flavio" || String(cand.n) === "22"); });
    const lula = pair.find(function (cand) { return cand && (cand.lado === "lula" || String(cand.n) === "13"); });
    if (!flavio || !lula) return null;
    return model.compararMesmaApuracao(
      serieParcial("br"),
      model.pvapCentesimos(scope.pst),
      model.pvapCentesimos(flavio.pvap),
      model.pvapCentesimos(lula.pvap)
    );
  }

  function regiaoEmApuracao(regiao) {
    const item = model.agregarRegiao(regiao, regiao.ufs.map(function (id) { return scopeOf(id); }), pairNacional());
    return !!(item.completa && item.urnasCentesimos > 0);
  }

  function comparacaoRealRegiao(regiao) {
    const pair = pairNacional();
    const scopes = regiao.ufs.map(function (id) { return scopeOf(id); });
    const item = model.agregarRegiao(regiao, scopes, pair);
    if (!item.completa || !(item.urnasCentesimos > 0)) return null;
    const flavio = item.candidatos.find(function (cand) { return cand.lado === "flavio"; });
    const lula = item.candidatos.find(function (cand) { return cand.lado === "lula"; });
    if (!flavio || !lula) return null;
    return model.compararMesmaApuracao(serieParcial(regiao.id), item.urnasCentesimos, flavio.centesimos, lula.centesimos);
  }

  function acrescentarDelta(destino, delta) {
    if (delta == null) return;
    const span = document.createElement("span");
    span.className = "delta " + sinalDe(delta);
    span.textContent = model.formatPontos(delta);
    destino.appendChild(span);
  }

  function renderComparacao(cmp) {
    [
      ["22", cmp.flavio, cmp.deltaFlavio, cmp.base.flavio],
      ["13", cmp.lula, cmp.deltaLula, cmp.base.lula],
    ].forEach(function (item) {
      const bloco = document.createElement("div");
      bloco.className = "var-item";
      const topo = document.createElement("p");
      topo.className = "var-linha";
      const nome = document.createElement("span");
      nome.className = "var-nome";
      nome.textContent = nomeDoNumero(item[0]);
      const pct = document.createElement("span");
      pct.className = "var-pct";
      pct.textContent = model.formatCentesimos(item[1]);
      topo.append(nome, pct);
      acrescentarDelta(topo, item[2]);
      const base = document.createElement("p");
      base.className = "var-base";
      base.textContent =
        "1º turno em " +
        model.formatCentesimos(cmp.base.pst) +
        " das urnas: " +
        model.formatCentesimos(item[3]);
      bloco.append(topo, base);
      variacaoLista.appendChild(bloco);
    });
  }

  function renderVariacao(uf) {
    variacaoLista.replaceChildren();
    atualizarSimulacao();
    if (uf === "zz") {
      variacaoTitulo.textContent = "Variação vs 1º turno";
      variacaoEstado.hidden = false;
      variacaoEstado.textContent = "O Exterior não entra nesta comparação.";
      return;
    }
    if (!simulacaoAtiva() && String(config.code) !== "6258") {
      variacaoTitulo.textContent = "Variação vs 1º turno";
      renderVariacaoFinal(uf);
      return;
    }
    const regiao = uf === "br" ? null : model.regiaoDe(uf);
    const nome = uf === "br" ? "Brasil" : regiao ? regiao.nome : "";
    const contando = simulacaoAtiva() || (uf === "br" ? apurando(scopeOf("br")) : !!(regiao && regiaoEmApuracao(regiao)));
    if (!nome || !contando) {
      variacaoTitulo.textContent = "Variação vs 1º turno";
      variacaoEstado.hidden = false;
      variacaoEstado.textContent = !simulacaoAtiva() && !scopeOf(uf === "br" ? "br" : uf) ? "Aguardando o arquivo oficial." : "Aguardando apuração.";
      return;
    }
    if (!parciais) {
      variacaoTitulo.textContent = "Variação · " + nome + " (mesma % apurada)";
      variacaoEstado.hidden = false;
      variacaoEstado.textContent = "A série do 1º turno não carregou.";
      return;
    }
    const cmp = simulacaoAtiva()
      ? comparacaoSimulada(uf === "br" ? "br" : regiao.id)
      : uf === "br"
        ? comparacaoRealBrasil()
        : comparacaoRealRegiao(regiao);
    variacaoTitulo.textContent = "Variação · " + nome + " (mesma % apurada)";
    if (!cmp) {
      variacaoEstado.hidden = false;
      variacaoEstado.textContent = "Aguardando apuração.";
      return;
    }
    variacaoEstado.hidden = false;
    variacaoEstado.textContent = "2º turno com " + model.formatCentesimos(cmp.pst) + " das urnas";
    renderComparacao(cmp);
  }

  function renderVariacaoFinal(uf) {
    const scope = scopeOf(uf);
    if (!scope) {
      variacaoEstado.hidden = false;
      variacaoEstado.textContent = "Aguardando o arquivo oficial.";
      return;
    }
    const pair = pairNacional();
    const numeros = pair.map(function (cand) { return String(cand.n); }).filter(Boolean);
    const atuais = (scope ? scope.candidates : []).filter(function (cand) {
      return numeros.indexOf(String(cand.n)) !== -1;
    }).map(function (cand) {
      return { n: String(cand.n), pvap: cand.pvap };
    });
    const recorte = primeiroTurno && primeiroTurno.recortes ? primeiroTurno.recortes[uf] : null;
    const base = recorte && recorte.candidatos ? recorte.candidatos : [];
    const resultado = model.variacaoTurno({
      code: config.code,
      pstN: scope ? scope.pstN : null,
      numeros: numeros,
      atuais: atuais,
      base: base,
    });
    if (resultado.situacao === "antes") {
      variacaoEstado.textContent = "O 2º turno ainda não começou.";
    } else if (resultado.situacao === "aguardando") {
      variacaoEstado.textContent = "Aguardando apuração.";
    } else if (!numeros.length) {
      variacaoEstado.textContent = "Aguardando os candidatos oficiais.";
    } else {
      variacaoEstado.textContent = "";
    }
    variacaoEstado.hidden = !variacaoEstado.textContent;
    resultado.linhas.forEach(function (linha) {
      const bloco = document.createElement("div");
      bloco.className = "var-item";
      const topo = document.createElement("p");
      topo.className = "var-linha";
      const nome = document.createElement("span");
      nome.className = "var-nome";
      nome.textContent = nomeDoNumero(linha.n);
      topo.appendChild(nome);
      if (linha.pvapAtual) {
        const pct = document.createElement("span");
        pct.className = "var-pct";
        pct.textContent = model.formatPct(linha.pvapAtual);
        topo.appendChild(pct);
      }
      if (linha.delta != null) {
        const delta = document.createElement("span");
        delta.className = "delta " + linha.sinal;
        delta.textContent = model.formatPontos(linha.delta);
        topo.appendChild(delta);
      }
      const baseLinha = document.createElement("p");
      baseLinha.className = "var-base";
      baseLinha.textContent = linha.pvapPrimeiro
        ? "1º turno: " + model.formatPct(linha.pvapPrimeiro)
        : "1º turno: sem dado oficial deste recorte";
      bloco.append(topo, baseLinha);
      variacaoLista.appendChild(bloco);
    });
  }

  function nomeCurto(cand) {
    if (cand.lado === "lula") return "Lula";
    if (cand.lado === "flavio") return "Flávio";
    return cand.nome;
  }

  function appendVs(li, cmp) {
    if (!cmp) return;
    const p = document.createElement("p");
    p.className = "regiao-parcial";
    p.appendChild(document.createTextNode("vs 1º turno em " + model.formatCentesimos(cmp.base.pst) + ": "));
    [
      ["Flávio", cmp.base.flavio, cmp.deltaFlavio],
      ["Lula", cmp.base.lula, cmp.deltaLula],
    ].forEach(function (item, index) {
      if (index) p.appendChild(document.createTextNode(" · "));
      p.appendChild(document.createTextNode(item[0] + " " + model.formatCentesimos(item[1]) + " "));
      acrescentarDelta(p, item[2]);
    });
    li.appendChild(p);
  }

  function renderRegioes() {
    const lista = document.getElementById("lista-regioes");
    lista.replaceChildren();
    if (simulacaoAtiva() && !vistaPrimeiro()) {
      model.REGIOES.forEach(function (regiao) {
        const cmp = comparacaoSimulada(regiao.id);
        const li = document.createElement("li");
        const linha = document.createElement("p");
        linha.className = "regiao-linha";
        const nome = document.createElement("span");
        nome.className = "regiao-nome";
        nome.textContent = regiao.nome;
        linha.appendChild(nome);
        linha.appendChild(document.createTextNode(" — "));
        if (!cmp) {
          linha.appendChild(document.createTextNode("sem a série do 1º turno"));
          li.appendChild(linha);
        } else {
          const pares = [
            { lado: "flavio", nome: "Flávio", c: cmp.flavio },
            { lado: "lula", nome: "Lula", c: cmp.lula },
          ].sort(function (a, b) { return b.c - a.c; });
          const lider = pares[0].c > pares[1].c ? pares[0].lado : "";
          pares.forEach(function (cand, index) {
            if (index) linha.appendChild(document.createTextNode(" x "));
            if (lider === cand.lado) {
              const marca = document.createElement("i");
              marca.className = "marca-lider " + cand.lado;
              marca.setAttribute("aria-hidden", "true");
              linha.appendChild(marca);
            }
            const trecho = document.createElement("span");
            if (lider === cand.lado) trecho.className = "lider " + cand.lado;
            trecho.textContent = cand.nome + " " + model.formatCentesimos(cand.c);
            linha.appendChild(trecho);
          });
          li.appendChild(linha);
          const urnas = document.createElement("p");
          urnas.className = "regiao-urnas";
          urnas.textContent = model.formatCentesimos(cmp.pst) + " das urnas";
          li.appendChild(urnas);
          appendVs(li, cmp);
        }
        lista.appendChild(li);
      });
      return;
    }
    const alguma = model.UFS.some(function (uf) { return apurando(scopeTela(uf)); });
    if (!alguma) {
      model.REGIOES.forEach(function (regiao) {
        const li = document.createElement("li");
        const linha = document.createElement("p");
        linha.className = "regiao-linha";
        const nome = document.createElement("span");
        nome.className = "regiao-nome";
        nome.textContent = regiao.nome;
        linha.appendChild(nome);
        linha.appendChild(document.createTextNode(" — aguardando apuração"));
        li.appendChild(linha);
        lista.appendChild(li);
      });
      return;
    }
    const pair = pairVisivel();
    model.REGIOES.forEach(function (regiao) {
      const scopes = regiao.ufs.map(function (uf) { return scopeTela(uf); });
      const item = model.agregarRegiao(regiao, scopes, pair);
      const li = document.createElement("li");
      const linha = document.createElement("p");
      linha.className = "regiao-linha";
      const nome = document.createElement("span");
      nome.className = "regiao-nome";
      nome.textContent = item.nome;
      linha.appendChild(nome);
      linha.appendChild(document.createTextNode(" — "));
      if (!item.completa) {
        linha.appendChild(document.createTextNode("sem a soma de todos os estados"));
      } else {
        item.candidatos.forEach(function (cand, index) {
          if (index) linha.appendChild(document.createTextNode(" x "));
          if (item.lider === cand.lado) {
            const marca = document.createElement("i");
            marca.className = "marca-lider " + cand.lado;
            marca.setAttribute("aria-hidden", "true");
            linha.appendChild(marca);
          }
          const trecho = document.createElement("span");
          if (item.lider === cand.lado) trecho.className = "lider " + cand.lado;
          trecho.textContent = nomeCurto(cand) + " " + model.formatCentesimos(cand.centesimos);
          linha.appendChild(trecho);
        });
      }
      li.appendChild(linha);
      if (item.completa) {
        const urnas = document.createElement("p");
        urnas.className = "regiao-urnas";
        urnas.textContent = model.formatCentesimos(item.urnasCentesimos) + " das urnas";
        li.appendChild(urnas);
        if (!vistaPrimeiro() && item.urnasCentesimos > 0) appendVs(li, comparacaoRealRegiao(regiao));
      }
      lista.appendChild(li);
    });
  }

  function selecionar(uf) {
    const destino = hashDoRecorte(uf, vistaPrimeiro());
    if (location.hash.toLowerCase() !== destino.toLowerCase()) location.hash = destino;
    else render();
  }

  function abrirTurno(primeiro) {
    const destino = hashDoRecorte(currentUf(), primeiro);
    if (location.hash.toLowerCase() !== destino.toLowerCase()) location.hash = destino;
    else render();
    if (primeiro) loadPrimeiroOficial();
  }

  function bindMapa() {
    mapa.addEventListener("click", function (event) {
      const alvo = event.target.closest("[data-uf]");
      if (!alvo || !mapa.contains(alvo)) return;
      selecionar(alvo.getAttribute("data-uf"));
    });
    mapa.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      const alvo = event.target.closest("[data-uf]");
      if (!alvo) return;
      event.preventDefault();
      selecionar(alvo.getAttribute("data-uf"));
    });
  }

  function preencherSeletor() {
    const opcoes = [{ uf: "br", nome: "Brasil" }].concat(
      model.UFS.map(function (uf) {
        return { uf: uf, nome: model.NOMES[uf] };
      }).sort(function (a, b) {
        return a.nome.localeCompare(b.nome, "pt");
      })
    );
    opcoes.forEach(function (item) {
      const option = document.createElement("option");
      option.value = item.uf;
      option.textContent = item.nome;
      seletor.appendChild(option);
    });
    seletor.addEventListener("change", function () {
      selecionar(seletor.value);
    });
  }

  function sincronizarSeletor(uf) {
    let extra = seletor.querySelector('option[value="zz"]');
    if (uf === "zz" && !extra) {
      extra = document.createElement("option");
      extra.value = "zz";
      extra.textContent = model.NOMES.zz;
      seletor.appendChild(extra);
    } else if (uf !== "zz" && extra) {
      extra.remove();
    }
    seletor.value = uf;
  }

  async function init() {
    if (hashLimpo() === "grafico") {
      history.replaceState(null, "", location.pathname + location.search + "#/br");
    }
    preencherSeletor();
    abaSegundo.addEventListener("click", function () { abrirTurno(false); });
    abaPrimeiro.addEventListener("click", function () { abrirTurno(true); });
    window.addEventListener("hashchange", render);
    hydrate();
    try {
      const resposta = await fetch("assets/brazil.svg");
      if (!resposta.ok) throw new Error("mapa");
      mapa.innerHTML = await resposta.text();
      bindMapa();
    } catch (err) {
      mapa.innerHTML = '<p class="vazio">Não foi possível carregar o mapa.</p>';
    }
    if (scopeOf("br")) render();
    const primeiroOficial = vistaPrimeiro() ? loadPrimeiroOficial() : null;
    await Promise.all([loadAll(), carregarPrimeiroTurno(), carregarParciais()]);
    render();
    if (primeiroOficial) {
      primeiroOficial.then(function () {
        if (vistaPrimeiro()) render();
      });
    }
    setInterval(loadAll, config.pollMs);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") loadAll();
    });
  }

  init();
})();
