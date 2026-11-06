"""Pipeline géomatique d'acquisition et d'intégration SIG — Lot 1 (O.I.D Abidjan).

Sous-commandes :
  fetch   : Télécharge les limites administratives réelles (OSM Overpass / HDX COD-AB)
            et le raster officiel WorldPop 100 m Côte d'Ivoire (UNadj) dans `data/raw/`.
  process : Construit hors-ligne `data/geo/abidjan_13_communes.geojson`, le sous-raster
            compressé `data/geo/abidjan_worldpop_100m.npz` et `data/geo/sources_metadata.json`.
  load-db : Charge les 13 communes réelles dans PostGIS (`zone`), génère le maillage hexagonal
            métrique `ST_HexagonGrid(300, ...)` en `EPSG:32630`, agrège la population WorldPop
            100 m sur chaque hexagone (`maille_analyse`) et recale les incidents par `ST_Intersects`.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import unicodedata
import zipfile
from datetime import UTC, datetime
from pathlib import Path

import httpx
import numpy as np
import shapely
from PIL import Image
from shapely import STRtree, points
from shapely.geometry import LineString, MultiPolygon, Polygon, mapping, shape
from shapely.ops import linemerge, polygonize, unary_union

# Autoriser l'ouverture du GeoTIFF national WorldPop Côte d'Ivoire (~120 Mpx) via Pillow libtiff
Image.MAX_IMAGE_PIXELS = None

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

RAW_DIR = ROOT_DIR / "data" / "raw"
GEO_DIR = ROOT_DIR / "data" / "geo"

COMMUNES_GEOJSON_PATH = GEO_DIR / "abidjan_13_communes.geojson"
WORLDPOP_NPZ_PATH = GEO_DIR / "abidjan_worldpop_100m.npz"
DEM_HYDRO_NPZ_PATH = GEO_DIR / "abidjan_dem_hydro.npz"
HYDRO_GEOJSON_PATH = GEO_DIR / "abidjan_hydro_lines.geojson"
METADATA_JSON_PATH = GEO_DIR / "sources_metadata.json"

OSM_ADMIN_RAW = RAW_DIR / "abidjan_osm_admin.json"
OSM_WATER_RAW = RAW_DIR / "abidjan_osm_water.json"
OSM_HYDRO_RAW = RAW_DIR / "abidjan_osm_hydro.json"
TERRARIUM_DIR = RAW_DIR / "terrarium_z12"
TERRARIUM_ZOOM = 12
HDX_CODAB_ZIP = RAW_DIR / "civ_admin_boundaries.geojson.zip"
WORLDPOP_TIF_RAW = RAW_DIR / "civ_ppp_2020_UNadj.tif"

# Emprise englobante du District Autonome d'Abidjan (13 communes) avec marge de sécurité
ABIDJAN_BBOX = (-4.46, 5.16, -3.66, 5.68)  # (min_lon, min_lat, max_lon, max_lat)
HEX_SIDE_M = 300.0

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

WORLDPOP_URLS = [
    "https://data.worldpop.org/GIS/Population/Global_2000_2020_Constrained/2020/maxar_v1/CIV/civ_ppp_2020_UNadj_constrained.tif",
    "https://data.worldpop.org/GIS/Population/Global_2000_2020/2020/CIV/civ_ppp_2020_UNadj.tif",
    "https://data.worldpop.org/GIS/Population/Global_2000_2020/2020/CIV/civ_ppp_2020.tif",
]

HDX_CODAB_URL = (
    "https://data.humdata.org/dataset/503a9167-ba56-4174-b160-bdb0fb703719/"
    "resource/321e55d2-3486-400a-a855-4b749cf9ef88/download/civ_admin_boundaries.geojson.zip"
)

# Les 13 communes officielles du District Autonome d'Abidjan
TARGET_COMMUNES: dict[str, tuple[str, str]] = {
    "abobo": ("Abobo", "CIV-ABJ-001"),
    "adjame": ("Adjamé", "CIV-ABJ-002"),
    "anyama": ("Anyama", "CIV-ABJ-003"),
    "attecoube": ("Attécoubé", "CIV-ABJ-004"),
    "bingerville": ("Bingerville", "CIV-ABJ-005"),
    "cocody": ("Cocody", "CIV-ABJ-006"),
    "koumassi": ("Koumassi", "CIV-ABJ-007"),
    "marcory": ("Marcory", "CIV-ABJ-008"),
    "plateau": ("Plateau", "CIV-ABJ-009"),
    "portbouet": ("Port-Bouët", "CIV-ABJ-010"),
    "songon": ("Songon", "CIV-ABJ-011"),
    "treichville": ("Treichville", "CIV-ABJ-012"),
    "yopougon": ("Yopougon", "CIV-ABJ-013"),
}


def _slugify(text: str) -> str:
    """Normalise un toponyme pour appariement canonique robuste."""
    t = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii").lower()
    for prefix in (
        "commune de ",
        "commune d'",
        "commune du ",
        "sous-prefecture de ",
        "sous-prefecture d'",
        "mairie de ",
        "le ",
    ):
        if t.startswith(prefix):
            t = t[len(prefix) :]
    return "".join(ch for ch in t if ch.isalnum())


def _to_multipolygon(geom) -> MultiPolygon | None:
    """Garantit une géométrie MultiPolygon valide et non vide."""
    if geom is None or geom.is_empty:
        return None
    valid = shapely.make_valid(geom)
    polys: list[Polygon] = []

    def _collect(g):
        if g.is_empty:
            return
        if isinstance(g, Polygon):
            if g.area > 1e-9:
                polys.append(g)
        elif isinstance(g, MultiPolygon):
            for p in g.geoms:
                if p.area > 1e-9:
                    polys.append(p)
        elif hasattr(g, "geoms"):
            for sub in g.geoms:
                _collect(sub)

    _collect(valid)
    if not polys:
        return None
    merged = unary_union(polys)
    if isinstance(merged, Polygon):
        return MultiPolygon([merged])
    if isinstance(merged, MultiPolygon):
        return merged
    return None


def _relation_to_multipolygon(rel: dict) -> MultiPolygon | None:
    """Reconstruit topologiquement un MultiPolygon depuis une relation OSM (`out geom;`)."""
    outer_lines = []
    inner_lines = []

    for member in rel.get("members", []):
        if member.get("type") != "way":
            continue
        coords_raw = member.get("geometry") or []
        if len(coords_raw) < 2:
            continue
        coords = [(pt["lon"], pt["lat"]) for pt in coords_raw]
        line = LineString(coords)
        role = member.get("role", "outer")
        if role == "inner":
            inner_lines.append(line)
        else:
            outer_lines.append(line)

    if not outer_lines:
        return None

    merged_outer = linemerge(outer_lines)
    outer_polys = list(polygonize(merged_outer))
    if not outer_polys:
        return None

    geom = unary_union(outer_polys)
    if inner_lines:
        inner_polys = list(polygonize(linemerge(inner_lines)))
        if inner_polys:
            geom = geom.difference(unary_union(inner_polys))

    return _to_multipolygon(geom)


def _query_overpass(query: str, out_path: Path) -> bool:
    """Exécute une requête Overpass QL avec bascule automatique sur les miroirs officiels."""
    headers = {"User-Agent": "OID-Geomatics-Pipeline/1.0 (Abidjan Flood Observatory)"}
    for endpoint in OVERPASS_ENDPOINTS:
        try:
            print(f"[fetch] Requête Overpass sur {endpoint} ...")
            with httpx.Client(timeout=120.0, follow_redirects=True, headers=headers) as client:
                resp = client.post(endpoint, data={"data": query})
                resp.raise_for_status()
                payload = resp.json()
                if payload.get("elements"):
                    out_path.write_text(json.dumps(payload), encoding="utf-8")
                    print(f"[fetch] OK -> {out_path.name} ({len(payload['elements'])} éléments)")
                    return True
        except Exception as exc:
            print(f"[fetch] Avertissement sur {endpoint} : {exc}")
    return False


def _download_stream(urls: list[str], dest: Path, label: str) -> str:
    """Télécharge un fichier volumineux en flux continu avec barre de progression."""
    headers = {"User-Agent": "OID-Geomatics-Pipeline/1.0"}
    last_err: Exception | None = None
    for url in urls:
        tmp = dest.with_suffix(dest.suffix + ".part")
        try:
            print(f"[fetch] Téléchargement {label} : {url}")
            with (
                httpx.Client(timeout=300.0, follow_redirects=True, headers=headers) as client,
                client.stream("GET", url) as resp,
            ):
                resp.raise_for_status()
                total = int(resp.headers.get("Content-Length", 0))
                downloaded = 0
                with tmp.open("wb") as fh:
                    for chunk in resp.iter_bytes(chunk_size=1024 * 512):
                        fh.write(chunk)
                        downloaded += len(chunk)
                if total and downloaded < total * 0.95:
                    raise RuntimeError(f"Téléchargement incomplet ({downloaded}/{total} octets)")
            tmp.replace(dest)
            size_mb = dest.stat().st_size / (1024 * 1024)
            print(f"[fetch] Terminé : {dest.name} ({size_mb:.2f} Mo)")
            return url
        except Exception as exc:
            last_err = exc
            if tmp.exists():
                tmp.unlink()
            print(f"[fetch] Échec sur {url} : {exc}")
    raise RuntimeError(f"Impossible de télécharger {label} : {last_err}")


def cmd_fetch() -> None:
    """Étape 1 : téléchargement des sources ouvertes dans data/raw/."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    min_lon, min_lat, max_lon, max_lat = ABIDJAN_BBOX
    bbox_ql = f"{min_lat},{min_lon},{max_lat},{max_lon}"

    if not OSM_ADMIN_RAW.exists():
        admin_query = f"""
        [out:json][timeout:120];
        (
          relation["boundary"="administrative"]["admin_level"~"^(6|7|8|9)$"]({bbox_ql});
        );
        out geom;
        """
        _query_overpass(admin_query, OSM_ADMIN_RAW)
    else:
        print(f"[fetch] Cache présent : {OSM_ADMIN_RAW.name}")

    if not OSM_WATER_RAW.exists():
        water_query = """
        [out:json][timeout:120];
        (
          relation["natural"="water"](5.20,-4.45,5.42,-3.70);
          way["natural"="water"]["water"="lagoon"](5.20,-4.45,5.42,-3.70);
        );
        out geom;
        """
        _query_overpass(water_query, OSM_WATER_RAW)
    else:
        print(f"[fetch] Cache présent : {OSM_WATER_RAW.name}")

    # Archive officielle OCHA COD-AB en complément / validation croisée
    if not HDX_CODAB_ZIP.exists():
        try:
            _download_stream([HDX_CODAB_URL], HDX_CODAB_ZIP, "OCHA COD-AB Côte d'Ivoire")
        except Exception as exc:
            print(f"[fetch] Note : archive COD-AB secondaire non téléchargée ({exc})")

    if not WORLDPOP_TIF_RAW.exists():
        url_used = _download_stream(WORLDPOP_URLS, WORLDPOP_TIF_RAW, "WorldPop CIV 100m GeoTIFF")
        (RAW_DIR / "worldpop_source_url.txt").write_text(url_used, encoding="utf-8")
    else:
        print(f"[fetch] Cache présent : {WORLDPOP_TIF_RAW.name}")

    # Lot 2 : Réseau hydrographique & canaux de drainage OSM + trait de côte
    if not OSM_HYDRO_RAW.exists():
        hydro_query = f"""
        [out:json][timeout:120];
        (
          way["waterway"~"^(river|stream|canal|drain|ditch)$"]({bbox_ql});
          way["natural"="coastline"](5.16,-4.46,5.42,-3.66);
        );
        out geom;
        """
        _query_overpass(hydro_query, OSM_HYDRO_RAW)
    else:
        print(f"[fetch] Cache présent : {OSM_HYDRO_RAW.name}")

    # Lot 2 : Modèle Numérique de Terrain (AWS Open Terrain Tiles / SRTM-Copernicus z=12 ~38 m)
    _fetch_terrarium_dem_tiles()


