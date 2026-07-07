#!/usr/bin/env python3
"""
OBSOLÈTE — conservé pour référence uniquement. Les endpoints internes de
maree.shom.fr sont protégés par un WAF qui a bloqué nos requêtes (juillet 2026)
et la fenêtre de prédiction est limitée à ~J+11. Le pipeline actif est
fetch_api_maree.py (api-maree.fr).

Récupère les données de marée (SHOM, via l'API interne du site public
maree.shom.fr) pour un port donné et les stocke en local en JSON.

Deux jeux de données par port :
- hlt : horaires + hauteurs + coefficients des pleines et basses mers
- wl  : hauteur d'eau toutes les 5 minutes (forme de la courbe)

Usage:
    python3 fetch_shom.py --harbor LA_ROCHELLE-PALLICE --from 2026-06-01 --to 2026-09-30
"""
import argparse
import json
import sys
import time
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError

HDM_BASE = "https://services.data.shom.fr/b2q8lrcdl4s04cbabsj4nhcb/hdm/spm"
WFS_URL = "https://services.data.shom.fr/x13f1b4faeszdyinv9zqxmx1/wfs"
REFERER = "https://maree.shom.fr/"
HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Referer": REFERER,
    "Origin": "https://maree.shom.fr",
}
HLT_MAX_DURATION = 40  # marge de sécurité (le serveur refuse au-delà de 43)
SLEEP_BETWEEN_CALLS = 0.3  # secondes, pour rester raisonnable envers le service gratuit


def http_get_json(url):
    req = Request(url, headers=HEADERS)
    try:
        with urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            raise SystemExit(f"HTTP {e.code} sur {url}\n{body[:500]}")


def get_harbor_properties(harbor_cst):
    """Résout coeff (correlation) et h_legale (heure légale dispo) pour un port via le WFS."""
    filt = quote(f"cst='{harbor_cst}'")
    url = (
        f"{WFS_URL}?service=WFS&version=1.0.0&srsName=EPSG:3857"
        f"&request=GetFeature&typeName=SPM_PORTS_WFS:liste_ports_spm_h2m"
        f"&outputFormat=application/json&CQL_FILTER={filt}"
    )
    data = http_get_json(url)
    features = data.get("features", [])
    if not features:
        raise SystemExit(f"Port inconnu dans le WFS SHOM : {harbor_cst}")
    props = features[0]["properties"]
    return props


def daterange_chunks(start, end, max_days):
    """Découpe [start, end] en tranches de max_days jours max (bornes incluses)."""
    cur = start
    while cur <= end:
        chunk_end = min(cur + timedelta(days=max_days - 1), end)
        duration = (chunk_end - cur).days + 1
        yield cur, duration
        cur = chunk_end + timedelta(days=1)


def fetch_hlt(harbor_cst, utc_param, correlation, start, end):
    """Horaires/hauteurs/coefficients des pleines et basses mers."""
    all_days = {}
    for chunk_start, duration in daterange_chunks(start, end, HLT_MAX_DURATION):
        url = (
            f"{HDM_BASE}/hlt?harborName={harbor_cst}&duration={duration}"
            f"&date={chunk_start.isoformat()}&utc={utc_param}&correlation={correlation}"
        )
        data = http_get_json(url)
        if "error_code" in data:
            raise SystemExit(f"Erreur SHOM (hlt) sur {chunk_start}: {data}")
        all_days.update(data)
        print(f"  hlt {chunk_start} -> +{duration}j ({len(data)} jours reçus)")
        time.sleep(SLEEP_BETWEEN_CALLS)
    return all_days


def fetch_wl(harbor_cst, utc_param, start, end):
    """Hauteur d'eau toutes les 5 minutes, jour par jour (le serveur n'accepte
    de façon fiable que duration=1 avec nbWaterLevels=288)."""
    all_days = {}
    cur = start
    while cur <= end:
        url = (
            f"{HDM_BASE}/wl?harborName={harbor_cst}&duration=1"
            f"&date={cur.isoformat()}&utc={utc_param}&nbWaterLevels=288"
        )
        try:
            data = http_get_json(url)
        except HTTPError as e:
            raise SystemExit(f"Erreur HTTP (wl) sur {cur}: {e}")
        if "error_code" in data:
            raise SystemExit(f"Erreur SHOM (wl) sur {cur}: {data}")
        all_days.update(data)
        cur += timedelta(days=1)
        time.sleep(SLEEP_BETWEEN_CALLS)
    print(f"  wl {start} -> {end} ({len(all_days)} jours reçus)")
    return all_days


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--harbor", default="LA_ROCHELLE-PALLICE", help="Code port SHOM (cst)")
    parser.add_argument("--from", dest="date_from", default="2026-06-01")
    parser.add_argument("--to", dest="date_to", default="2026-09-30")
    parser.add_argument(
        "--out-dir",
        default=None,
        help="Dossier de sortie (par défaut data/<harbor-en-minuscules>)",
    )
    args = parser.parse_args()

    start = date.fromisoformat(args.date_from)
    end = date.fromisoformat(args.date_to)

    print(f"Résolution du port {args.harbor} via le WFS SHOM...")
    props = get_harbor_properties(args.harbor)
    correlation = props["coeff"]
    utc_param = "standard" if props.get("h_legale") else str(props["ut"] / 10)
    print(f"  -> correlation={correlation}, utc={utc_param}, toponyme={props.get('toponyme')}")

    out_dir = Path(args.out_dir) if args.out_dir else Path(__file__).parent.parent / "public" / "data" / args.harbor.lower().replace("_", "-")
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Récupération hlt (pleines/basses mers + coefficients) {start} -> {end}...")
    hlt = fetch_hlt(args.harbor, utc_param, correlation, start, end)
    hlt_path = out_dir / "hlt.json"
    hlt_path.write_text(json.dumps(hlt, sort_keys=True, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  écrit dans {hlt_path} ({len(hlt)} jours)")

    print(f"Récupération wl (courbe de hauteur d'eau, pas de 5 min) {start} -> {end}...")
    wl = fetch_wl(args.harbor, utc_param, start, end)
    wl_path = out_dir / "wl.json"
    wl_path.write_text(json.dumps(wl, sort_keys=True, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  écrit dans {wl_path} ({len(wl)} jours)")

    meta = {
        "harbor_cst": args.harbor,
        "toponyme": props.get("toponyme"),
        "lat": props.get("lat"),
        "lon": props.get("lon"),
        "correlation": correlation,
        "utc_param": utc_param,
        "date_from": start.isoformat(),
        "date_to": end.isoformat(),
        "source": "SHOM (maree.shom.fr) - predictions harmoniques, usage personnel non commercial",
    }
    meta_path = out_dir / "meta.json"
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  écrit dans {meta_path}")


if __name__ == "__main__":
    sys.exit(main())
