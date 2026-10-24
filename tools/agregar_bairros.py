#!/usr/bin/env python3
"""Agrega os locais de votação do 1º turno em município e bairro.

Lê data/locais/{uf}-1t.json e grava data/locais/{uf}-1t-mun.json e
data/locais/{uf}-1t-bairros.json. O centro de cada círculo é a média das
coordenadas dos locais, ponderada pelos votos válidos. Bairro vazio ou
placeholder vira "Bairro não informado". A chave do bairro ignora
maiúsculas, acentos e espaços repetidos.

Só grava se a soma dos bairros de cada município fechar com o município
e com o arquivo oficial {uf}{cd}-c0001-e006257-u.json, e se a soma do
estado fechar com {uf}-c0001-e006257-u.json (Flávio 22, Lula 13,
brancos vb, nulos vn e votos válidos vv).

Uso: python3 tools/agregar_bairros.py [rj|sp]
"""

import json
import sys
import unicodedata
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
BASE = "https://resultados.tse.jus.br/oficial/ele2026/6257/dados"
UA = {"User-Agent": "apuracao-2026 agregacao de bairros (1o turno)"}
PERMITIDOS = ("rj", "sp")
NAO_INFORMADO = "Bairro não informado"
# Placeholders do cadastro, não bairros. Nome real curto (Anil, Aré) fica.
DESCONHECIDO = {
    "",
    "-",
    "--",
    "---",
    ".",
    "..",
    "N/A",
    "NA",
    "N.A.",
    "NULL",
    "NONE",
    "NI",
    "SN",
    "S/N",
    "S/B",
    "0",
    "SEM BAIRRO",
    "S/BAIRRO",
    "SEM INFORMACAO",
    "NAO INFORMADO",
    "NAO CONSTA",
    "NAO IDENTIFICADO",
    "DESCONHECIDO",
    "IGNORADO",
}
CAMPOS = ("f", "u", "v", "br", "nu")


def norm_bairro(texto):
    limpo = " ".join((texto or "").split())
    chave = unicodedata.normalize("NFD", limpo)
    chave = "".join(c for c in chave if unicodedata.category(c) != "Mn")
    chave = " ".join(chave.upper().split())
    if chave in DESCONHECIDO:
        return "", NAO_INFORMADO
    return chave, limpo


def coord_valida(lat, lon):
    return lat is not None and lon is not None and -34 < lat < 6 and -75 < lon < -28


def coordenada(item):
    lat = item.get("la")
    lon = item.get("lo")
    if not coord_valida(lat, lon):
        return None
    return float(lat), float(lon)


def centro(locais):
    """Média ponderada pelos votos válidos. Local sem coordenada não entra."""
    com = []
    for local in locais:
        ponto = coordenada(local)
        if ponto is not None:
            com.append((ponto[0], ponto[1], int(local["v"])))
    if not com:
        return None
    peso = sum(item[2] for item in com)
    if peso > 0:
        lat = sum(item[0] * item[2] for item in com) / peso
        lon = sum(item[1] * item[2] for item in com) / peso
    else:
        lat = sum(item[0] for item in com) / len(com)
        lon = sum(item[1] for item in com) / len(com)
    return round(lat, 5), round(lon, 5)


def somar(locais):
    total = {campo: 0 for campo in CAMPOS}
    secoes = 0
    for local in locais:
        for campo in CAMPOS:
            total[campo] += int(local[campo])
        secoes += int(local["s"])
    total["loc"] = len(locais)
    total["s"] = secoes
    return total


def baixar(url):
    ultimo = "sem resposta"
    for tentativa in range(4):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:
            ultimo = repr(exc)
            if tentativa == 3:
                break
    raise RuntimeError(url + " " + ultimo)


def votos_oficiais(dado):
    votos = {}
    for agr in dado["carg"][0]["agr"]:
        for par in agr.get("par") or []:
            for cand in par.get("cand") or []:
                votos[int(cand["n"])] = int(cand["vap"])
    if 22 not in votos or 13 not in votos:
        raise RuntimeError("arquivo oficial sem Flávio (22) ou Lula (13): " + str(sorted(votos)))
    v = dado["v"]
    return {
        "f": votos[22],
        "u": votos[13],
        "v": int(v["vv"]),
        "br": int(v["vb"]),
        "nu": int(v["vn"]),
    }