def _lonlat_to_tile_xy(lon_deg: float, lat_deg: float, zoom: int) -> tuple[int, int]:
    """Convertit (lon, lat) WGS84 en indices de tuile Web Mercator (x, y)."""
    n = 1 << zoom
    xtile = int((lon_deg + 180.0) / 360.0 * n)
    lat_rad = math.radians(lat_deg)
    ytile = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return xtile, ytile


def _fetch_terrarium_dem_tiles() -> None:
    """Télécharge la mosaïque MNT Terrarium z=12 (~38 m/px, précision verticale 0,1 m) sur Abidjan."""
    TERRARIUM_DIR.mkdir(parents=True, exist_ok=True)
    min_lon, min_lat, max_lon, max_lat = ABIDJAN_BBOX
    x_min, y_max = _lonlat_to_tile_xy(min_lon, min_lat, TERRARIUM_ZOOM)
    x_max, y_min = _lonlat_to_tile_xy(max_lon, max_lat, TERRARIUM_ZOOM)

    missing_tiles = [
        (tx, ty)
        for ty in range(y_min, y_max + 1)
        for tx in range(x_min, x_max + 1)
        if not (TERRARIUM_DIR / f"z{TERRARIUM_ZOOM}_{tx}_{ty}.png").exists()
    ]
    if not missing_tiles:
        total_t = (x_max - x_min + 1) * (y_max - y_min + 1)
        print(f"[fetch] Cache MNT présent : {TERRARIUM_DIR.name} ({total_t} tuiles)")
        return

    print(f"[fetch] Téléchargement de {len(missing_tiles)} tuiles MNT Terrarium z={TERRARIUM_ZOOM} (~38 m)...")
    headers = {"User-Agent": "OID-Geomatics-Pipeline/1.0"}
    with httpx.Client(timeout=60.0, follow_redirects=True, headers=headers) as client:
        for tx, ty in missing_tiles:
            url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{TERRARIUM_ZOOM}/{tx}/{ty}.png"
            dest = TERRARIUM_DIR / f"z{TERRARIUM_ZOOM}_{tx}_{ty}.png"
            resp = client.get(url)
            resp.raise_for_status()
            dest.write_bytes(resp.content)
    print(f"[fetch] Mosaïque MNT Terrarium enregistrée dans {TERRARIUM_DIR.name}.")


