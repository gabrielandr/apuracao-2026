/**
 * Gráfico de linhas em SVG, sem biblioteca.
 * O eixo X é o percentual de urnas apuradas (pst). O horário do TSE fica no tooltip.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ApuracaoGrafico = api;
})(typeof self !== "undefined" ? self : this, function () {
  const SVG = "http://www.w3.org/2000/svg";
  const CORES = {
    lula: "#bb0b0b",
    flavio: "#4040fb",
    outro: "#9db4d4",
  };

  function dominioY(valores) {
    if (!valores.length) return { min: 0, max: 100 };
    let min = Math.min.apply(null, valores);
    let max = Math.max.apply(null, valores);
    if (max - min < 2) {
      const meio = (max + min) / 2;
      min = meio - 1.5;
      max = meio + 1.5;
    }
    const folga = (max - min) * 0.18;
    min = Math.max(0, min - folga);
    max = Math.min(100, max + folga);
    if (max <= min) max = Math.min(100, min + 1);
    return { min: min, max: max };
  }

  function ticks(min, max, count) {
    const span = max - min;
    if (!(span > 0)) return [min];
    const raw = span / (count - 1);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const err = raw / mag;
    const step = err >= 7.5 ? 10 * mag : err >= 3.5 ? 5 * mag : err >= 1.5 ? 2 * mag : mag;
    const start = Math.ceil((min - step * 0.001) / step) * step;
    const lista = [];
    for (let v = start; v <= max + step * 0.001; v += step) {
      const n = Math.round(v * 1000) / 1000;
      if (n >= min - 0.001 && n <= max + 0.001) lista.push(n);
    }
    return lista.length ? lista : [min, max];
  }

  function formatEixo(n, span) {
    const casas = span < 10 ? 1 : 0;
    return n.toFixed(casas).replace(".", ",");
  }

  function layout(pontos, box) {
    const width = (box && box.width) || 760;
    const height = (box && box.height) || 420;
    const pad = { l: 58, r: 22, t: 18, b: 46 };
    const plot = {
      x: pad.l,
      y: pad.t,
      w: width - pad.l - pad.r,
      h: height - pad.t - pad.b,
    };
    const ys = [];
    (pontos || []).forEach(function (ponto) {
      (ponto.candidatos || []).forEach(function (cand) {
        if (Number.isFinite(cand.pvapN)) ys.push(cand.pvapN);
      });
    });
    const yDom = dominioY(ys);
    function xOf(pst) {
      return plot.x + (Math.max(0, Math.min(100, pst)) / 100) * plot.w;
    }
    function yOf(pvap) {
      const t = (pvap - yDom.min) / (yDom.max - yDom.min);
      return plot.y + (1 - t) * plot.h;
    }
    const grupos = [];
    (pontos || []).forEach(function (ponto, index) {
      if (!Number.isFinite(ponto.pstN)) return;
      (ponto.candidatos || []).forEach(function (cand) {
        if (!Number.isFinite(cand.pvapN)) return;
        const id = cand.lado && cand.lado !== "outro" ? cand.lado : cand.nome;
        let grupo = grupos.find(function (item) { return item.id === id; });
        if (!grupo) {
          grupo = {
            id: id,
            lado: cand.lado || "outro",
            nome: cand.nome,
            cor: CORES[cand.lado] || CORES.outro,
            pontos: [],
          };
          grupos.push(grupo);
        }
        grupo.nome = cand.nome;
        grupo.pontos.push({
          index: index,
          x: xOf(ponto.pstN),
          y: yOf(cand.pvapN),
          nome: cand.nome,
          pvap: cand.pvap,
          vap: cand.vap,
          delta: cand.delta || "",
          primeiro: !!cand.primeiro,
          pst: ponto.pst,
          dg: ponto.dg,
          hg: ponto.hg,
        });
      });
    });
    return {
      width: width,
      height: height,
      plot: plot,
      yDom: yDom,
      xTicks: [0, 25, 50, 75, 100],
      yTicks: ticks(yDom.min, yDom.max, 5),
      series: grupos,
    };
  }

  function el(nome) {
    return document.createElementNS(SVG, nome);
  }

  function desenhar(container, pontos, formatPct) {
    container.replaceChildren();
    const desenho = layout(pontos);
    const svg = el("svg");
    svg.setAttribute("viewBox", "0 0 " + desenho.width + " " + desenho.height);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Evolução do percentual de votos válidos no Brasil, conforme as urnas são apuradas");
    container.appendChild(svg);

    const rotuloY = el("text");
    rotuloY.setAttribute("fill", "#b7c9e6");
    rotuloY.setAttribute("font-size", "12");
    rotuloY.setAttribute("text-anchor", "middle");
    rotuloY.setAttribute("transform", "translate(14 " + (desenho.plot.y + desenho.plot.h / 2) + ") rotate(-90)");
    rotuloY.textContent = "% votos válidos";
    svg.appendChild(rotuloY);

    desenho.yTicks.forEach(function (tick) {
      const y = desenho.plot.y + (1 - (tick - desenho.yDom.min) / (desenho.yDom.max - desenho.yDom.min)) * desenho.plot.h;
      const linha = el("line");
      linha.setAttribute("x1", String(desenho.plot.x));
      linha.setAttribute("x2", String(desenho.plot.x + desenho.plot.w));
      linha.setAttribute("y1", y.toFixed(1));
      linha.setAttribute("y2", y.toFixed(1));
      linha.setAttribute("stroke", "rgba(255,255,255,0.1)");
      svg.appendChild(linha);
      const texto = el("text");
      texto.setAttribute("x", String(desenho.plot.x - 8));
      texto.setAttribute("y", y.toFixed(1));
      texto.setAttribute("fill", "#b7c9e6");
      texto.setAttribute("font-size", "12");
      texto.setAttribute("text-anchor", "end");
      texto.setAttribute("dominant-baseline", "middle");
      texto.textContent = formatEixo(tick, desenho.yDom.max - desenho.yDom.min);
      svg.appendChild(texto);
    });

    desenho.xTicks.forEach(function (tick) {
      const x = desenho.plot.x + (tick / 100) * desenho.plot.w;
      const texto = el("text");
      texto.setAttribute("x", x.toFixed(1));
      texto.setAttribute("y", String(desenho.plot.y + desenho.plot.h + 22));
      texto.setAttribute("fill", "#b7c9e6");
      texto.setAttribute("font-size", "12");
      texto.setAttribute("text-anchor", "middle");
      texto.textContent = String(tick).replace(".", ",") + "%";
      svg.appendChild(texto);
    });

    const eixoX = el("text");
    eixoX.setAttribute("x", String(desenho.plot.x + desenho.plot.w / 2));
    eixoX.setAttribute("y", String(desenho.height - 4));
    eixoX.setAttribute("fill", "#d5e6ff");
    eixoX.setAttribute("font-size", "12");
    eixoX.setAttribute("text-anchor", "middle");
    eixoX.textContent = "% de urnas apuradas";
    svg.appendChild(eixoX);

    desenho.series.forEach(function (serie) {
      if (serie.pontos.length > 1) {
        const caminho = el("path");
        caminho.setAttribute("fill", "none");
        caminho.setAttribute("stroke", serie.cor);
        caminho.setAttribute("stroke-width", "2.75");
        caminho.setAttribute("stroke-linejoin", "round");
        caminho.setAttribute("stroke-linecap", "round");
        caminho.setAttribute("d", serie.pontos.map(function (ponto, i) {
          return (i === 0 ? "M" : "L") + ponto.x.toFixed(1) + " " + ponto.y.toFixed(1);
        }).join(" "));
        svg.appendChild(caminho);
      }
      serie.pontos.forEach(function (ponto) {
        const circulo = el("circle");
        circulo.setAttribute("cx", ponto.x.toFixed(1));
        circulo.setAttribute("cy", ponto.y.toFixed(1));
        circulo.setAttribute("r", "5.5");
        circulo.setAttribute("fill", serie.cor);
        circulo.setAttribute("stroke", "#ffffff");
        circulo.setAttribute("stroke-width", "1.5");
        svg.appendChild(circulo);
        const alvo = el("circle");
        alvo.setAttribute("cx", ponto.x.toFixed(1));
        alvo.setAttribute("cy", ponto.y.toFixed(1));
        alvo.setAttribute("r", "14");
        alvo.setAttribute("fill", "transparent");
        alvo.setAttribute("tabindex", "0");
        alvo.setAttribute("role", "button");
        alvo.setAttribute("aria-label", serie.nome + ", " + (formatPct ? formatPct(ponto.pvap) : ponto.pvap) + ", urnas " + (formatPct ? formatPct(ponto.pst) : ponto.pst) + (ponto.dg && ponto.hg ? ", TSE " + ponto.dg + " " + ponto.hg : "") + (ponto.primeiro ? ", primeiro ponto" : ponto.delta ? ", " + ponto.delta : ""));
        alvo.addEventListener("mouseenter", function () { mostrar(ponto.index, ponto.x, ponto.y); });
        alvo.addEventListener("focus", function () { mostrar(ponto.index, ponto.x, ponto.y); });
        alvo.addEventListener("mouseleave", esconder);
        alvo.addEventListener("blur", esconder);
        svg.appendChild(alvo);
      });
    });

    const ultimos = desenho.series.map(function (serie) {
      return serie.pontos[serie.pontos.length - 1];
    }).filter(Boolean);
    ultimos.sort(function (a, b) { return a.y - b.y; });
    let cursor = desenho.plot.y;
    ultimos.forEach(function (ponto) {
      let y = ponto.y;
      if (y < cursor) y = cursor;
      if (y > desenho.plot.y + desenho.plot.h) y = desenho.plot.y + desenho.plot.h;
      cursor = y + 28;
      const naDireita = ponto.x > desenho.plot.x + desenho.plot.w * 0.62;
      const texto = el("text");
      texto.setAttribute("x", (naDireita ? ponto.x - 12 : ponto.x + 12).toFixed(1));
      texto.setAttribute("y", y.toFixed(1));
      texto.setAttribute("fill", "#f4f8ff");
      texto.setAttribute("font-size", "13");
      texto.setAttribute("font-weight", "650");
      texto.setAttribute("text-anchor", naDireita ? "end" : "start");
      texto.setAttribute("dominant-baseline", "middle");
      texto.setAttribute("pointer-events", "none");
      texto.textContent = (formatPct ? formatPct(ponto.pvap) : ponto.pvap) + (ponto.primeiro ? "" : ponto.delta ? "  " + ponto.delta : "");
      svg.appendChild(texto);
    });

    const tip = document.createElement("div");
    tip.className = "grafico-tip";
    tip.hidden = true;
    container.appendChild(tip);

    function mostrar(index, x, y) {
      const ponto = pontos[index];
      if (!ponto) return;
      tip.replaceChildren();
      if (ponto.dg && ponto.hg) {
        const hora = document.createElement("p");
        hora.className = "tip-hora";
        hora.textContent = "TSE " + ponto.dg + " às " + ponto.hg + " (Brasília)";
        tip.appendChild(hora);
      }
      const urnas = document.createElement("p");
      urnas.className = "tip-hora";
      urnas.textContent = "Urnas apuradas: " + (formatPct ? formatPct(ponto.pst) : ponto.pst);
      tip.appendChild(urnas);
      ponto.candidatos.forEach(function (cand) {
        const linha = document.createElement("p");
        linha.className = "tip-linha";
        const nome = document.createElement("span");
        nome.className = "tip-nome";
        nome.style.color = CORES[cand.lado] || CORES.outro;
        nome.textContent = cand.nome;
        const valor = document.createElement("span");
        valor.textContent = (formatPct ? formatPct(cand.pvap) : cand.pvap) + "  " + (cand.primeiro ? "primeiro ponto" : cand.delta || "");
        linha.appendChild(nome);
        linha.appendChild(valor);
        tip.appendChild(linha);
      });
      const rect = svg.getBoundingClientRect();
      const caixa = container.getBoundingClientRect();
      const sx = rect.width / desenho.width;
      const sy = rect.height / desenho.height;
      const left = rect.left - caixa.left + x * sx;
      const top = rect.top - caixa.top + y * sy;
      tip.hidden = false;
      const largura = tip.offsetWidth || 260;
      const minLeft = largura / 2 + 8;
      const maxLeft = Math.max(minLeft, caixa.width - largura / 2 - 8);
      tip.style.left = Math.max(minLeft, Math.min(maxLeft, left)) + "px";
      const acima = top > 110;
      tip.style.top = top + "px";
      tip.style.transform = acima ? "translate(-50%, calc(-100% - 12px))" : "translate(-50%, 14px)";
    }

    function esconder() {
      tip.hidden = true;
    }

    if (!(pontos || []).length) {
      const vazio = el("text");
      vazio.setAttribute("x", String(desenho.width / 2));
      vazio.setAttribute("y", String(desenho.height / 2));
      vazio.setAttribute("fill", "#b7c9e6");
      vazio.setAttribute("font-size", "14");
      vazio.setAttribute("text-anchor", "middle");
      vazio.textContent = "Sem atualização oficial";
      svg.appendChild(vazio);
    }

    return desenho;
  }

  return {
    CORES: CORES,
    dominioY: dominioY,
    layout: layout,
    desenhar: desenhar,
  };
});
