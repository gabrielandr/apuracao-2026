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
  const voltar = document.getElementById("voltar");
  const painel = document.getElementById("painel");
  const mapa = document.getElementById("mapa");
  const seletor = document.getElementById("uf-select");
  const fonte = document.getElementById("fonte");
  const linkTse = document.getElementById("link-tse");
  const dot = document.getElementById("dot");

  const memory = Object.create(null);
  let inflight = false;
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

  function currentUf() {
    const hash = location.hash.replace(/^#\/?/, "").toLowerCase();
    if (!hash || hash === "br" || hash === "brasil") return "br";
    if (hash === "zz" || model.UFS.indexOf(hash) !== -1) return hash;
    return "br";
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

  async function loadAll() {
    if (inflight) return;
    inflight = true;
    const alvos = ["br"].concat(model.UFS, ["zz"]);
    if (!scopeOf("br")) setAviso("Carregando os arquivos oficiais do TSE…", "info");
    try {
      const results = await Promise.all(
        alvos.map(function (uf) {
          return loadOne(uf).then(function (ok) {
            return { uf: uf, ok: ok };
          });
        })
      );
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

  function renderPainel(uf) {
    const scope = scopeOf(uf);
    const nome = model.NOMES[uf] || uf.toUpperCase();
    titulo.textContent = nome;
    document.title = nome + " · Apuração 2026";
    voltar.hidden = uf === "br";
    seletor.value = uf;
    fonte.href = model.fileUrl(config, uf);
    fonte.textContent = "arquivo oficial " + uf + "-c0001-e" + String(config.code).padStart(6, "0") + "-u.json";
    linkTse.href =
      "https://resultados.tse.jus.br/oficial/app/index.html#/eleicao/" +
      config.code +
      "/uf/" +
      uf +
      "/cargo/1/vis/nominal/resumo-geral";

    if (!scope) {
      subtitulo.textContent = "Sem leitura oficial desta abrangência.";
      nota.hidden = true;
      pstEl.textContent = "—";
      pstEl.removeAttribute("data-pst");
      secoesEl.textContent = "";
      atualizacaoEl.textContent = "Atualização do TSE indisponível";
      atualizacaoEl.removeAttribute("data-dg");
      painel.innerHTML = '<p class="vazio">Sem dados oficiais para mostrar.</p>';
      return;
    }

    const turno = scope.turno === "2" ? "2º turno" : scope.turno === "1" ? "1º turno" : "turno " + scope.turno;
    const estadoApuracao = scope.andamento === "f" ? "Apuração encerrada" : "Apuração em andamento";
    subtitulo.textContent = turno + " · eleição " + scope.eleicao + " · " + estadoApuracao;
    nota.hidden = !(config.selection === "top2" && scope.turno === "1");

    pstEl.textContent = model.formatPct(scope.pst);
    pstEl.dataset.pst = scope.pst;
    secoesEl.textContent =
      model.formatInt(scope.secoesTotalizadas) +
      " de " +
      model.formatInt(scope.secoesTotal) +
      " seções totalizadas";
    atualizacaoEl.textContent =
      "Atualização do TSE: " +
      (scope.dg || "—") +
      " às " +
      (scope.hg || "—") +
      " (horário de Brasília)";
    atualizacaoEl.dataset.dg = scope.dg;
    atualizacaoEl.dataset.hg = scope.hg;

    const entry = memory[uf];
    consultaEl.textContent = entry
      ? "Última consulta: " + horarioBrasilia(new Date(entry.savedAt)) + " (Brasília)" + (entry.fromCache ? " · leitura guardada" : "")
      : "";

    const slots = pairNoEscopo(uf);
    const nacional = pairNacional();
    painel.innerHTML = "";
    const lista = document.createElement("div");
    lista.className = "lista";
    (nacional.length ? nacional : []).forEach(function (ref, index) {
      const cand = uf === "br" ? ref : slots[index];
      lista.appendChild(renderCandidato(ref, cand));
    });
    if (!nacional.length) {
      const vazio = document.createElement("p");
      vazio.className = "vazio";
      vazio.textContent = "O arquivo do Brasil ainda não lista os dois candidatos.";
      lista.appendChild(vazio);
    }
    painel.appendChild(lista);
    painel.appendChild(renderExtras(scope));
  }

  function renderCandidato(ref, cand) {
    const article = document.createElement("article");
    article.className = "cand " + (ref.lado || "outro");
    const foto = model.photoUrl(config, (cand || ref).sq);
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
    if (cand) {
      votos.dataset.vap = cand.vap;
      votos.textContent = model.formatInt(cand.vap) + " votos";
    } else {
      votos.textContent = "Sem dados neste recorte";
    }
    const barra = document.createElement("div");
    barra.className = "bar";
    barra.setAttribute("aria-hidden", "true");
    const preenchimento = document.createElement("span");
    const largura = cand && Number.isFinite(cand.pvapN) ? Math.max(0, Math.min(100, cand.pvapN)) : 0;
    preenchimento.style.width = largura + "%";
    barra.appendChild(preenchimento);
    corpo.appendChild(nome);
    corpo.appendChild(votos);
    corpo.appendChild(barra);

    const pct = document.createElement("p");
    pct.className = "pct";
    if (cand) {
      pct.dataset.pvap = cand.pvap;
      pct.textContent = model.formatPct(cand.pvap);
    } else {
      pct.textContent = "—";
    }

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
    const nacional = pairNacional();
    model.UFS.forEach(function (uf) {
      const scope = scopeOf(uf);
      const nos = mapa.querySelectorAll('[data-uf="' + uf + '"]');
      const cor = scope && nacional.length === 2 ? model.colorFor(scope, model.alignPair(scope, nacional)) : "neutro";
      const texto = scope ? model.compactPct(scope.pst) : "—";
      const oficial = scope ? model.formatPct(scope.pst) : "sem dados";
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

  function render() {
    renderAviso();
    renderPainel(currentUf());
    renderMapa();
  }

  function selecionar(uf) {
    const destino = "#/" + uf;
    if (location.hash !== destino) location.hash = destino;
    else render();
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
    const opcoes = [{ uf: "br", nome: "Brasil" }]
      .concat(
        model.UFS.map(function (uf) {
          return { uf: uf, nome: model.NOMES[uf] };
        }).sort(function (a, b) {
          return a.nome.localeCompare(b.nome, "pt");
        })
      )
      .concat([{ uf: "zz", nome: "Exterior" }]);
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

  async function init() {
    preencherSeletor();
    voltar.addEventListener("click", function () {
      selecionar("br");
    });
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
    await loadAll();
    setInterval(loadAll, config.pollMs);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") loadAll();
    });
  }

  init();
})();
