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
  const res = await fetch("/config/beaches.json");
  return res.json();
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
 * pas disponible gratuitement). Mappe l'amplitude quotidienne sur l'échelle
 * conventionnelle [20,120], calibrée sur le min/max observé dans les
 * données chargées plutôt que sur des constantes de port non vérifiées.
 */
export function approxCoefficient(amplitude, minAmp, maxAmp) {
  if (maxAmp === minAmp) return 70;
  const t = (amplitude - minAmp) / (maxAmp - minAmp);
  return Math.round(20 + Math.min(1, Math.max(0, t)) * 100);
}