def _extract_communes_from_sources() -> tuple[dict[str, tuple[MultiPolygon, str]], MultiPolygon | None]:
    """Assemble les 13 communes d'Abidjan depuis OSM admin_level=8/7 (+ repli COD-AB) et la lagune."""
    candidates: dict[str, list[tuple[int, float, MultiPolygon, str]]] = {k: [] for k in TARGET_COMMUNES}

    if OSM_ADMIN_RAW.exists():
        osm_data = json.loads(OSM_ADMIN_RAW.read_text(encoding="utf-8"))
        for el in osm_data.get("elements", []):
            if el.get("type") != "relation":
                continue
            tags = el.get("tags", {})
            admin_lvl_str = tags.get("admin_level", "")
            if not admin_lvl_str.isdigit():
                continue
            admin_lvl = int(admin_lvl_str)

            for tag_key in ("name", "name:fr", "official_name", "short_name"):
                raw_name = tags.get(tag_key)
                if not raw_name:
                    continue
                slug = _slugify(raw_name)
                if slug in TARGET_COMMUNES:
                    mp = _relation_to_multipolygon(el)
                    if mp is not None:
                        # Priorité : admin_level=8 (commune urbaine), puis 7 (sous-préfecture), puis 6
                        prio = 0 if admin_lvl == 8 else (1 if admin_lvl == 7 else 2)
                        candidates[slug].append((prio, -mp.area, mp, f"OpenStreetMap (relation/{el['id']}, admin_level={admin_lvl})"))
                    break

    # Complément éventuel depuis OCHA COD-AB ADM3 si une sous-préfecture périphérique manquait dans OSM
    missing = [k for k, v in candidates.items() if not v]
    if missing and HDX_CODAB_ZIP.exists():
        with zipfile.ZipFile(HDX_CODAB_ZIP, "r") as zf:
            adm3_files = [n for n in zf.namelist() if "adm3" in n.lower() and n.endswith(".geojson")]
            for fname in adm3_files:
                fc = json.loads(zf.read(fname).decode("utf-8"))
                for feat in fc.get("features", []):
                    props = feat.get("properties", {})
                    for val in props.values():
                        if isinstance(val, str):
                            slug = _slugify(val)
                            if slug in missing:
                                mp = _to_multipolygon(shape(feat["geometry"]))
                                if mp is not None:
                                    candidates[slug].append((3, -mp.area, mp, f"OCHA COD-AB ({fname})"))

    # Extraction du plan d'eau lagunaire (Lagune Ébrié) pour découpage propre des berges
    lagoon_mp: MultiPolygon | None = None
    if OSM_WATER_RAW.exists():
        water_data = json.loads(OSM_WATER_RAW.read_text(encoding="utf-8"))
        water_polys = []
        for el in water_data.get("elements", []):
            if el.get("type") == "relation":
                mp = _relation_to_multipolygon(el)
                if mp is not None and mp.area > 1e-5:
                    water_polys.append(mp)
            elif el.get("type") == "way":
                coords = [(pt["lon"], pt["lat"]) for pt in el.get("geometry", [])]
                if len(coords) >= 4 and coords[0] == coords[-1]:
                    p = _to_multipolygon(Polygon(coords))
                    if p is not None and p.area > 1e-5:
                        water_polys.append(p)
        if water_polys:
            lagoon_mp = _to_multipolygon(unary_union(water_polys))

    selected: dict[str, tuple[MultiPolygon, str]] = {}
    for slug, items in candidates.items():
        if not items:
            raise RuntimeError(
                f"Polygone introuvable pour la commune '{TARGET_COMMUNES[slug][0]}'. "
                "Vérifiez l'exécution de `ingest_abidjan_sig.py fetch`."
            )
        items.sort(key=lambda t: (t[0], t[1]))
        geom_best, src_best = items[0][2], items[0][3]
        # Soustraction du plan d'eau lagunaire majeur si le polygone administratif déborde sur la lagune
        if lagoon_mp is not None:
            clipped = _to_multipolygon(geom_best.difference(lagoon_mp))
            if clipped is not None and clipped.area >= geom_best.area * 0.25:
                geom_best = clipped
        selected[slug] = (geom_best, src_best)

    # Résolution des micro-chevauchements de frontières (les communes plus petites gardent leur emprise exacte)
    ordered_slugs = sorted(selected.keys(), key=lambda s: selected[s][0].area)
    occupied = None
    cleaned: dict[str, tuple[MultiPolygon, str]] = {}
    for slug in ordered_slugs:
        geom_cur, src_cur = selected[slug]
        if occupied is not None and geom_cur.intersects(occupied):
            diff = _to_multipolygon(geom_cur.difference(occupied))
            if diff is not None and diff.area > geom_cur.area * 0.30:
                geom_cur = diff
        occupied = geom_cur if occupied is None else unary_union([occupied, geom_cur])
        cleaned[slug] = (geom_cur, src_cur)

    return cleaned, lagoon_mp


