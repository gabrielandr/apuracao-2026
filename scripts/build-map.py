#!/usr/bin/env python3
"""Gera assets/brazil.svg a partir do GeoJSON público das UFs.

Fonte das geometrias (não versionada, ~3 MB):
https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.geojson

Uso: python3 scripts/build-map.py /caminho/brazil-states.geojson
"""

import html
import math
import sys
from pathlib import Path

EPS = 0.045
MIN_HOLE = 0.03
LAT0 = math.radians(-14.5)
COS = math.cos(LAT0)
CONTENT_W = 760
PAD_L, PAD_T, PAD_R, PAD_B = 24, 18, 86, 22
# UFs pequenas demais para a sigla e o percentual dentro do polígono.
CALLOUT = {"rn", "pb", "al", "se", "es", "rj"}
# DF fica no meio do país: rótulo curto ao lado, sem a coluna do litoral.
NUDGE = {
    "ac": (8, 0),
    "am": (16, 6),
    "ap": (0, 10),
    "ba": (10, 8),
    "ce": (0, 4),
    "go": (-8, 10),
    "ma": (6, 8),
    "mg": (8, 10),
    "ms": (0, 4),
    "mt": (0, 6),
    "pa": (-6, 12),
    "pe": (0, 2),
    "pi": (0, -2),
    "pr": (0, 2),
    "ro": (4, 2),
    "rr": (0, 8),
    "rs": (0, 8),
    "sc": (0, 0),
    "sp": (-6, 6),
    "to": (0, 4),
}


def rdp(points, eps):
    if len(points) < 3:
        return points[:]
    closed = points[0] == points[-1]
    pts = points[:-1] if closed and len(points) > 2 else points[:]
    if len(pts) < 3:
        return points[:]

    def dist(p, a, b):
        ax, ay = a
        bx, by = b
        px, py = p
        dx, dy = bx - ax, by - ay
        if dx == 0 and dy == 0:
            return math.hypot(px - ax, py - ay)
        t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        return math.hypot(px - (ax + t * dx), py - (ay + t * dy))

    a, b = pts[0], pts[-1]
    md, idx = -1.0, 0
    for i in range(1, len(pts) - 1):
        d = dist(pts[i], a, b)
        if d > md:
            md, idx = d, i
    if md > eps:
        left = rdp(pts[: idx + 1], eps)
        right = rdp(pts[idx:], eps)
        out = left[:-1] + right
    else:
        out = [a, b]
    if closed and out[0] != out[-1]:
        out.append(out[0])
    return out


def ring_area(ring):
    area = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i]
        x2, y2 = ring[i + 1]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2


def polygons(geom):
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    if geom["type"] == "MultiPolygon":
        return geom["coordinates"]
    return []


def project(lon, lat):
    return lon * COS, -lat


def fmt(n):
    return f"{n:.1f}"


def centroid(ring):
    pts = ring[:-1] if ring[0] == ring[-1] else ring
    acc = cx = cy = 0.0
    for i, (x1, y1) in enumerate(pts):
        x2, y2 = pts[(i + 1) % len(pts)]
        cross = x1 * y2 - x2 * y1
        acc += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    if abs(acc) < 1e-9:
        return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
    acc *= 0.5
    return cx / (6 * acc), cy / (6 * acc)


