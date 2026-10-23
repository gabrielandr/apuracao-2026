#!/usr/bin/env python3
"""Lê os boletins de urna do 1º turno (arquivo-urna/3220) de RJ e SP.

Só estes dois estados. Seções agregadas (DS_TIPO_SECAO_AGREGADA) não são
baixadas: a urna principal já contém esses votos. Coordenadas saem de
eleitorado_local_votacao_2026, NR_TURNO=1. O JSON só é gravado se a soma
bater com o arquivo oficial {uf}-c0001-e006257-u.json.
"""

import asyncio
import csv
import io
import json
import sqlite3
import sys
import time
import urllib.request
import zipfile
from pathlib import Path

import aiohttp

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ber import kids, tlv

RAIZ = Path(__file__).resolve().parents[1]
ZIP_COORDS = Path("/tmp/locais-work/eleitorado_local_votacao_2026.zip")
WORK = Path("/tmp/locais-work")
BASE_URNA = "https://resultados.tse.jus.br/oficial/ele2026/arquivo-urna/3220"
BASE_OFICIAL = "https://resultados.tse.jus.br/oficial/ele2026/6257/dados"
UA = {"User-Agent": "apuracao-2026 research (locais de votacao)"}
PERMITIDOS = ("rj", "sp")
CONCORRENCIA = 36
# Conferência extra, município do Rio, arquivo rj60011 (não é estimativa).
RIO_CAPITAL = {"f": 1662354, "u": 1524517}


def I(b, a, z):
    return int.from_bytes(b[a:z], "big", signed=True)


def parse_bu(b):
    """Separa votos nominais do cargo 1 e os totais de branco/nulo."""
    t, a, z, _ = tlv(b, 0)
    ch = kids(b, a, z)
    oc = [c for c in ch if c[0] == 4][0]
    bu = b[oc[1] : oc[2]]
    t, a, z, _ = tlv(bu, 0)
    idc = [c for c in ch if c[0] == 0xA0][0]
    k = kids(b, idc[1], idc[2])
    mz = kids(b, k[0][1], k[0][2])
    ident = {
        "mun": I(b, *mz[0][1:3]),
        "zona": I(b, *mz[1][1:3]),
        "local": I(b, *k[1][1:3]),
        "secao": I(b, *k[2][1:3]),
    }
    nominais = {}
    tipos = {}

    def walk(s, e):
        for tag, aa, zz, _ in kids(bu, s, e):
            if tag == 0x30:
                c = kids(bu, aa, zz)
                if len(c) >= 3 and c[0][0] == 0x81 and c[1][0] == 0x82 and c[2][0] == 0xA3 and cargo[0] == 1:
                    qtd = I(bu, *c[1][1:3])
                    num = I(bu, *kids(bu, c[2][1], c[2][2])[0][1:3])
                    nominais[num] = nominais.get(num, 0) + qtd
                elif len(c) >= 3 and c[0][0] == 0x81 and c[1][0] == 0x82 and c[2][0] == 0x02:
                    tv = I(bu, *c[0][1:3])
                    qtd = I(bu, *c[1][1:3])
                    if cargo[0] == 1:
                        tipos[tv] = tipos.get(tv, 0) + qtd
                elif len(c) >= 2 and c[0][0] == 0x81 and c[1][0] == 0x02:
                    cargo[0] = I(bu, *c[0][1:3])
                    walk(aa, zz)
                    cargo[0] = None
                else:
                    walk(aa, zz)
            elif tag & 0x20:
                walk(aa, zz)

    cargo = [None]
    walk(a, z)
    return ident, nominais, tipos