def _extract_worldpop_abidjan_clip() -> tuple[np.ndarray, np.ndarray, np.ndarray, str]:
    """Découpe la fenêtre Abidjan du GeoTIFF WorldPop 100 m via Pillow libtiff (zéro GDAL)."""
    if not WORLDPOP_TIF_RAW.exists():
        raise FileNotFoundError(f"Raster WorldPop absent : {WORLDPOP_TIF_RAW}")

    min_lon, min_lat, max_lon, max_lat = ABIDJAN_BBOX
    with Image.open(WORLDPOP_TIF_RAW) as img:
        tags = img.tag_v2
        scale = tags.get(33550)  # ModelPixelScaleTag : (dx, dy, dz)
        tiepoint = tags.get(33922)  # ModelTiepointTag : (i, j, k, origin_lon, origin_lat, z)
        nodata_raw = tags.get(42113)  # GDAL_NODATA
        if not scale or not tiepoint:
            raise RuntimeError("Tags GeoTIFF (33550 / 33922) absents du fichier WorldPop.")

        dx = float(scale[0])
        dy = float(scale[1])
        origin_lon = float(tiepoint[3]) - float(tiepoint[0]) * dx
        origin_lat = float(tiepoint[4]) + float(tiepoint[1]) * dy

        col_min = max(0, int(np.floor((min_lon - origin_lon) / dx)))
        col_max = min(img.width, int(np.ceil((max_lon - origin_lon) / dx)))
        row_min = max(0, int(np.floor((origin_lat - max_lat) / dy)))
        row_max = min(img.height, int(np.ceil((origin_lat - min_lat) / dy)))

        cropped = img.crop((col_min, row_min, col_max, row_max))
        arr = np.asarray(cropped, dtype=np.float32).copy()

    if nodata_raw is not None:
        try:
            nd_val = float(str(nodata_raw).strip().rstrip("\x00"))
            arr[np.isclose(arr, nd_val, rtol=1e-4)] = 0.0
        except ValueError:
            pass

    arr[~np.isfinite(arr)] = 0.0
    arr[arr < 0.0] = 0.0

    cols = np.arange(col_min, col_max, dtype=np.float64)
    rows = np.arange(row_min, row_max, dtype=np.float64)
    lon_centers = origin_lon + (cols + 0.5) * dx
    lat_centers = origin_lat - (rows + 0.5) * dy

    src_url = (
        (RAW_DIR / "worldpop_source_url.txt").read_text(encoding="utf-8").strip()
        if (RAW_DIR / "worldpop_source_url.txt").exists()
        else WORLDPOP_URLS[0]
    )

    np.savez_compressed(
        WORLDPOP_NPZ_PATH,
        pop=arr,
        lon_centers=lon_centers,
        lat_centers=lat_centers,
        dx=np.array([dx], dtype=np.float64),
        dy=np.array([dy], dtype=np.float64),
    )
    return arr, lon_centers, lat_centers, src_url