def agregar(uf):
    origem = RAIZ / "data" / "locais" / f"{uf}-1t.json"
    dados = json.loads(origem.read_text(encoding="utf-8"))
    locais = list(dados.get("locais") or []) + list(dados.get("sem") or [])
    if not locais:
        raise SystemExit(f"{uf} sem locais em {origem}")

    por_mun = defaultdict(list)
    for local in locais:
        for campo in CAMPOS:
            if int(local[campo]) < 0:
                raise SystemExit(f"{uf} voto negativo em {local}")
        por_mun[int(local["cd"])].append(local)

    municipios = []
    bairros = []
    sem_bairro = []
    for cd, grupo in por_mun.items():
        nomes = Counter((item.get("m") or "").strip() for item in grupo)
        nome_mun = nomes.most_common(1)[0][0] or str(cd)
        por_bairro = defaultdict(list)
        grafias = defaultdict(list)
        for local in grupo:
            chave, grafia = norm_bairro(local.get("b") or "")
            por_bairro[chave].append(local)
            if chave:
                grafias[chave].append(grafia)
            else:
                sem_bairro.append(local)
        for chave, lugares in por_bairro.items():
            if chave:
                contagem = Counter(grafias[chave])
                nome_b = max(
                    contagem.items(),
                    key=lambda item: (item[1], sum(ord(c) > 127 for c in item[0]), len(item[0]), item[0]),
                )[0]
            else:
                nome_b = NAO_INFORMADO
            total_b = somar(lugares)
            ponto = centro(lugares)
            registro = {
                "cd": cd,
                "n": nome_b,
                "loc": total_b["loc"],
                "s": total_b["s"],
            }
            for campo in CAMPOS:
                registro[campo] = total_b[campo]
            if ponto is not None:
                registro["la"] = ponto[0]
                registro["lo"] = ponto[1]
            bairros.append(registro)

        total_m = somar(grupo)
        ponto_m = centro(grupo)
        if ponto_m is None:
            raise SystemExit(f"{uf} município {cd} {nome_mun} sem coordenada; nada foi gravado")
        registro_m = {
            "cd": cd,
            "n": nome_mun,
            "la": ponto_m[0],
            "lo": ponto_m[1],
            "loc": total_m["loc"],
            "s": total_m["s"],
        }
        for campo in CAMPOS:
            registro_m[campo] = total_m[campo]
        municipios.append(registro_m)

        do_mun = [item for item in bairros if item["cd"] == cd]
        soma_b = somar_registros(do_mun)
        for campo in ("loc", "s") + CAMPOS:
            if soma_b[campo] != registro_m[campo]:
                raise SystemExit(
                    f"{uf} {nome_mun} ({cd}) bairros {campo}={soma_b[campo]} != município {registro_m[campo]}"
                )

    municipios.sort(key=lambda item: (item["n"], item["cd"]))
    bairros.sort(key=lambda item: (item["cd"], item["n"] == NAO_INFORMADO, item["n"]))
    return dados, municipios, bairros, sem_bairro


def somar_registros(registros):
    total = {campo: 0 for campo in ("loc", "s") + CAMPOS}
    for item in registros:
        for campo in total:
            total[campo] += int(item[campo])
    return total


def relatorio_sem_bairro(uf, sem_bairro):
    print(f"{uf} locais sem bairro: {len(sem_bairro)} (agrupados como {NAO_INFORMADO!r})", flush=True)
    ordem = sorted(sem_bairro, key=lambda item: ((item.get("m") or ""), int(item["z"]), int(item["loc"])))
    for local in ordem:
        coord = "com coordenada" if coordenada(local) else "sem coordenada"
        nome = (local.get("n") or "").strip() or "(sem nome de local)"
        print(
            f"  {local.get('m')} ({local['cd']}) zona {local['z']} local {local['loc']} "
            f"seções {local['s']} Flávio {local['f']} Lula {local['u']} válidos {local['v']} "
            f"brancos {local['br']} nulos {local['nu']} {coord} — {nome}",
            flush=True,
        )


def conferir_oficial(uf, municipios):
    estado = baixar(f"{BASE}/{uf}/{uf}-c0001-e006257-u.json")
    if str(estado.get("cdabr", "")).lower() != uf:
        raise SystemExit(f"{uf} arquivo estadual com cdabr {estado.get('cdabr')}")
    oficial_uf = votos_oficiais(estado)
    soma = somar_registros(municipios)
    print(
        f"{uf} estado oficial dg={estado.get('dg')} hg={estado.get('hg')} "
        f"Flávio={oficial_uf['f']} Lula={oficial_uf['u']} brancos={oficial_uf['br']} "
        f"nulos={oficial_uf['nu']} válidos={oficial_uf['v']}",
        flush=True,
    )
    for campo, rotulo in (("f", "Flávio"), ("u", "Lula"), ("br", "brancos"), ("nu", "nulos"), ("v", "válidos")):
        if soma[campo] != oficial_uf[campo]:
            raise SystemExit(f"{uf} soma {rotulo} {soma[campo]} != oficial {oficial_uf[campo]}")
    print(f"{uf} soma do estado confere", flush=True)

    def um(mun):
        cd = f"{int(mun['cd']):05d}"
        url = f"{BASE}/{uf}/{uf}{cd}-c0001-e006257-u.json"
        dado = baixar(url)
        if str(int(dado["cdabr"])) != str(int(mun["cd"])):
            raise RuntimeError(f"{url} cdabr {dado.get('cdabr')}")
        oficial = votos_oficiais(dado)
        diferencas = []
        for campo in CAMPOS:
            if int(mun[campo]) != oficial[campo]:
                diferencas.append(f"{campo} nosso={mun[campo]} oficial={oficial[campo]}")
        return mun, diferencas, dado.get("dg"), dado.get("hg")

    falhas = []
    feitos = 0
    with ThreadPoolExecutor(max_workers=24) as pool:
        futuros = [pool.submit(um, mun) for mun in municipios]
        for futuro in as_completed(futuros):
            mun, diferencas, dg, hg = futuro.result()
            feitos += 1
            if diferencas:
                falhas.append(f"{mun['n']} ({mun['cd']}) {dg} {hg}: " + "; ".join(diferencas))
            if feitos % 100 == 0 or feitos == len(municipios):
                print(f"{uf} municípios oficiais conferidos {feitos}/{len(municipios)}", flush=True)
    if falhas:
        for linha in falhas:
            print(f"{uf} DIVERGE {linha}", flush=True)
        raise SystemExit(f"{uf} {len(falhas)} municípios divergem do arquivo oficial")
    print(f"{uf} {len(municipios)} municípios conferem com o TSE", flush=True)