def main():
    import json

    src = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/tse/br1.geojson")
    data = json.loads(src.read_text())
    states = []
    for feature in data["features"]:
        kept = []
        for poly in polygons(feature["geometry"]):
            rings = []
            for index, ring in enumerate(poly):
                if index > 0 and ring_area(ring) < MIN_HOLE:
                    continue
                simple = rdp(ring, EPS)
                if len(simple) >= 4:
                    rings.append(simple)
            if rings:
                kept.append(rings)
        states.append(
            {
                "uf": feature["properties"]["sigla"].lower(),
                "nome": feature["properties"]["name"],
                "polys": kept,
            }
        )

    xs, ys = [], []
    for state in states:
        for poly in state["polys"]:
            for ring in poly:
                for lon, lat in ring:
                    x, y = project(lon, lat)
                    xs.append(x)
                    ys.append(y)
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    scale = CONTENT_W / (maxx - minx)
    vb_w = CONTENT_W + PAD_L + PAD_R
    vb_h = (maxy - miny) * scale + PAD_T + PAD_B

    def to_svg(lon, lat):
        x, y = project(lon, lat)
        return (x - minx) * scale + PAD_L, (y - miny) * scale + PAD_T

    prepared = []
    for state in states:
        best, best_a = None, -1
        pts = []
        parts = []
        for poly in state["polys"]:
            for ring in poly:
                area = ring_area(ring)
                if area > best_a:
                    best_a, best = area, ring
                cmds = []
                for i, (lon, lat) in enumerate(ring):
                    x, y = to_svg(lon, lat)
                    pts.append((x, y))
                    cmds.append(("M" if i == 0 else "L") + fmt(x) + " " + fmt(y))
                cmds.append("Z")
                parts.append(" ".join(cmds))
        cx, cy = to_svg(*centroid(best))
        prepared.append(
            {
                **state,
                "d": " ".join(parts),
                "cx": cx,
                "cy": cy,
                "bw": max(p[0] for p in pts) - min(p[0] for p in pts),
                "bh": max(p[1] for p in pts) - min(p[1] for p in pts),
            }
        )

    right_x = PAD_L + CONTENT_W + 10
    coastal = sorted((s for s in prepared if s["uf"] in CALLOUT), key=lambda s: s["cy"])
    placed = []
    prev = -1e9
    for state in coastal:
        y = max(state["cy"], prev + 26)
        placed.append(y)
        prev = y
    overflow = placed[-1] - (vb_h - 18) if placed else 0
    if overflow > 0:
        placed = [y - overflow for y in placed]
    callout_at = {state["uf"]: y for state, y in zip(coastal, placed)}

    lines = []
    groups = []
    pills = []
    for state in prepared:
        uf = state["uf"]
        nome = html.escape(state["nome"])
        hit = ""
        if state["bw"] < 52 or state["bh"] < 40:
            hit = f'<circle class="hit" cx="{fmt(state["cx"])}" cy="{fmt(state["cy"])}" r="16"/>'
        groups.append(
            f'<g class="uf neutro" data-uf="{uf}" data-nome="{nome}" role="button" tabindex="0" aria-label="{nome}">'
            f'<path d="{state["d"]}" fill-rule="evenodd"/>{hit}'
        )
        if uf in callout_at or uf == "df":
            groups[-1] += "</g>"
            if uf == "df":
                lx, ly = state["cx"] - 2, state["cy"] - 30
                anchor_x = state["cx"]
            else:
                lx, ly = right_x, callout_at[uf]
                anchor_x = lx - 22
            lines.append(
                f'<line x1="{fmt(state["cx"])}" y1="{fmt(state["cy"])}" x2="{fmt(anchor_x)}" y2="{fmt(ly)}"/>'
            )
            pills.append(
                f'<g class="callout" data-uf="{uf}" role="button" tabindex="0" aria-label="{nome}">'
                f'<rect x="{fmt(lx - 22)}" y="{fmt(ly - 16)}" width="46" height="32" rx="7"/>'
                f'<text class="sigla" font-size="12" x="{fmt(lx)}" y="{fmt(ly - 3)}" text-anchor="middle">{uf.upper()}</text>'
                f'<text class="pst" font-size="11" x="{fmt(lx)}" y="{fmt(ly + 11)}" text-anchor="middle">—</text>'
                f"</g>"
            )
        else:
            dx, dy = NUDGE.get(uf, (0, 0))
            x, y = state["cx"] + dx, state["cy"] + dy
            groups[-1] += (
                f'<text class="sigla" font-size="13" x="{fmt(x)}" y="{fmt(y - 7)}" text-anchor="middle">{uf.upper()}</text>'
                f'<text class="pst" font-size="11" x="{fmt(x)}" y="{fmt(y + 8)}" text-anchor="middle">—</text>'
                f"</g>"
            )

    svg = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vb_w:.1f} {vb_h:.1f}" id="mapa-svg" role="group" aria-label="Mapa do Brasil por unidade da federação">',
        '<g id="callout-lines" fill="none" stroke-linecap="round">',
        *lines,
        "</g>",
        *groups,
        *pills,
        "</svg>",
        "",
    ]
    out = Path(__file__).resolve().parents[1] / "assets" / "brazil.svg"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(svg))
    print(f"escreveu {out} ({out.stat().st_size} bytes), viewBox {vb_w:.0f}×{vb_h:.0f}")


if __name__ == "__main__":
    main()