def aggregate_worldpop_on_polygons(
    polygons: list, pop_grid: np.ndarray, lon_centers: np.ndarray, lat_centers: np.ndarray
) -> np.ndarray:
    """Agrège vectoriellement les pixels WorldPop 100 m dans une liste de polygones via STRtree."""
    nz_rows, nz_cols = np.nonzero(pop_grid > 0.0)
    if nz_rows.size == 0 or not polygons:
        return np.zeros(len(polygons), dtype=np.float64)

    px_lons = lon_centers[nz_cols]
    px_lats = lat_centers[nz_rows]
    px_vals = pop_grid[nz_rows, nz_cols].astype(np.float64)

    pts = points(px_lons, px_lats)
    tree = STRtree(polygons)
    pt_idx, poly_idx = tree.query(pts, predicate="intersects")

    # Si un centroïde tombe pile sur une arête partagée, répartir son poids équitablement
    counts_per_pt = np.bincount(pt_idx, minlength=pts.size)
    weights = px_vals[pt_idx] / np.maximum(1, counts_per_pt[pt_idx])
    totals = np.bincount(poly_idx, weights=weights, minlength=len(polygons))
    return totals


def _extract_hydro_lines(lagoon_mp: MultiPolygon | None) -> list[LineString]:
    """Extrait les cours d'eau, talwegs, canaux de drainage OSM et les berges lagunaires."""
    lines: list[LineString] = []
    if OSM_HYDRO_RAW.exists():
        hydro_data = json.loads(OSM_HYDRO_RAW.read_text(encoding="utf-8"))
        for el in hydro_data.get("elements", []):
            if el.get("type") == "way":
                coords = [(pt["lon"], pt["lat"]) for pt in el.get("geometry") or []]
                if len(coords) >= 2:
                    ls = LineString(coords)
                    if not ls.is_empty and ls.length > 0:
                        lines.append(ls)

    if lagoon_mp is not None:
        for poly in lagoon_mp.geoms:
            lines.append(LineString(poly.exterior.coords))
            for ring in poly.interiors:
                lines.append(LineString(ring.coords))
    return lines