def carregar_csv(uf):
    """NR_TURNO=1. Devolve seções agregadas e a coordenada de cada local."""
    agregadas = set()
    locais = {}
    nome_arq = f"eleitorado_local_votacao_2026_{uf.upper()}.csv"
    with zipfile.ZipFile(ZIP_COORDS) as pacote:
        with pacote.open(nome_arq) as bruto:
            texto = io.TextIOWrapper(bruto, encoding="latin-1", newline="")
            for row in csv.DictReader(texto, delimiter=";"):
                if row["NR_TURNO"] != "1":
                    continue
                mun = int(row["CD_MUNICIPIO"])
                zona = int(row["NR_ZONA"])
                secao = int(row["NR_SECAO"])
                local = int(row["NR_LOCAL_VOTACAO"])
                if row["DS_TIPO_SECAO_AGREGADA"] == "Agregada":
                    agregadas.add((mun, zona, secao))
                chave = (mun, zona, local)
                lat = coordenada(row["NR_LATITUDE"])
                lon = coordenada(row["NR_LONGITUDE"])
                atual = locais.get(chave)
                if atual is None:
                    locais[chave] = {
                        "n": row["NM_LOCAL_VOTACAO"].strip(),
                        "b": row["NM_BAIRRO"].strip(),
                        "m": row["NM_MUNICIPIO"].strip(),
                        "la": lat,
                        "lo": lon,
                    }
                elif atual["la"] is None and lat is not None and lon is not None:
                    atual["la"] = lat
                    atual["lo"] = lon
    return agregadas, locais


def coordenada(texto):
    texto = (texto or "").strip().replace(",", ".")
    if not texto:
        return None
    try:
        valor = float(texto)
    except ValueError:
        return None
    return valor


def coordenada_valida(lat, lon):
    return lat is not None and lon is not None and -34 < lat < 6 and -75 < lon < -28


