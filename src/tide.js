/**
 * Logique de marée : état courant, prochaine pleine/basse mer, et créneaux de
 * baignade par plage (intervalles où la hauteur d'eau dépasse le seuil configuré).
 */

export async function loadStationData(station) {
  const [levels, tides, meta] = await Promise.all([
    fetch(`/data/${station}/water_levels.json`).then((r) => r.json()),
    fetch(`/data/${station}/high_low_tides.json`).then((r) => r.json()),
    fetch(`/data/${station}/meta.json`).then((r) => r.json()),
  ]);
  return { levels, tides, meta };
}

export async function loadBeaches() {
  // Lieux publiés gérés par l'admin (repli sur le fichier statique d'amorçage
  // si l'API est indisponible, ex. hors ligne au tout premier chargement).
  try {
    const res = await fetch("/api/beaches");
    if (res.ok) return res.json();
  } catch {
    // continue vers le repli
  }
  return fetch("/config/beaches.json").then((r) => r.json());
}

/** Point de la courbe le plus proche (ou juste avant) l'instant donné. */
export function findCurrentLevel(levels, now = new Date()) {
  let candidate = null;
  for (const point of levels) {
    if (new Date(point.time) > now) break;
    candidate = point;
  }
  return candidate;
}

export function nextTideEvents(tides, now = new Date(), count = 2) {
  return tides.filter((e) => new Date(e.time) > now).slice(0, count);
}

export function previousTideEvents(tides, now = new Date(), count = 2) {
  return tides
    .filter((e) => new Date(e.time) <= now)
    .slice(-count);
}

/**
 * Intervalles [debut, fin] où la hauteur d'eau interpolée dépasse le seuil.
 * Interpolation linéaire entre points consécutifs de la courbe (pas de 10 min).
 */
export function swimWindows(levels, thresholdM) {
  const windows = [];
  let start = null;

  const crossingTime = (a, b, threshold) => {
    const ta = new Date(a.time).getTime();
    const tb = new Date(b.time).getTime();
    const ratio = (threshold - a.height) / (b.height - a.height);
    return new Date(ta + ratio * (tb - ta));
  };

  for (let i = 0; i < levels.length; i++) {
    const cur = levels[i];
    const above = cur.height >= thresholdM;

    if (above && start === null) {
      if (i === 0) {
        start = new Date(cur.time);
      } else {
        const prev = levels[i - 1];
        start = prev.height >= thresholdM ? new Date(prev.time) : crossingTime(prev, cur, thresholdM);
      }
    }

    if (!above && start !== null) {
      const prev = levels[i - 1];
      const end = crossingTime(prev, cur, thresholdM);
      windows.push({ start, end });
      start = null;
    }
  }

  if (start !== null) {
    windows.push({ start, end: new Date(levels[levels.length - 1].time) });
  }

  return windows;
}

export function currentSwimWindow(windows, now = new Date()) {
  return windows.find((w) => w.start <= now && now <= w.end) || null;
}

export function nextSwimWindow(windows, now = new Date()) {
  return windows.find((w) => w.start > now) || null;
}

/** Amplitude moyenne (pleine mer - basse mer) pour chaque jour ayant les deux. */
export function dailyAmplitudes(tides) {
  const byDay = new Map();
  for (const e of tides) {
    const d = new Date(e.time);
    d.setHours(0, 0, 0, 0);
    const key = d.getTime();
    if (!byDay.has(key)) byDay.set(key, { highs: [], lows: [] });
    byDay.get(key)[e.type === "high" ? "highs" : "lows"].push(e.height);
  }
  const result = [];
  for (const [key, { highs, lows }] of byDay) {
    if (!highs.length || !lows.length) continue;
    const avgHigh = highs.reduce((a, b) => a + b, 0) / highs.length;
    const avgLow = lows.reduce((a, b) => a + b, 0) / lows.length;
    result.push({ day: new Date(key), amplitude: avgHigh - avgLow });
  }
  return result;
}

/**
 * Coefficient de marée ESTIMÉ (pas la valeur officielle du SHOM, qui n'est
 * pas disponible gratuitement). Le coefficient est proportionnel au marnage
 * en régime semi-diurne : calibré sur les niveaux caractéristiques publiés
 * pour La Rochelle-Pallice — vive-eau moyenne (coeff 95) : PM 6,09 m /
 * BM 0,72 m, soit un marnage de 5,37 m → marnage ≈ 5,65 m à coefficient 100.
 * Contrôle : morte-eau moyenne (coeff 45) publiée à 2,41 m de marnage
 * → 2,41/5,65×100 ≈ 43, cohérent.
 */
const RANGE_AT_COEFF_100 = 5.65;

export function approxCoefficient(amplitude) {
  return Math.round(Math.min(120, Math.max(20, (amplitude / RANGE_AT_COEFF_100) * 100)));
}