def _extract_terrarium_dem_mosaic() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Assemble la mosaïque MNT Terrarium z=12 (~38 m) en grille (elev_m, lon_centers, lat_centers)."""
    min_lon, min_lat, max_lon, max_lat = ABIDJAN_BBOX
    x_min, y_max = _lonlat_to_tile_xy(min_lon, min_lat, TERRARIUM_ZOOM)
    x_max, y_min = _lonlat_to_tile_xy(max_lon, max_lat, TERRARIUM_ZOOM)

    cols_tiles = x_max - x_min + 1
    rows_tiles = y_max - y_min + 1
    mosaic_rgb = np.zeros((rows_tiles * 256, cols_tiles * 256, 3), dtype=np.float32)

    found_any = False
    for r_idx, ty in enumerate(range(y_min, y_max + 1)):
        for c_idx, tx in enumerate(range(x_min, x_max + 1)):
            tile_path = TERRARIUM_DIR / f"z{TERRARIUM_ZOOM}_{tx}_{ty}.png"
            if tile_path.exists():
                with Image.open(tile_path) as im:
                    rgb = np.asarray(im.convert("RGB"), dtype=np.float32)
                mosaic_rgb[r_idx * 256 : (r_idx + 1) * 256, c_idx * 256 : (c_idx + 1) * 256, :] = rgb
                found_any = True

    if not found_any:
        raise FileNotFoundError(
            f"Aucune tuile MNT trouvée dans {TERRARIUM_DIR}. Exécutez `ingest_abidjan_sig.py fetch`."
        )

    elev = mosaic_rgb[:, :, 0] * 256.0 + mosaic_rgb[:, :, 1] + mosaic_rgb[:, :, 2] / 256.0 - 32768.0
    elev = np.clip(elev, 0.0, 600.0).astype(np.float32)

    n = float(1 << TERRARIUM_ZOOM)
    px_cols = np.arange(cols_tiles * 256, dtype=np.float64)
    px_rows = np.arange(rows_tiles * 256, dtype=np.float64)

    lon_centers = ((x_min + (px_cols + 0.5) / 256.0) / n) * 360.0 - 180.0
    merc_n = math.pi * (1.0 - 2.0 * (y_min + (px_rows + 0.5) / 256.0) / n)
    lat_centers = np.degrees(np.arctan(np.sinh(merc_n)))

    elev_sub = 0.25 * (elev[0::2, 0::2] + elev[1::2, 0::2] + elev[0::2, 1::2] + elev[1::2, 1::2])
    lon_sub = 0.5 * (lon_centers[0::2] + lon_centers[1::2])
    lat_sub = 0.5 * (lat_centers[0::2] + lat_centers[1::2])

    np.savez_compressed(
        DEM_HYDRO_NPZ_PATH,
        elev_m=elev_sub.astype(np.float32),
        lon_centers=lon_sub.astype(np.float64),
        lat_centers=lat_sub.astype(np.float64),
    )
    return elev_sub, lon_sub, lat_sub


def compute_hex_topography_and_hazard(
    hex_polys_wgs84: list,
    elev_grid: np.ndarray,
    dem_lons: np.ndarray,
    dem_lats: np.ndarray,
    hydro_lines_wgs84: list[LineString],
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Calcule (dist_hydro_m, altitude_moy_m, indice_alea [0..100]) en EPSG:32630 sur chaque hexagone."""
    from app.services.utm30n import geom_to_utm30n

    n_hex = len(hex_polys_wgs84)
    if n_hex == 0:
        z = np.zeros(0, dtype=np.float64)
        return z, z, z

    hex_utm = [geom_to_utm30n(p) for p in hex_polys_wgs84]
    if hydro_lines_wgs84:
        hydro_utm = [geom_to_utm30n(ls) for ls in hydro_lines_wgs84]
        hydro_tree = STRtree(hydro_utm)
        nearest_idx = hydro_tree.nearest(hex_utm)
        nearest_geoms = [hydro_utm[int(i)] for i in nearest_idx]
        dist_hydro_m = np.array(
            [float(h.distance(ng)) for h, ng in zip(hex_utm, nearest_geoms, strict=False)],
            dtype=np.float64,
        )
    else:
        dist_hydro_m = np.full(n_hex, 1000.0, dtype=np.float64)

    alt_moy_m = np.zeros(n_hex, dtype=np.float64)
    lat_desc = dem_lats[::-1]
    for idx, poly in enumerate(hex_polys_wgs84):
        c = poly.centroid
        col_i = int(np.clip(np.searchsorted(dem_lons, c.x), 0, dem_lons.size - 1))
        row_desc = int(np.clip(np.searchsorted(lat_desc, c.y), 0, lat_desc.size - 1))
        row_i = (dem_lats.size - 1) - row_desc
        r0, r1 = max(0, row_i - 1), min(elev_grid.shape[0], row_i + 2)
        c0, c1 = max(0, col_i - 1), min(elev_grid.shape[1], col_i + 2)
        alt_moy_m[idx] = float(np.mean(elev_grid[r0:r1, c0:c1]))

    i_hydro = np.exp(-dist_hydro_m / 600.0)
    p5, p95 = np.percentile(alt_moy_m, [5.0, 95.0])
    span = max(float(p95 - p5), 5.0)
    i_alt = np.clip((p95 - alt_moy_m) / span, 0.0, 1.0)
    indice_alea = np.clip(100.0 * (0.55 * i_hydro + 0.45 * i_alt), 0.0, 100.0)

    return np.round(dist_hydro_m, 1), np.round(alt_moy_m, 1), np.round(indice_alea, 1)


