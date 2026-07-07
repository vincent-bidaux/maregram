#!/usr/bin/env python3
"""
Récupère la courbe de hauteur d'eau depuis api-maree.fr (gratuit, licence CC-BY,
composantes harmoniques IFREMER/PREVIMER) et en déduit les pleines/basses mers
par détection de pics locaux.

Nécessite une clé API (inscription gratuite sur https://api-maree.fr/register),
à passer via la variable d'environnement API_MAREE_KEY ou --key.

Attribution requise par la licence CC-BY :
"Hauteurs d'eau diffusées par api-maree.fr, calculées à partir de composantes
harmoniques IFREMER / PREVIMER."

Usage:
    export API_MAREE_KEY=xxxx
    python3 fetch_api_maree.py --site la-rochelle-pallice --from 2026-06-01 --to 2026-09-30
"""
import argparse
import json
import os
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError

API_BASE = "https://api-maree.fr"
STEP_MINUTES = 10
MAX_HEIGHTS_PER_CALL = 1500  # limite documentée par api-maree.fr
SLEEP_BETWEEN_CALLS = 0.5


def http_get_json(url):
    req = Request(url, headers={"User-Agent": "maree-la-rochelle-dashboard/1.0 (usage perso)"})
    try:
        with urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            raise SystemExit(f"HTTP {e.code} sur {url}\n{body[:500]}")


def get_allowed_window(site, key):
    """Force une réponse d'erreur (date volontairement hors bornes) pour lire
    min_date/max_date, qui dépendent de la date du jour (fenêtre glissante J-30/J+30)."""
    params = {"key": key, "site": site, "from": "2000-01-01T00:00", "to": "2000-01-02T00:00", "step": STEP_MINUTES, "tz": "Europe/Paris"}
    data = http_get_json(f"{API_BASE}/water-levels?{urlencode(params)}")
    if data.get("error") != "outside_allowed_window":
        raise SystemExit(f"Réponse inattendue lors de la détection de la fenêtre autorisée : {data}")
    return date.fromisoformat(data["min_date"]), date.fromisoformat(data["max_date"])