def gravar(uf, municipios, bairros, sem_bairro, meta_origem):
    bairros_sem_coord = [item for item in bairros if "la" not in item]
    registros_sem = []
    for local in sorted(sem_bairro, key=lambda item: ((item.get("m") or ""), int(item["z"]), int(item["loc"]))):
        registros_sem.append(
            {
                "cd": int(local["cd"]),
                "m": (local.get("m") or "").strip(),
                "z": int(local["z"]),
                "loc": int(local["loc"]),
                "n": (local.get("n") or "").strip(),
                "s": int(local["s"]),
                "f": int(local["f"]),
                "u": int(local["u"]),
                "v": int(local["v"]),
                "br": int(local["br"]),
                "nu": int(local["nu"]),
                "coord": coordenada(local) is not None,
            }
        )
    fonte = (
        "TSE, boletins de urna (arquivo-urna/3220) somados por município e bairro "
        "(eleitorado_local_votacao_2026, NM_BAIRRO, NR_TURNO=1)."
    )
    corpo_mun = {
        "uf": uf,
        "turno": 1,
        "ele": "6257",
        "fonte": fonte,
        "meta": meta_origem,
        "mun": municipios,
        "semBairro": registros_sem,
    }
    corpo_b = {
        "uf": uf,
        "turno": 1,
        "ele": "6257",
        "fonte": fonte,
        "bairros": bairros,
    }
    pasta = RAIZ / "data" / "locais"
    pasta.mkdir(parents=True, exist_ok=True)
    dest_mun = pasta / f"{uf}-1t-mun.json"
    dest_b = pasta / f"{uf}-1t-bairros.json"
    dest_mun.write_text(json.dumps(corpo_mun, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    dest_b.write_text(json.dumps(corpo_b, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(
        f"gravou {dest_mun.name} ({dest_mun.stat().st_size} bytes, {len(municipios)} municípios) e "
        f"{dest_b.name} ({dest_b.stat().st_size} bytes, {len(bairros)} bairros, "
        f"{len(bairros_sem_coord)} sem coordenada)",
        flush=True,
    )


def meta_de(dados, municipios, bairros, sem_bairro):
    locais = list(dados.get("locais") or []) + list(dados.get("sem") or [])
    sem_coord = sum(1 for item in locais if coordenada(item) is None)
    return {
        "locais": len(locais),
        "secoes": sum(int(item["s"]) for item in locais),
        "semCoord": sem_coord,
        "semBairro": len(sem_bairro),
        "bairros": len(bairros),
        "bairrosSemCoord": sum(1 for item in bairros if "la" not in item),
        "municipios": len(municipios),
    }


def processar(uf):
    if uf not in PERMITIDOS:
        raise SystemExit("Este passo só cobre RJ e SP.")
    print(f"=== {uf} ===", flush=True)
    dados, municipios, bairros, sem_bairro = agregar(uf)
    meta = meta_de(dados, municipios, bairros, sem_bairro)
    print(
        f"{uf} {meta['municipios']} municípios, {meta['bairros']} bairros, "
        f"{meta['locais']} locais, {meta['secoes']} seções, "
        f"{meta['semCoord']} sem coordenada, {meta['semBairro']} sem bairro, "
        f"{meta['bairrosSemCoord']} bairros sem ponto",
        flush=True,
    )
    relatorio_sem_bairro(uf, sem_bairro)
    sem_ponto = [item for item in bairros if "la" not in item]
    for item in sem_ponto:
        print(
            f"  bairro sem ponto: {item['n']} cd={item['cd']} locais={item['loc']} "
            f"Flávio={item['f']} Lula={item['u']} válidos={item['v']}",
            flush=True,
        )
    conferir_oficial(uf, municipios)
    gravar(uf, municipios, bairros, sem_bairro, meta)


def main():
    args = [arg.lower() for arg in sys.argv[1:]]
    ufs = args or list(PERMITIDOS)
    for uf in ufs:
        processar(uf)


if __name__ == "__main__":
    main()