def cmd_process() -> None:
    """Étape 2 : traitement géomatique hors-ligne vers data/geo/."""
    from app.services.utm30n import area_km2_utm30n

    GEO_DIR.mkdir(parents=True, exist_ok=True)
    communes_dict, lagoon_mp = _extract_communes_from_sources()
    pop_grid, lon_centers, lat_centers, wp_url = _extract_worldpop_abidjan_clip()
    hydro_lines = _extract_hydro_lines(lagoon_mp)
    elev_grid, _, _ = _extract_terrarium_dem_mosaic()

    hydro_fc = {
        "type": "FeatureCollection",
        "features": [{"type": "Feature", "properties": {}, "geometry": mapping(ls)} for ls in hydro_lines],
    }
    HYDRO_GEOJSON_PATH.write_text(json.dumps(hydro_fc, ensure_ascii=False), encoding="utf-8")
    print(
        f"[process] Hydrographie & berges : {len(hydro_lines)} tronçons | "
        f"MNT Abidjan : min={float(elev_grid.min()):.1f} m, max={float(elev_grid.max()):.1f} m."
    )

    slugs_sorted = sorted(communes_dict.keys(), key=lambda s: TARGET_COMMUNES[s][0])
    polys = [communes_dict[s][0] for s in slugs_sorted]
    pops = aggregate_worldpop_on_polygons(polys, pop_grid, lon_centers, lat_centers)

    features = []
    total_area = 0.0
    total_pop = 0.0

    for idx, slug in enumerate(slugs_sorted):
        nom, code_adm = TARGET_COMMUNES[slug]
        geom_mp, src_label = communes_dict[slug]
        area_km2 = round(area_km2_utm30n(geom_mp), 3)
        pop_val = round(float(pops[idx]), 0)
        densite = round(pop_val / area_km2, 1) if area_km2 > 0 else 0.0

        total_area += area_km2
        total_pop += pop_val

        # Simplification légère préservant la topologie (~2 m) pour fluidité WebGL/Canvas
        geom_clean = _to_multipolygon(geom_mp.simplify(0.00002, preserve_topology=True)) or geom_mp

        features.append(
            {
                "type": "Feature",
                "properties": {
                    "nom": nom,
                    "code_adm": code_adm,
                    "superficie_km2": area_km2,
                    "population_totale": pop_val,
                    "densite_hab_km2": densite,
                    "source_geom": src_label,
                },
                "geometry": mapping(geom_clean),
            }
        )
        print(
            f"[process] {nom:<13} | {area_km2:>7.2f} km² | Pop WorldPop: {pop_val:>10,.0f} hab. | "
            f"Densité: {densite:>8,.1f} hab./km²"
        )

    fc = {
        "type": "FeatureCollection",
        "name": "District_Autonome_Abidjan_13_Communes",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "features": features,
    }
    COMMUNES_GEOJSON_PATH.write_text(json.dumps(fc, ensure_ascii=False), encoding="utf-8")

    meta = {
        "territoire": "District Autonome d'Abidjan (13 communes)",
        "scr_stockage": "EPSG:4326 (WGS 84)",
        "scr_calcul_metrique": "EPSG:32630 (WGS 84 / UTM zone 30N)",
        "maillage_hexagonal": {
            "methode": "PostGIS ST_HexagonGrid (EPSG:32630)",
            "cote_m": int(HEX_SIDE_M),
            "superficie_theorique_km2": round((3.0 * (3.0**0.5) / 2.0) * ((HEX_SIDE_M / 1000.0) ** 2), 6),
        },
        "sources": {
            "limites_administratives": {
                "fournisseur": "OpenStreetMap Contributors (admin_level=8/7) & OCHA COD-AB Côte d'Ivoire",
                "licence": "ODbL 1.0 / CC-BY-IGO",
                "nb_communes": len(features),
                "superficie_terrestre_totale_km2": round(total_area, 2),
            },
            "population": {
                "fournisseur": "WorldPop (University of Southampton) — UN-adjusted Population Counts",
                "resolution": "3 arc-secondes (~100 m à l'équateur)",
                "millesime": 2020,
                "url_source": wp_url,
                "licence": "CC-BY 4.0",
                "population_totale_district": round(total_pop, 0),
            },
            "hydrographie": {
                "fournisseur": "OpenStreetMap Contributors (waterway=river|stream|canal|drain + berges Lagune Ébrié)",
                "licence": "ODbL 1.0",
                "nb_troncons": len(hydro_lines),
            },
            "modele_numerique_terrain": {
                "fournisseur": "AWS Open Data Terrain Tiles (SRTM / Copernicus DEM composite, Terrarium z=12)",
                "resolution": "~38 m natif (agrégé par maille 300 m en EPSG:32630)",
                "altitude_min_m": round(float(elev_grid.min()), 1),
                "altitude_max_m": round(float(elev_grid.max()), 1),
            },
        },
        "genere_le": datetime.now(UTC).isoformat(),
    }
    METADATA_JSON_PATH.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    print(
        f"\n[process] Synthèse District d'Abidjan : {len(features)} communes | "
        f"{total_area:.2f} km² | {total_pop:,.0f} habitants WorldPop."
    )