def baixar_json(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.loads(resp.read().decode("utf-8"))


def tarefas_da_config(uf, agregadas):
    config = baixar_json(f"{BASE_URNA}/config/{uf}/{uf}-p003220-cs.json")
    nomes = {}
    principais = []
    puladas = []
    for mun in config["abr"][0]["mu"]:
        cd = int(mun["cd"])
        nomes[cd] = mun["nm"].strip()
        for zona in mun["zon"]:
            z = int(zona["cd"])
            for sec in zona["sec"]:
                s = int(sec["ns"])
                item = (cd, z, s, mun["cd"], zona["cd"], sec["ns"])
                if (cd, z, s) in agregadas:
                    puladas.append(item)
                else:
                    principais.append(item)
    return principais, puladas, nomes


def abrir_db(uf):
    WORK.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(WORK / f"{uf}-secoes.sqlite")
    con.execute("PRAGMA journal_mode=WAL")
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS sec (
          mun INTEGER, zona INTEGER, secao INTEGER,
          local INTEGER, flavio INTEGER, lula INTEGER, validos INTEGER, brutos INTEGER,
          brancos INTEGER, nulos INTEGER, anulados INTEGER, outros INTEGER,
          status TEXT,
          PRIMARY KEY (mun, zona, secao)
        )
        """
    )
    con.commit()
    return con


def gravar(con, linhas):
    con.executemany(
        """
        INSERT INTO sec (mun, zona, secao, local, flavio, lula, validos, brutos, brancos, nulos, anulados, outros, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(mun, zona, secao) DO UPDATE SET
          local=excluded.local, flavio=excluded.flavio, lula=excluded.lula, validos=excluded.validos, brutos=excluded.brutos,
          brancos=excluded.brancos, nulos=excluded.nulos, anulados=excluded.anulados, outros=excluded.outros,
          status=excluded.status
        """,
        linhas,
    )
    con.commit()


async def baixar(session, url):
    ultimo = "sem resposta"
    for tentativa in range(4):
        try:
            async with session.get(url) as resp:
                if resp.status == 404:
                    return None, "404"
                if resp.status in (429, 500, 502, 503, 504):
                    ultimo = f"HTTP {resp.status}"
                    await asyncio.sleep(1 + tentativa)
                    continue
                resp.raise_for_status()
                return await resp.read(), ""
        except Exception as exc:
            ultimo = repr(exc)
            await asyncio.sleep(0.4 * (tentativa + 1))
    return None, ultimo


async def uma_secao(session, uf, item, numeros):
    mun, zona, secao, mun_s, zona_s, secao_s = item
    pasta = f"{BASE_URNA}/dados/{uf}/{mun_s}/{zona_s}/{secao_s}"
    aux_url = f"{pasta}/p003220-{uf}-m{mun_s}-z{zona_s}-s{secao_s}-aux.json"
    bruto, erro = await baixar(session, aux_url)
    if bruto is None:
        return (mun, zona, secao, None, 0, 0, 0, 0, 0, 0, 0, 0, "erro:" + erro), None, None
    aux = json.loads(bruto)
    melhor = None
    for entrada in aux.get("hashes") or []:
        nomes = [a["nm"] for a in entrada.get("arq") or [] if a.get("tp") in ("busa", "bu")]
        nomes.sort(key=lambda nome: "busa" not in nome)
        if nomes:
            melhor = (entrada["hash"], nomes[0])
    if not melhor:
        return (mun, zona, secao, None, 0, 0, 0, 0, 0, 0, 0, 0, "erro:semBU"), None, None
    bu, erro = await baixar(session, f"{pasta}/{melhor[0]}/{melhor[1]}")
    if bu is None:
        return (mun, zona, secao, None, 0, 0, 0, 0, 0, 0, 0, 0, "erro:" + erro), None, None
    ident, nominais, tipos = parse_bu(bu)
    if (ident["mun"], ident["zona"], ident["secao"]) != (mun, zona, secao):
        return (mun, zona, secao, ident["local"], 0, 0, 0, 0, 0, 0, 0, 0, "erro:ident"), None, None
    flavio = nominais.get(22, 0)
    lula = nominais.get(13, 0)
    # Fora da lista oficial (no 1º turno, o número 28) o TSE conta como nulo técnico, não como voto válido.
    validos = sum(qtd for num, qtd in nominais.items() if num in numeros)
    brutos = sum(nominais.values())
    brancos = tipos.get(2, 0)
    nulos = tipos.get(3, 0)
    anulados = tipos.get(4, 0)
    outros = sum(qtd for cod, qtd in tipos.items() if cod not in (2, 3, 4))
    return (
        (ident["mun"], ident["zona"], ident["secao"], ident["local"], flavio, lula, validos, brutos, brancos, nulos, anulados, outros, "ok"),
        tipos,
        nominais,
    )


async def correr(uf, fila, con, numeros):
    timeout = aiohttp.ClientTimeout(total=45, connect=12, sock_read=30)
    connector = aiohttp.TCPConnector(limit=CONCORRENCIA, limit_per_host=CONCORRENCIA)
    total = fila.qsize()
    feitos = 0
    ok = 0
    erros = 0
    inicio = time.time()
    tipos_total = {}
    hist = {}
    lote = []
    lock = asyncio.Lock()

    async with aiohttp.ClientSession(headers=UA, timeout=timeout, connector=connector) as session:
        async def worker():
            nonlocal feitos, ok, erros
            while True:
                item = await fila.get()
                if item is None:
                    fila.task_done()
                    return
                try:
                    linha, tipos, nominais = await uma_secao(session, uf, item, numeros)
                except Exception as exc:
                    mun, zona, secao = item[0], item[1], item[2]
                    linha, tipos, nominais = (mun, zona, secao, None, 0, 0, 0, 0, 0, 0, 0, 0, "erro:" + repr(exc)), None, None
                async with lock:
                    lote.append(linha)
                    feitos += 1
                    if linha[-1] == "ok":
                        ok += 1
                        if tipos:
                            for cod, qtd in tipos.items():
                                tipos_total[cod] = tipos_total.get(cod, 0) + qtd
                        if nominais:
                            for num, qtd in nominais.items():
                                hist[num] = hist.get(num, 0) + qtd
                    else:
                        erros += 1
                    if len(lote) >= 150:
                        gravar(con, lote)
                        lote.clear()
                    if feitos % 500 == 0 or feitos == total:
                        gasto = time.time() - inicio
                        taxa = feitos / gasto if gasto else 0
                        falta = (total - feitos) / taxa if taxa else 0
                        print(
                            f"{uf} {feitos}/{total} ok={ok} erros={erros} {taxa:.1f}/s falta {falta/60:.1f} min",
                            flush=True,
                        )
                fila.task_done()

        trabalhadores = [asyncio.create_task(worker()) for _ in range(CONCORRENCIA)]
        await fila.join()
        for _ in trabalhadores:
            await fila.put(None)
        await asyncio.gather(*trabalhadores)
    if lote:
        gravar(con, lote)
    print(f"{uf} tipos de voto no boletim: {dict(sorted(tipos_total.items()))}", flush=True)
    print(f"{uf} votos por número: {dict(sorted(hist.items()))}", flush=True)
    return hist


def oficial(uf):
    dado = baixar_json(f"{BASE_OFICIAL}/{uf}/{uf}-c0001-e006257-u.json")
    votos = {}
    for agr in dado["carg"][0]["agr"]:
        for par in agr.get("par") or []:
            for cand in par.get("cand") or []:
                votos[int(cand.get("n"))] = int(cand["vap"])
    v = dado["v"]
    return {
        "f": votos[22],
        "u": votos[13],
        "numeros": votos,
        "br": int(v["vb"]),
        "nu": int(v["vn"]),
        "nulos_tecnicos": int(v["vnt"]),
        "tvn": int(v["tvn"]),
        "vv": int(v["vv"]),
    }


def agregar(uf, coords, nomes):
    con = sqlite3.connect(WORK / f"{uf}-secoes.sqlite")
    linhas = con.execute(
        """
        SELECT mun, zona, local, COUNT(*), SUM(flavio), SUM(lula), SUM(validos), SUM(brutos), SUM(brancos), SUM(nulos), SUM(anulados), SUM(outros)
        FROM sec WHERE status='ok'
        GROUP BY mun, zona, local
        """
    ).fetchall()
    erros = con.execute("SELECT COUNT(*) FROM sec WHERE status LIKE 'erro%'").fetchone()[0]
    puladas = con.execute("SELECT COUNT(*) FROM sec WHERE status='agregada'").fetchone()[0]
    lidas = con.execute("SELECT COUNT(*) FROM sec WHERE status='ok'").fetchone()[0]
    locais = []
    sem = []
    totais = {"f": 0, "u": 0, "v": 0, "brutos": 0, "br": 0, "nu": 0, "an": 0, "out": 0}
    for mun, zona, local, secoes, flavio, lula, validos, brutos, brancos, nulos, anulados, outros in linhas:
        for chave, valor in (("f", flavio), ("u", lula), ("v", validos), ("brutos", brutos), ("br", brancos), ("nu", nulos), ("an", anulados), ("out", outros)):
            totais[chave] += valor or 0
        info = coords.get((mun, zona, local))
        item = {
            "cd": mun,
            "z": zona,
            "loc": local,
            "n": (info or {}).get("n") or "",
            "b": (info or {}).get("b") or "",
            "m": (info or {}).get("m") or nomes.get(mun) or str(mun),
            "s": secoes,
            "f": flavio or 0,
            "u": lula or 0,
            "v": validos or 0,
            "br": brancos or 0,
            "nu": nulos or 0,
        }
        lat = info["la"] if info else None
        lon = info["lo"] if info else None
        if coordenada_valida(lat, lon):
            item["la"] = round(lat, 5)
            item["lo"] = round(lon, 5)
            locais.append(item)
        else:
            sem.append(item)
    locais.sort(key=lambda item: (item["m"], item["z"], item["loc"]))
    sem.sort(key=lambda item: (item["m"], item["z"], item["loc"]))
    return locais, sem, totais, {"lidas": lidas, "agregadas": puladas, "erros": erros}


def conferir(uf, totais, locais, sem):
    esp = oficial(uf)
    print(
        f"{uf} oficiais flavio={esp['f']} lula={esp['u']} brancos={esp['br']} nulos={esp['nu']} "
        f"nulos_tecnicos={esp['nulos_tecnicos']} tvn={esp['tvn']} validos={esp['vv']}",
        flush=True,
    )
    print(
        f"{uf} boletins flavio={totais['f']} lula={totais['u']} brancos={totais['br']} nulos={totais['nu']} "
        f"anulados={totais['an']} outros={totais['out']} validos={totais['v']} brutos={totais['brutos']}",
        flush=True,
    )
    nulos_lugar = totais["nu"] + totais["out"] + totais["an"]
    ok = (
        totais["f"] == esp["f"]
        and totais["u"] == esp["u"]
        and totais["br"] == esp["br"]
        and totais["v"] == esp["vv"]
        and totais["brutos"] - totais["v"] == esp["nulos_tecnicos"]
        and totais["nu"] == esp["nu"]
        and (nulos_lugar == esp["tvn"] or (totais["out"] == 0 and totais["an"] == 0 and totais["nu"] + esp["nulos_tecnicos"] == esp["tvn"]))
    )
    if totais["nu"] != esp["nu"]:
        print(f"{uf} DIVERGE nulo do boletim {totais['nu']} != vn {esp['nu']}", flush=True)
    print(
        f"{uf} nulos: boletim {totais['nu']} + outros {totais['out']} + anulados {totais['an']} "
        f"= {nulos_lugar}; vn {esp['nu']}; tvn {esp['tvn']} (vn+vnt)",
        flush=True,
    )
    if uf == "rj":
        capital = {"f": 0, "u": 0}
        for item in locais + sem:
            if item["cd"] == 60011:
                capital["f"] += item["f"]
                capital["u"] += item["u"]
        print(f"rj capital 60011 flavio={capital['f']} lula={capital['u']}", flush=True)
        if capital != RIO_CAPITAL:
            print(f"rj capital DIVERGE do arquivo municipal esperado {RIO_CAPITAL}", flush=True)
            ok = False
        casa = [item for item in locais + sem if item["cd"] == 60011 and item["z"] == 4 and item["loc"] == 1058]
        print("rj Casa de Rui Barbosa", casa, flush=True)
    votos_fora = {"f": sum(item["f"] for item in sem), "u": sum(item["u"] for item in sem)}
    print(f"{uf} locais no mapa {len(locais)} sem coordenada {len(sem)} votos fora {votos_fora}", flush=True)
    return ok, esp


def gravar_json(uf, locais, sem, meta):
    destino = RAIZ / "data" / "locais" / f"{uf}-1t.json"
    destino.parent.mkdir(parents=True, exist_ok=True)
    corpo = {
        "uf": uf,
        "turno": 1,
        "ele": "6257",
        "pleito": "3220",
        "fonte": "TSE, boletins de urna (arquivo-urna/3220) e locais de votação (eleitorado_local_votacao_2026, NR_TURNO=1).",
        "secoesLidas": meta["lidas"],
        "secoesAgregadas": meta["agregadas"],
        "semCoord": len(sem),
        "locais": locais,
    }
    if sem:
        corpo["sem"] = sem
    destino.write_text(json.dumps(corpo, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"gravou {destino} ({destino.stat().st_size} bytes)", flush=True)


async def processar(uf, so_agregar=False):
    if uf not in PERMITIDOS:
        raise SystemExit("Este passo só cobre RJ e SP.")
    print(f"=== {uf} ===", flush=True)
    t0 = time.time()
    agregadas, coords = carregar_csv(uf)
    principais, puladas, nomes = tarefas_da_config(uf, agregadas)
    print(f"{uf} principais {len(principais)} agregadas {len(puladas)} locais com cadastro {len(coords)}", flush=True)
    con = abrir_db(uf)
    gravar(con, [(m, z, s, None, 0, 0, 0, 0, 0, 0, 0, 0, "agregada") for m, z, s, *_ in puladas])
    numeros = set(oficial(uf)["numeros"])
    if not so_agregar:
        for rodada in (1, 2):
            prontos = {tuple(row) for row in con.execute("SELECT mun, zona, secao FROM sec WHERE status='ok'")}
            pendentes = [item for item in principais if (item[0], item[1], item[2]) not in prontos]
            print(f"{uf} rodada {rodada}: a buscar {len(pendentes)} (já ok {len(prontos)})", flush=True)
            if not pendentes:
                break
            fila = asyncio.Queue()
            for item in pendentes:
                fila.put_nowait(item)
            await correr(uf, fila, con, numeros)
    locais, sem, totais, meta = agregar(uf, coords, nomes)
    ok, _esp = conferir(uf, totais, locais, sem)
    if ok and meta["erros"] == 0:
        gravar_json(uf, locais, sem, meta)
    else:
        print(f"{uf} NÃO gravado: conferência={ok} erros={meta['erros']}", flush=True)
    print(f"{uf} tempo {(time.time()-t0)/60:.1f} min", flush=True)
    return ok and meta["erros"] == 0


def main():
    args = [arg.lower() for arg in sys.argv[1:]]
    so_agregar = "--so-agregar" in args
    ufs = [arg for arg in args if arg != "--so-agregar"] or list(PERMITIDOS)
    for uf in ufs:
        if uf not in PERMITIDOS:
            raise SystemExit("Este passo só cobre RJ e SP.")
    resultados = []
    for uf in ufs:
        resultados.append(asyncio.run(processar(uf, so_agregar=so_agregar)))
    if not all(resultados):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