def fetch_water_levels(site, key, start_dt, end_dt):
    """Récupère la courbe par tranches respectant la limite de points par requête.
    S'arrête proprement (sans planter) si on sort de la fenêtre J-30/J+30 autorisée,
    en gardant tout ce qui a déjà été récupéré."""
    points_per_day = (24 * 60) // STEP_MINUTES
    max_days_per_call = max(1, MAX_HEIGHTS_PER_CALL // points_per_day)
    all_points = []
    cur = start_dt
    while cur < end_dt:
        chunk_end = min(cur + timedelta(days=max_days_per_call), end_dt)
        params = {
            "key": key,
            "site": site,
            "from": cur.strftime("%Y-%m-%dT%H:%M"),
            "to": chunk_end.strftime("%Y-%m-%dT%H:%M"),
            "step": STEP_MINUTES,
            "tz": "Europe/Paris",
        }
        url = f"{API_BASE}/water-levels?{urlencode(params)}"
        data = http_get_json(url)
        if data.get("error") == "outside_allowed_window":
            print(f"  {cur} -> {chunk_end} : hors fenêtre autorisée ({data['message']}), arrêt ici.")
            break
        if "data" not in data:
            raise SystemExit(f"Réponse inattendue sur {cur}: {data}")
        all_points.extend(data["data"])
        print(f"  {cur} -> {chunk_end} ({len(data['data'])} points)")
        cur = chunk_end
        time.sleep(SLEEP_BETWEEN_CALLS)
    return all_points


def parse_time(t):
    return datetime.fromisoformat(t.replace("Z", "+00:00"))


def detect_extrema(points):
    """Détecte les pleines et basses mers par changement de signe de la dérivée."""
    events = []
    for i in range(1, len(points) - 1):
        prev_h = points[i - 1]["height"]
        cur_h = points[i]["height"]
        next_h = points[i + 1]["height"]
        if cur_h >= prev_h and cur_h >= next_h and cur_h > prev_h:
            events.append({"type": "high", "time": points[i]["time"], "height": cur_h})
        elif cur_h <= prev_h and cur_h <= next_h and cur_h < prev_h:
            events.append({"type": "low", "time": points[i]["time"], "height": cur_h})
    return events


def load_key_from_dotenv():
    """Lit API_MAREE_KEY dans le .env à la racine du projet (gitignoré)."""
    env_path = Path(__file__).parent.parent / ".env"
    if not env_path.exists():
        return None
    for line in env_path.read_text(encoding="utf-8").splitlines():
        if line.startswith("API_MAREE_KEY="):
            return line.split("=", 1)[1].strip() or None
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", default="la-rochelle-pallice")
    parser.add_argument("--from", dest="date_from", default="2026-06-01")
    parser.add_argument("--to", dest="date_to", default="2026-09-30")
    parser.add_argument("--key", default=os.environ.get("API_MAREE_KEY") or load_key_from_dotenv())
    parser.add_argument("--out-dir", default=None)
    args = parser.parse_args()

    if not args.key:
        raise SystemExit(
            "Clé API manquante. Inscris-toi sur https://api-maree.fr/register "
            "puis passe la clé via --key ou la variable d'environnement API_MAREE_KEY."
        )

    requested_from = date.fromisoformat(args.date_from)
    requested_to = date.fromisoformat(args.date_to)

    min_date, max_date = get_allowed_window(args.site, args.key)
    clamped_from = max(requested_from, min_date)
    clamped_to = min(requested_to, max_date)
    if clamped_from > clamped_to:
        raise SystemExit(
            f"Plage demandée ({requested_from} -> {requested_to}) totalement hors de la "
            f"fenêtre autorisée aujourd'hui ({min_date} -> {max_date})."
        )
    if clamped_from != requested_from or clamped_to != requested_to:
        print(
            f"Fenêtre demandée {requested_from} -> {requested_to} réduite à ce qui est "
            f"disponible aujourd'hui : {clamped_from} -> {clamped_to} "
            f"(la fenêtre autorisée est J-30/J+30, relance ce script plus tard pour combler le reste)."
        )

    start_dt = datetime.combine(clamped_from, datetime.min.time())
    end_dt = datetime.combine(clamped_to + timedelta(days=1), datetime.min.time())

    out_dir = Path(args.out_dir) if args.out_dir else Path(__file__).parent.parent / "public" / "data" / args.site
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Récupération de la courbe de hauteur d'eau {start_dt} -> {end_dt} pour {args.site}...")
    points = fetch_water_levels(args.site, args.key, start_dt, end_dt)

    curve_path = out_dir / "water_levels.json"
    existing_points = []
    if curve_path.exists():
        existing_points = json.loads(curve_path.read_text(encoding="utf-8"))
        print(f"{len(existing_points)} points déjà présents dans {curve_path}, fusion avec les {len(points)} nouveaux...")

    by_time = {p["time"]: p for p in existing_points}
    by_time.update({p["time"]: p for p in points})
    points = sorted(by_time.values(), key=lambda p: p["time"])

    curve_path.write_text(json.dumps(points, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Courbe fusionnée écrite dans {curve_path} ({len(points)} points au total)")

    print("Détection des pleines/basses mers par pics locaux sur l'historique complet...")
    events = detect_extrema(points)
    events_path = out_dir / "high_low_tides.json"
    events_path.write_text(json.dumps(events, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{len(events)} évènements (PM/BM) écrits dans {events_path}")

    actual_from = points[0]["time"][:10] if points else clamped_from.isoformat()
    actual_to = points[-1]["time"][:10] if points else clamped_from.isoformat()
    meta = {
        "site": args.site,
        "requested_from": args.date_from,
        "requested_to": args.date_to,
        "date_from": actual_from,
        "date_to": actual_to,
        "step_minutes": STEP_MINUTES,
        "source": "api-maree.fr (CC-BY)",
        "attribution": (
            "Hauteurs d'eau diffusées par api-maree.fr, calculées à partir de "
            "composantes harmoniques IFREMER / PREVIMER."
        ),
        "note": "Pas de coefficient de marée officiel SHOM inclus (à vérifier manuellement si besoin).",
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