def cmd_load_db() -> None:
    """Étape 3 : chargement PostGIS des 13 communes, ST_HexagonGrid(300m, EPSG:32630) et WorldPop."""
    from app.db.session import SessionLocal
    from app.models.incident import Incident
    from app.models.maille_analyse import MailleAnalyse
    from app.models.zone import Zone
    from geoalchemy2.shape import from_shape
    from sqlalchemy import delete, func, select, text

    if not COMMUNES_GEOJSON_PATH.exists() or not WORLDPOP_NPZ_PATH.exists():
        raise FileNotFoundError("Exécutez d'abord `process` pour générer les fichiers dans data/geo/.")

    fc = json.loads(COMMUNES_GEOJSON_PATH.read_text(encoding="utf-8"))
    npz = np.load(WORLDPOP_NPZ_PATH)
    pop_grid = npz["pop"]
    lon_centers = npz["lon_centers"]
    lat_centers = npz["lat_centers"]

    dem_npz = np.load(DEM_HYDRO_NPZ_PATH) if DEM_HYDRO_NPZ_PATH.exists() else None
    hydro_lines: list[LineString] = []
    if HYDRO_GEOJSON_PATH.exists():
        h_fc = json.loads(HYDRO_GEOJSON_PATH.read_text(encoding="utf-8"))
        for feat in h_fc.get("features", []):
            g = shape(feat["geometry"])
            if isinstance(g, LineString):
                hydro_lines.append(g)

    db = SessionLocal()
    try:
        # 1. Upsert des 13 communes en préservant les IDs existants (Cocody, Yopougon, etc.)
        existing_zones = {z.nom.strip().lower(): z for z in db.scalars(select(Zone)).all()}
        if "le plateau" in existing_zones and "plateau" not in existing_zones:
            existing_zones["plateau"] = existing_zones["le plateau"]

        for feat in fc["features"]:
            props = feat["properties"]
            nom = props["nom"]
            geom_mp = _to_multipolygon(shape(feat["geometry"]))
            z = existing_zones.get(nom.lower())
            if z is None:
                z = Zone(nom=nom)
                db.add(z)
            z.nom = nom
            z.code_adm = props["code_adm"]
            z.population_totale = float(props["population_totale"])
            z.superficie_km2 = float(props["superficie_km2"])
            z.densite_hab_km2 = float(props["densite_hab_km2"])
            z.source_geom = props["source_geom"]
            z.geom = from_shape(geom_mp, srid=4326)

        db.flush()

        # Recalcul exact des superficies PostGIS en EPSG:32630 pour cohérence stricte avec le SGBD
        db.execute(
            text(
                """
                UPDATE zone
                SET superficie_km2 = ROUND((ST_Area(ST_Transform(geom, 32630)) / 1000000.0)::numeric, 3),
                    densite_hab_km2 = CASE
                        WHEN ST_Area(ST_Transform(geom, 32630)) > 0
                        THEN ROUND((population_totale / (ST_Area(ST_Transform(geom, 32630)) / 1000000.0))::numeric, 1)
                        ELSE 0
                    END
                WHERE geom IS NOT NULL;
                """
            )
        )
        db.commit()
        print("[load-db] 13 communes mises à jour dans la table `zone` (superficies EPSG:32630).")

        # 2. Génération de la grille hexagonale métrique PostGIS ST_HexagonGrid (300 m, EPSG:32630)
        print("[load-db] Génération du maillage hexagonal PostGIS ST_HexagonGrid(300m, EPSG:32630)...")
        hex_sql = text(
            """
            WITH zones_utm AS (
                SELECT id, ST_Transform(geom, 32630) AS geom_utm
                FROM zone
                WHERE geom IS NOT NULL
            ),
            emprise AS (
                SELECT ST_SetSRID(ST_Extent(geom_utm), 32630) AS bbox
                FROM zones_utm
            ),
            grille AS (
                SELECT
                    format('HEX300-%s-%s', g.i, g.j) AS code_maille,
                    g.geom AS hex_utm
                FROM emprise, ST_HexagonGrid(:side_m, emprise.bbox) AS g
            )
            SELECT
                grille.code_maille,
                z_maj.id AS zone_id,
                ROUND((ST_Area(grille.hex_utm) / 1000000.0)::numeric, 6) AS superficie_km2,
                ST_AsGeoJSON(ST_Transform(grille.hex_utm, 4326), 6) AS hex_geojson
            FROM grille
            JOIN LATERAL (
                SELECT z.id
                FROM zones_utm z
                WHERE ST_Intersects(z.geom_utm, grille.hex_utm)
                ORDER BY ST_Area(ST_Intersection(z.geom_utm, grille.hex_utm)) DESC
                LIMIT 1
            ) z_maj ON TRUE;
            """
        )
        rows = db.execute(hex_sql, {"side_m": HEX_SIDE_M}).mappings().all()
        print(f"[load-db] {len(rows)} hexagones terrestres générés en EPSG:32630. Agrégation WorldPop 100m...")

        hex_polys = [shape(json.loads(r["hex_geojson"])) for r in rows]
        hex_pops = aggregate_worldpop_on_polygons(hex_polys, pop_grid, lon_centers, lat_centers)

        if dem_npz is not None:
            print("[load-db] Calcul des distances hydrographiques et altitudes MNT en EPSG:32630...")
            dist_hydro_arr, alt_moy_arr, indice_alea_arr = compute_hex_topography_and_hazard(
                hex_polys,
                dem_npz["elev_m"],
                dem_npz["lon_centers"],
                dem_npz["lat_centers"],
                hydro_lines,
            )
        else:
            dist_hydro_arr = np.full(len(rows), 500.0, dtype=np.float64)
            alt_moy_arr = np.full(len(rows), 25.0, dtype=np.float64)
            indice_alea_arr = np.full(len(rows), 40.0, dtype=np.float64)

        db.execute(delete(MailleAnalyse))
        db.flush()

        batch_objs = []
        for idx, r in enumerate(rows):
            area_val = float(r["superficie_km2"])
            pop_val = round(float(hex_pops[idx]), 2)
            dens_val = round(pop_val / area_val, 1) if area_val > 0 else 0.0
            batch_objs.append(
                MailleAnalyse(
                    code_maille=r["code_maille"],
                    zone_id=int(r["zone_id"]),
                    cote_m=int(HEX_SIDE_M),
                    superficie_km2=area_val,
                    population_worldpop=pop_val,
                    densite_hab_km2=dens_val,
                    dist_hydro_m=float(dist_hydro_arr[idx]),
                    altitude_moy_m=float(alt_moy_arr[idx]),
                    indice_alea=float(indice_alea_arr[idx]),
                    geom=from_shape(hex_polys[idx], srid=4326),
                )
            )

        db.add_all(batch_objs)
        db.commit()
        print(
            f"[load-db] {len(batch_objs)} mailles insérées dans `maille_analyse` "
            f"(Pop totale : {sum(hex_pops):,.0f} hab. | Aléa moyen : {float(np.mean(indice_alea_arr)):.1f}/100)."
        )

        # 3. Recalage spatial automatique des incidents existants sur les vraies communes
        updated = db.execute(
            text(
                """
                UPDATE incident i
                SET zone_id = (
                    SELECT z.id
                    FROM zone z
                    WHERE z.geom IS NOT NULL AND ST_Intersects(z.geom, i.geom)
                    LIMIT 1
                )
                WHERE i.geom IS NOT NULL;
                """
            )
        ).rowcount
        db.commit()
        total_inc = db.scalar(select(func.count(Incident.id))) or 0
        print(f"[load-db] {updated}/{total_inc} incidents rattachés spatialement à leur vraie commune.")
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Pipeline SIG Lot 1 — District Autonome d'Abidjan")
    parser.add_argument("step", choices=["fetch", "process", "load-db", "all"])
    args = parser.parse_args()

    if args.step in ("fetch", "all"):
        cmd_fetch()
    if args.step in ("process", "all"):
        cmd_process()
    if args.step in ("load-db", "all"):
        cmd_load_db()


if __name__ == "__main__":
    main()
