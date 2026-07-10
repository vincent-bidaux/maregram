import "./style.css";
import {
  loadStationData,
  loadBeaches,
  findCurrentLevel,
  nextTideEvents,
  previousTideEvents,
  swimWindows,
  currentSwimWindow,
  nextSwimWindow,
  approxCoefficient,
} from "./tide.js";
import {
  MAX_FAVORITES,
  COLOR_PALETTE,
  getPrefs,
  setShowEvents,
  setTheme,
  setThreshold,
  setTravelMinutes,
  setColor,
  toggleFavorite,
  setOrder,
  addCustomBeach,
  removeCustomBeach,
  resetAll,
  buildBeachList,
  initSession,
  onSession,
  getName,
  setName,
  getShareUrl,
} from "./settings.js";
import { LANG, setLang, tr, dateLocale, trWaterQuality } from "./i18n.js";
import { APP_VERSION } from "./changelog-data.js";

const app = document.getElementById("app");

// Carte admin (orange) affichée uniquement si le cookie de session admin est
// valide (vérifié côté serveur). null tant que la vérification n'a pas répondu.
let adminInfo = null;
async function checkAdmin() {
  try {
    const r = await fetch("/api/admin/me");
    if (!r.ok) return;
    const info = await r.json();
    if (info.admin) {
      adminInfo = info;
      render();
    }
  } catch {
    // pas grave : simple visiteur
  }
}

const fmtTime = (d) =>
  new Date(d).toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" });
const fmtDate = (d) =>
  new Date(d).toLocaleDateString(dateLocale(), { weekday: "short", day: "numeric", month: "short" });
const fmtHeight = (h) => `${h.toFixed(2)} m`;
const fmtDuration = (ms) => {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
};
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Installation PWA : Chrome/Android exposent beforeinstallprompt (déclenchement
// natif) ; iOS Safari n'a pas d'API → on affiche les instructions manuelles.
let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
});
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const fmtDayLabel = (d, today) => {
  const isToday = d.toDateString() === today.toDateString();
  const isTomorrow = d.toDateString() === new Date(today.getTime() + 86400000).toDateString();
  if (isToday) return tr("Aujourd'hui", "Today");
  if (isTomorrow) return tr("Demain", "Tomorrow");
  return d.toLocaleDateString(dateLocale(), { weekday: "long", day: "numeric", month: "long" });
};

function trendLabel(levels, now) {
  const idx = levels.findIndex((p) => new Date(p.time) > now);
  if (idx < 1) return "";
  const rising = levels[idx].height > levels[idx - 1].height;
  return rising ? tr("montante ↗", "rising ↗") : tr("descendante ↘", "falling ↘");
}

// Phase lunaire approximative (précision ~1 jour, suffisante pour une icône).
const SYNODIC_MONTH = 29.530588853;
const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

function moonPhaseIndex(date) {
  const days = (date.getTime() - KNOWN_NEW_MOON) / 86400000;
  let fraction = (days % SYNODIC_MONTH) / SYNODIC_MONTH;
  if (fraction < 0) fraction += 1;
  return Math.round(fraction * 8) % 8; // 0 nouvelle lune … 4 pleine lune
}

/**
 * Phase de lune monochrome dessinée en SVG (grille 12×12) : contour + partie
 * éclairée délimitée par un arc de terminateur elliptique. Convention
 * hémisphère nord : croissante éclairée à droite.
 */
function moonInnerSvg(idx) {
  const outline = `<circle cx="6" cy="6" r="5" fill="none" stroke="var(--muted)" stroke-width="1"/>`;
  if (idx === 0) return outline;
  if (idx === 4) return `${outline}<circle cx="6" cy="6" r="5" fill="var(--text)"/>`;
  const litRight = idx < 4;
  const isCrescent = idx === 1 || idx === 7;
  const k = (Math.abs(Math.cos((idx / 8) * 2 * Math.PI)) * 5).toFixed(2);
  const outerSweep = litRight ? 1 : 0;
  const termSweep = (litRight && isCrescent) || (!litRight && !isCrescent) ? 0 : 1;
  return `${outline}<path d="M 6 1 A 5 5 0 0 ${outerSweep} 6 11 A ${k} 5 0 0 ${termSweep} 6 1 Z" fill="var(--text)"/>`;
}

const moonSvg = (date, size) =>
  `<svg viewBox="0 0 12 12" width="${size}" height="${size}" aria-hidden="true">${moonInnerSvg(moonPhaseIndex(date))}</svg>`;

/**
 * Compte à rebours du rafraîchissement : cadran avec une aiguille qui fait un
 * tour complet (sens horaire) en REFRESH_INTERVAL_MS — une forme d'horloge,
 * pas de remplissage, pour ne pas être confondu avec les phases de lune.
 * L'animation CSS repart à chaque render, qui re-arme aussi le timer.
 */
const REFRESH_INTERVAL_MS = 60_000;
const refreshPieSvg = () => `
  <svg class="refresh-pie" viewBox="0 0 32 32" aria-hidden="true">
    <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" stroke-width="1.2" class="ring-base"/>
    <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="ring-progress" transform="rotate(-90 16 16)"/>
    <g class="hand"><line x1="16" y1="16" x2="16" y2="5" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/></g>
    <circle cx="16" cy="16" r="2.5" fill="currentColor"/>
  </svg>`;

const STATION_DISPLAY_NAMES = {
  "la-rochelle-pallice": "LA ROCHELLE - PALLICE",
};

let measureCanvas = null;
function measureTextWidth(text, font) {
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  ctx.font = font;
  return ctx.measureText(text).width;
}

const PX_PER_DAY = 320;
const CURVE_H = 210;
// Zone sous les tranches : les tranches (jours + évènements) s'arrêtent au
// même niveau (CURVE_H), puis le triangle indicateur, puis le libellé (1 ou 2
// lignes selon sa longueur), chacun sous le précédent avec un peu d'air
const EVENT_BAND_H_1 = 34;
const EVENT_LINE_H = 11;
const EVENT_ROW_GAP = 4;
const EVENT_LABEL_FONT = "9.5px system-ui, -apple-system, 'Segoe UI', sans-serif";

const eventLabelText = (ev) =>
  typeof ev.label === "string" ? ev.label : ev.label[LANG] || ev.label.fr;

/**
 * Teinte discrète (tons désaturés, pas d'alerte criarde) pour les coefficients
 * remarquables : >100 grandes marées, >90 fortes marées, <50 marées faibles.
 * null = pas de coefficient notable, couleur de texte par défaut.
 */
function coeffColor(coeff) {
  if (coeff > 100) return "#b5654a";
  if (coeff > 90) return "#b8a052";
  if (coeff < 50) return "#6b9a7c";
  return null;
}

/**
 * Découpe un libellé d'évènement sur 2 lignes s'il dépasse maxWidth, en
 * coupant de préférence sur " · " (garde les noms d'artistes entiers), sinon
 * sur les espaces, au point le plus proche du milieu. Sinon, une seule ligne.
 */
function wrapEventLabel(text, maxWidth) {
  if (measureTextWidth(text, EVENT_LABEL_FONT) <= maxWidth) return [text];
  const sep = text.includes(" · ") ? " · " : " ";
  const parts = text.split(sep);
  if (parts.length < 2) return [text];
  const full = measureTextWidth(text, EVENT_LABEL_FONT);
  let bestI = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < parts.length; i++) {
    const w1 = measureTextWidth(parts.slice(0, i).join(sep), EVENT_LABEL_FONT);
    const diff = Math.abs(w1 - full / 2);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestI = i;
    }
  }
  return [parts.slice(0, bestI).join(sep), parts.slice(bestI).join(sep)];
}

// Largeur du marqueur ponctuel (évènement sans fin) centré sur midi du jour
const EVENT_POINT_WIDTH = 20;

const isDateOnly = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.trim());

// Un évènement sans date de fin est un marqueur ponctuel (midi du jour).
const isPointEvent = (ev) => !ev.end;

const eventStartMs = (ev) => {
  if (isDateOnly(ev.start)) {
    const [y, m, d] = ev.start.split("-").map(Number);
    return new Date(y, m - 1, d).getTime();
  }
  return new Date(ev.start).getTime();
};
// Date de fin en jour-seul : borne exclusive au jour suivant (jour entier couvert)
const eventEndMs = (ev) => {
  if (isDateOnly(ev.end)) {
    const [y, m, d] = ev.end.split("-").map(Number);
    return new Date(y, m - 1, d + 1).getTime();
  }
  return new Date(ev.end).getTime();
};
const eventNoonMs = (ev) => {
  let y, m, d;
  if (isDateOnly(ev.start)) {
    [y, m, d] = ev.start.split("-").map(Number);
  } else {
    const dt = new Date(ev.start);
    y = dt.getFullYear();
    m = dt.getMonth() + 1;
    d = dt.getDate();
  }
  return new Date(y, m - 1, d, 12).getTime();
};

// Icônes 12×12, remplies en blanc translucide par le groupe appelant
const EVENT_ICONS = {
  calendar: `
    <rect x="1.5" y="2.6" width="9" height="7.9" rx="1.2" fill="none" stroke="#fff" stroke-width="1"/>
    <path d="M1.6 4.8 h8.8" stroke="#fff" stroke-width="1"/>
    <rect x="3.3" y="1.3" width="1" height="2.2" rx="0.5"/>
    <rect x="7.7" y="1.3" width="1" height="2.2" rx="0.5"/>
    <rect x="3.1" y="6.3" width="1.4" height="1.3" rx="0.2"/>
    <rect x="5.3" y="6.3" width="1.4" height="1.3" rx="0.2"/>
    <rect x="7.5" y="6.3" width="1.4" height="1.3" rx="0.2"/>
  `,
  trophy: `
    <path d="M3.2 1 h5.6 v2.4 a2.8 2.8 0 0 1 -5.6 0 Z"/>
    <path d="M3.2 2 C1.4 2 1.4 4.2 3.4 4.6 M8.8 2 c1.8 0 1.8 2.2 -0.2 2.6" stroke="#fff" stroke-width="0.7" fill="none"/>
    <rect x="5.3" y="6" width="1.4" height="2.4"/>
    <rect x="3.6" y="8.4" width="4.8" height="1.2" rx="0.3"/>
  `,
  music: `
    <ellipse cx="3.9" cy="9.1" rx="2.4" ry="1.8"/>
    <rect x="5.9" y="2.2" width="1.1" height="7.1"/>
    <path d="M7 2.2 c2.4 0.4 3 2.2 2.1 4 c0.3 -1.8 -0.5 -2.8 -2.1 -3 z"/>
  `,
  rugby: `
    <g transform="rotate(-40 6 6)">
      <ellipse cx="6" cy="6" rx="5" ry="3"/>
      <line x1="1.3" y1="6" x2="10.7" y2="6" stroke="#0a1622" stroke-width="0.5" opacity="0.6"/>
      <line x1="4.7" y1="5.2" x2="4.7" y2="6.8" stroke="#0a1622" stroke-width="0.5" opacity="0.6"/>
      <line x1="6" y1="5.2" x2="6" y2="6.8" stroke="#0a1622" stroke-width="0.5" opacity="0.6"/>
      <line x1="7.3" y1="5.2" x2="7.3" y2="6.8" stroke="#0a1622" stroke-width="0.5" opacity="0.6"/>
    </g>
  `,
};

/**
 * Courbe SVG sur toute la période chargée : sections visuelles par jour,
 * pics/creux annotés (heure + hauteur), lignes de seuil par plage, et un
 * marqueur rouge pour l'instant présent. Rendu en pixels réels (pas de
 * viewBox mise à l'échelle) pour être placé dans un conteneur scrollable.
 */
function curveSvg(levels, tides, now, beaches = [], showEvents = true, events = []) {
  if (levels.length < 2) return { html: "", totalWidth: 0, todayX: 0 };

  const rangeStart = new Date(levels[0].time);
  rangeStart.setHours(0, 0, 0, 0);
  const lastPointDate = new Date(levels[levels.length - 1].time);
  const rangeEnd = new Date(lastPointDate);
  rangeEnd.setHours(0, 0, 0, 0);
  rangeEnd.setDate(rangeEnd.getDate() + 1);
  const nbDays = Math.round((rangeEnd - rangeStart) / 86400000);

  const w = nbDays * PX_PER_DAY;
  const h = CURVE_H;
  const topLabelBand = 64; // libellé du jour + libellé de pic sans collision
  const bottomLabelBand = 50;
  const heights = levels.map((p) => p.height);
  const thresholds = beaches.map((b) => b.swim_threshold_m);
  const minH = Math.min(...heights, ...thresholds);
  const maxH = Math.max(...heights, ...thresholds);
  const t0 = rangeStart.getTime();

  const x = (t) => ((t - t0) / 86400000) * PX_PER_DAY;
  const y = (v) =>
    h - bottomLabelBand - ((v - minH) / (maxH - minH || 1)) * (h - topLabelBand - bottomLabelBand);

  const path = levels
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(new Date(p.time).getTime()).toFixed(1)} ${y(p.height).toFixed(1)}`)
    .join(" ");

  // Pré-calcul des évènements visibles + découpe éventuelle du libellé sur 2
  // lignes (si plus long que 2× la largeur de sa tranche), triés par heure de
  // début. Si le libellé de deux évènements se chevauche horizontalement, le
  // plus tardif est repoussé sur une ligne de texte en dessous (comme un
  // planning à créneaux) : le reste de la bande — et donc de la carte —
  // s'agrandit en conséquence.
  const eventsData = [];
  if (showEvents) {
    for (const ev of events) {
      let ex0, ex1;
      if (isPointEvent(ev)) {
        // marqueur ponctuel : 20px centrés sur midi du jour
        const cx = x(eventNoonMs(ev));
        ex0 = cx - EVENT_POINT_WIDTH / 2;
        ex1 = cx + EVENT_POINT_WIDTH / 2;
      } else {
        ex0 = x(eventStartMs(ev));
        ex1 = x(eventEndMs(ev));
      }
      if (ex1 < 0 || ex0 > w) continue;
      const ecx = (ex0 + ex1) / 2;
      const lines = wrapEventLabel(eventLabelText(ev), 2 * (ex1 - ex0));
      const labelHalfWidth = Math.max(...lines.map((l) => measureTextWidth(l, EVENT_LABEL_FONT))) / 2;
      eventsData.push({ ev, ex0, ex1, ecx, lines, labelHalfWidth, startMs: eventStartMs(ev) });
    }
  }
  eventsData.sort((a, b) => a.startMs - b.startMs);

  // Empilement en lignes : place chaque libellé sur la première ligne où il
  // ne chevauche pas le dernier libellé déjà posé sur cette ligne.
  const LABEL_MARGIN = 6;
  const rowRightEdges = [];
  for (const e of eventsData) {
    const left = e.ecx - e.labelHalfWidth - LABEL_MARGIN;
    const right = e.ecx + e.labelHalfWidth + LABEL_MARGIN;
    let row = rowRightEdges.findIndex((edge) => edge <= left);
    if (row === -1) row = rowRightEdges.length;
    rowRightEdges[row] = right;
    e.row = row;
  }
  const numRows = rowRightEdges.length;
  const rowLineCount = Array.from({ length: numRows }, (_, r) =>
    Math.max(...eventsData.filter((e) => e.row === r).map((e) => e.lines.length))
  );
  const rowStartLine = rowLineCount.reduce((acc, count, r) => {
    acc[r] = (acc[r - 1] ?? 0) + (r === 0 ? 0 : rowLineCount[r - 1]);
    return acc;
  }, []);
  const totalContentLines = rowLineCount.reduce((a, b) => a + b, 0);
  const totalH =
    numRows === 0
      ? CURVE_H + EVENT_BAND_H_1
      : CURVE_H + 26 + (totalContentLines - 1) * EVENT_LINE_H + (numRows - 1) * EVENT_ROW_GAP + 8;

  // Sections par jour : bande alternée + libellé + séparateur
  let daySections = "";
  for (let i = 0; i < nbDays; i++) {
    const d0 = new Date(rangeStart.getTime() + i * 86400000);
    const bx0 = x(d0.getTime());
    if (i % 2 === 1) {
      daySections += `<rect x="${bx0.toFixed(1)}" y="0" width="${PX_PER_DAY}" height="${h}" fill="rgba(255,255,255,0.03)" />`;
    }
    if (i > 0) {
      daySections += `<line x1="${bx0.toFixed(1)}" y1="0" x2="${bx0.toFixed(1)}" y2="${h}" stroke="rgba(255,255,255,0.12)" stroke-width="1" />`;
    }
    // Coefficient estimé du jour, affiché à la suite de la date
    const dayEndTs = d0.getTime() + 86400000;
    const dayTides = tides.filter((e) => {
      const t = new Date(e.time).getTime();
      return t >= d0.getTime() && t < dayEndTs;
    });
    const highs = dayTides.filter((e) => e.type === "high").map((e) => e.height);
    const lows = dayTides.filter((e) => e.type === "low").map((e) => e.height);
    const dayCoeff =
      highs.length && lows.length
        ? approxCoefficient(
            highs.reduce((a, b) => a + b, 0) / highs.length - lows.reduce((a, b) => a + b, 0) / lows.length
          )
        : null;
    const coeffText = dayCoeff != null ? ` · ${dayCoeff}` : "";
    const dayLabelText = fmtDayLabel(d0, now) + coeffText;
    const dayLabelWidth = measureTextWidth(
      dayLabelText.toUpperCase(),
      "600 11px system-ui, -apple-system, 'Segoe UI', sans-serif"
    );
    const moonX = bx0 + 6 + dayLabelWidth + 12;
    const dayNamePart = fmtDayLabel(d0, now);
    const coeffColorVal = dayCoeff != null ? coeffColor(dayCoeff) : null;
    const coeffSpan =
      dayCoeff != null
        ? ` · <tspan${coeffColorVal ? ` fill="${coeffColorVal}"` : ""}>${dayCoeff}</tspan>`
        : "";
    daySections += `<text x="${(bx0 + 6).toFixed(1)}" y="14" class="day-label">${esc(dayNamePart)}${coeffSpan}</text>`;
    // Lune ~9px de haut, centrée sur la hauteur des capitales du libellé
    daySections += `<g transform="translate(${moonX.toFixed(1)}, 5.5) scale(0.75)">${moonInnerSvg(moonPhaseIndex(d0))}</g>`;
  }

  // Évènements en superposition : tranche jaune translucide sur toute la
  // hauteur de la frise (comme le fond des jours alternés), icône discrète en
  // bas de tranche, puis dans la bande dédiée : triangle indicateur pointant
  // le milieu de la tranche + libellé
  let eventsSvg = "";
  for (const { ev, ex0, ex1, ecx, lines, row } of eventsData) {
    // ligne(s) empilée(s) vers le bas depuis le haut du bloc de la rangée
    const linesSvg = lines
      .map((line, j) => {
        const ly = h + 26 + (rowStartLine[row] + j) * EVENT_LINE_H + row * EVENT_ROW_GAP;
        return `<text x="${ecx.toFixed(1)}" y="${ly.toFixed(1)}" class="event-label">${esc(line)}</text>`;
      })
      .join("");
    eventsSvg += `
      <rect x="${ex0.toFixed(1)}" y="-10" width="${(ex1 - ex0).toFixed(1)}" height="${h + 20}" rx="4" ry="4" fill="rgba(250,204,21,0.12)" />
      <g transform="translate(${(ecx - 6).toFixed(1)}, ${h - 16})" fill="#fff" opacity="0.5">${EVENT_ICONS[ev.icon] || ""}</g>
      ${linesSvg}
    `;
  }

  // Libellés de toutes les pleines/basses mers
  let tideLabels = "";
  for (const e of tides) {
    const t = new Date(e.time);
    const ex = x(t.getTime());
    const ey = y(e.height);
    const time = fmtTime(e.time);
    const height = `${e.height.toFixed(2)} m`;
    if (e.type === "high") {
      tideLabels += `
        <circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="3.5" fill="var(--accent)" />
        <text x="${ex.toFixed(1)}" y="${(ey - 26).toFixed(1)}" class="tide-time">${time}</text>
        <text x="${ex.toFixed(1)}" y="${(ey - 12).toFixed(1)}" class="tide-height">${height}</text>
      `;
    } else {
      tideLabels += `
        <circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="3.5" fill="var(--accent)" />
        <text x="${ex.toFixed(1)}" y="${(ey + 18).toFixed(1)}" class="tide-height">${height}</text>
        <text x="${ex.toFixed(1)}" y="${(ey + 32).toFixed(1)}" class="tide-time">${time}</text>
      `;
    }
  }

  const nowPoint = findCurrentLevel(levels, now) || levels[0];
  const nowX = x(now.getTime());
  const nowY = y(nowPoint.height);

  const thresholdLines = beaches
    .map((b) => {
      const ty = y(b.swim_threshold_m);
      return `<line x1="0" y1="${ty.toFixed(1)}" x2="${w}" y2="${ty.toFixed(1)}" stroke="${b.color}" stroke-width="1.5" stroke-dasharray="2 4" opacity="0.85" />`;
    })
    .join("");

  const html = `
    <svg width="${w}" height="${totalH + 10}" viewBox="0 -10 ${w} ${totalH + 10}" class="curve">
      ${daySections}
      ${eventsSvg}
      ${thresholdLines}
      <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" />
      ${tideLabels}
      <circle cx="${nowX.toFixed(1)}" cy="${nowY.toFixed(1)}" r="5.5" fill="#e2554f" stroke="#0b1e2d" stroke-width="2" />
    </svg>
  `;

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayX = x(todayStart.getTime());

  return { html, totalWidth: w, todayX };
}

function legendHtml(beaches) {
  if (!beaches.length) return "";
  return `
    <div class="threshold-legend">
      ${beaches
        .map(
          (b) => `
            <span class="legend-item">
              <span class="legend-dot" style="background:${b.color}"></span>
              ${esc(b.name)} (${b.swim_threshold_m.toFixed(2)} m)
            </span>
          `
        )
        .join("")}
    </div>
  `;
}

function tideListRow(tides, now) {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const todays = tides.filter((e) => {
    const t = new Date(e.time);
    return t >= dayStart && t < dayEnd;
  });
  if (!todays.length) return "";

  const highs = todays.filter((e) => e.type === "high").map((e) => e.height);
  const lows = todays.filter((e) => e.type === "low").map((e) => e.height);
  const avgAmplitude =
    highs.length && lows.length
      ? highs.reduce((a, b) => a + b, 0) / highs.length - lows.reduce((a, b) => a + b, 0) / lows.length
      : null;

  const items = todays
    .map((e) => {
      const isPast = new Date(e.time) < now;
      return `
        <div class="tide-item ${isPast ? "past" : ""}">
          <span class="tide-arrow ${e.type}">${e.type === "high" ? "↑" : "↓"}</span>
          <span class="tide-item-text">
            <span class="tide-item-time">${fmtTime(e.time)}</span>
            <span class="tide-item-height">${e.height.toFixed(2)} m</span>
          </span>
        </div>
      `;
    })
    .join("");

  let amplitudeHtml = "";
  if (avgAmplitude != null) {
    const coeff = approxCoefficient(avgAmplitude);
    const coeffColorVal = coeffColor(coeff);
    amplitudeHtml = `
      <p class="meta amplitude" title="${tr(
        "Estimation à partir du marnage du jour, calibrée sur les niveaux caractéristiques du port (marnage ≈ 5,65 m pour un coefficient 100)",
        "Estimated from today's tidal range, calibrated on the port's published characteristic levels (≈ 5.65 m range at coefficient 100)"
      )}">
        ${tr("Coefficient", "Coefficient")} ≈ <span${coeffColorVal ? ` style="color:${coeffColorVal}"` : ""}>${coeff}*</span> · ${tr("Amplitude moyenne aujourd'hui", "Mean range today")} ≈ ${avgAmplitude.toFixed(2)} m
      </p>
    `;
  }

  return `<div class="tide-list">${items}</div>${amplitudeHtml}`;
}

const THEME_OPTIONS = [
  ["dark", "Sombre", "Dark"],
  ["light", "Clair", "Light"],
  ["bw", "Noir & blanc", "Black & white"],
  ["bw-invert", "N&B inversé", "B&W inverted"],
];

/** Interrupteur style iOS (piste + curseur), toujours à droite de son label. */
const iosToggle = (className, checked) => `
  <span class="ios-switch">
    <input type="checkbox" class="${className}" ${checked ? "checked" : ""} />
    <span class="ios-switch-track"><span class="ios-switch-thumb"></span></span>
  </span>
`;

const GEAR_ICON = `
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
`;

const DRAG_HANDLE_ICON = `
  <svg viewBox="0 0 10 16" width="10" height="16" fill="currentColor">
    <circle cx="2" cy="2" r="1.3"/><circle cx="8" cy="2" r="1.3"/>
    <circle cx="2" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/>
    <circle cx="2" cy="14" r="1.3"/><circle cx="8" cy="14" r="1.3"/>
  </svg>
`;

const INFO_ICON = `
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="16" x2="12" y2="12"/>
    <line x1="12" y1="8" x2="12.01" y2="8"/>
  </svg>
`;

let settingsOpen = false;
let openColorPickerId = null;

function colorPaletteHtml(beachId) {
  return `
    <div class="color-palette" data-for="${beachId}" ${openColorPickerId === beachId ? "" : "hidden"}>
      ${COLOR_PALETTE.map((c) => `<button type="button" class="color-swatch-option" data-color="${c}" style="background:${c}"></button>`).join("")}
    </div>
  `;
}

function settingsPanelHtml(beaches) {
  const favoriteCount = beaches.filter((b) => b.favorite).length;

  const rows = beaches
    .map((b) => {
      const starDisabled = !b.favorite && favoriteCount >= MAX_FAVORITES;
      return `
        <div class="settings-beach-row" data-beach-id="${b.id}">
          <button type="button" class="drag-handle" aria-label="${tr("Réordonner", "Reorder")}">${DRAG_HANDLE_ICON}</button>
          <div class="settings-beach-main">
            <div class="settings-beach-top">
              <button type="button" class="fav-star ${b.favorite ? "active" : ""}" ${starDisabled ? "disabled" : ""} aria-label="${tr("Favori", "Favourite")}">${b.favorite ? "★" : "☆"}</button>
              <button type="button" class="color-swatch" data-color="${b.color}" style="background:${b.color}" aria-label="${tr("Changer la couleur", "Change colour")}"></button>
              <span class="settings-row-label">${esc(b.name)}</span>
              ${b.custom ? `<button type="button" class="remove-custom" aria-label="${tr("Supprimer", "Remove")}">✕</button>` : ""}
            </div>
            ${colorPaletteHtml(b.id)}
            <div class="settings-beach-bottom">
              <label class="settings-field" title="${tr("Temps de trajet jusqu'à ce lieu (pour l'heure de départ)", "Travel time to this spot (used for the leave-by time)")}">
                <span class="field-label">${tr("Distance", "Distance")}</span>
                <span class="settings-row-input">
                  <input type="number" step="5" min="0" max="240" value="${b.travel_minutes}" data-field="travel_minutes" />
                  <span>min</span>
                </span>
              </label>
              <label class="settings-field" title="${tr("Hauteur d'eau minimale pour se baigner", "Minimum water height for swimming")}">
                <span class="field-label">${tr("Seuil", "Threshold")}</span>
                <span class="settings-row-input">
                  <input type="number" step="0.05" min="0" max="10" value="${b.swim_threshold_m.toFixed(2)}" data-field="swim_threshold_m" />
                  <span>m</span>
                </span>
              </label>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="settings-overlay ${settingsOpen ? "open" : ""}">
      <div class="settings-panel">
        <div class="settings-head">
          <h2>${tr("Réglages", "Settings")}</h2>
          <button class="settings-close" type="button" aria-label="${tr("Fermer", "Close")}">✕</button>
        </div>
        <div class="settings-body">
          ${[
            // Lieux de baignade + Ajouter un lieu (un seul groupe, pas de séparateur entre les deux)
            `
              <h3>${tr("Lieux de baignade", "Swimming spots")}</h3>
              <p class="meta">
                ${tr(
                  `L'étoile ajoute le lieu au graph (max ${MAX_FAVORITES}). Glissez la poignée pour réordonner — l'ordre s'applique à toute l'app. Vos réglages sont enregistrés en ligne et liés à votre lien.`,
                  `The star adds the spot to the graph (max ${MAX_FAVORITES}). Drag the handle to reorder — the order applies across the app. Your settings are saved online and tied to your link.`
                )}
              </p>
              <div class="settings-beach-list">${rows}</div>

              <h3>${tr("Ajouter un lieu", "Add a spot")}</h3>
              <form class="add-beach-form">
                <input type="text" name="name" placeholder="${tr("Nom du lieu", "Spot name")}" required />
                <span class="settings-row-input">
                  <input type="number" name="threshold" step="0.05" min="0" max="10" placeholder="3.00" required />
                  <span>m</span>
                </span>
                <button type="submit">${tr("Ajouter", "Add")}</button>
              </form>
            `,
            // Afficher les évènements : pas de titre, juste le label + l'interrupteur
            `
              <label class="settings-toggle">
                <span>${tr("Afficher les événements locaux sur le maréegraphe", "Show local events on the tide graph")}</span>
                ${iosToggle("events-toggle", getPrefs().showEvents)}
              </label>
            `,
            // Langue
            `
              <h3>${tr("Langue", "Language")}</h3>
              <div class="lang-toggle">
                <button type="button" class="lang-btn ${LANG === "fr" ? "active" : ""}" data-lang="fr">Français</button>
                <button type="button" class="lang-btn ${LANG === "en" ? "active" : ""}" data-lang="en">English</button>
              </div>
            `,
            // Thème (dont deux modes N&B pensés pour un écran e-ink mural)
            `
              <h3>${tr("Thème", "Theme")}</h3>
              <div class="theme-grid">
                ${THEME_OPTIONS.map(
                  ([value, labelFr, labelEn]) => `
                  <button type="button" class="theme-btn ${getPrefs().theme === value ? "active" : ""}" data-theme-value="${value}">${tr(labelFr, labelEn)}</button>
                `
                ).join("")}
              </div>
            `,
            // Dashboard personnel
            `
              <h3>${tr("Dashboard personnel", "Personal dashboard")}</h3>
              <input type="text" class="name-input" maxlength="40" value="${esc(getName())}"
                     placeholder="${tr("Votre prénom (ex : Vincent)", "Your name (e.g. Vincent)")}" />
              <div class="share-box">
                ${
                  getShareUrl()
                    ? `<p class="meta">${tr(
                        "Votre lien personnel — ouvrez-le sur un autre appareil pour retrouver vos réglages :",
                        "Your personal link — open it on another device to get your settings back:"
                      )}</p>
                       <div class="share-row">
                         <code class="share-url">${esc(getShareUrl())}</code>
                         <button type="button" class="share-copy">${tr("Copier", "Copy")}</button>
                       </div>`
                    : `<p class="meta">${tr(
                        "Votre lien de partage apparaîtra ici dès votre première personnalisation (nom, favori, seuil…).",
                        "Your shareable link will appear here as soon as you personalise something (name, favourite, threshold…)."
                      )}</p>`
                }
              </div>
            `,
            // Calendrier des marées
            `
              <h3>${tr("Calendrier des marées", "Tide calendar")}</h3>
              <p class="meta">
                ${tr(
                  "Abonnez votre agenda (iPhone, Google, Outlook…) aux horaires de marées : un évènement par jour avec pleines/basses mers, hauteurs, coefficient et évènements locaux.",
                  "Subscribe your calendar (iPhone, Google, Outlook…) to the tide times: one all-day event per day with high/low tides, heights, coefficient and local events."
                )}
              </p>
              <div class="calendar-actions">
                <a class="calendar-subscribe" href="#">${tr("S'abonner au calendrier", "Subscribe to calendar")}</a>
                <button type="button" class="calendar-copy">${tr("Copier le lien", "Copy link")}</button>
              </div>
            `,
            // Écran d'accueil (absent si déjà installée en PWA standalone)
            isStandalone()
              ? null
              : `
              <h3>${tr("Écran d'accueil", "Home screen")}</h3>
              <button type="button" class="install-btn">${tr("Ajouter à l'écran d'accueil", "Add to home screen")}</button>
              <p class="meta install-hint" hidden></p>
            `,
            // Réinitialiser
            `<button class="settings-reset" type="button">${tr("Réinitialiser les valeurs par défaut", "Reset to defaults")}</button>`,
          ]
            .filter(Boolean)
            .join('<hr class="settings-sep" />')}
        </div>
      </div>
    </div>
  `;
}

function setupSettingsPanel() {
  const overlay = app.querySelector(".settings-overlay");
  const openBtn = app.querySelector(".settings-btn");
  const closeBtn = app.querySelector(".settings-close");
  const resetBtn = app.querySelector(".settings-reset");
  const addForm = app.querySelector(".add-beach-form");
  if (!overlay || !openBtn) return;

  const favoriteCount = overlay.querySelectorAll(".fav-star.active").length;

  const setOpen = (open) => {
    settingsOpen = open;
    overlay.classList.toggle("open", open);
    document.body.classList.toggle("modal-open", open);
  };
  document.body.classList.toggle("modal-open", settingsOpen);

  openBtn.addEventListener("click", () => setOpen(true));

  const eventsToggle = overlay.querySelector(".events-toggle");
  if (eventsToggle) {
    eventsToggle.addEventListener("change", () => {
      setShowEvents(eventsToggle.checked);
      render();
    });
  }

  // Calendrier : webcal:// ouvre le dialogue d'abonnement (iOS/macOS/Outlook) ;
  // le bouton copie l'URL https pour Google Agenda et autres
  const nameInput = overlay.querySelector(".name-input");
  if (nameInput) {
    // MàJ à la volée de l'en-tête, sans re-render (pour ne pas perdre le focus)
    nameInput.addEventListener("input", () => {
      setName(nameInput.value);
      const eyebrow = app.querySelector(".eyebrow");
      const n = nameInput.value.trim();
      if (eyebrow) {
        eyebrow.textContent = n
          ? `${STATION_DISPLAY_NAMES["la-rochelle-pallice"]} · ${tr("DASHBOARD DE", "DASHBOARD OF")} ${n.toUpperCase()}`
          : STATION_DISPLAY_NAMES["la-rochelle-pallice"];
      }
    });
  }

  const shareCopy = overlay.querySelector(".share-copy");
  if (shareCopy) {
    shareCopy.addEventListener("click", async () => {
      const url = getShareUrl();
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        const prev = shareCopy.textContent;
        shareCopy.textContent = tr("Copié ✓", "Copied ✓");
        setTimeout(() => (shareCopy.textContent = prev), 1800);
      } catch {
        prompt(tr("Copie ce lien :", "Copy this link:"), url);
      }
    });
  }

  const installBtn = overlay.querySelector(".install-btn");
  if (installBtn) {
    installBtn.addEventListener("click", async () => {
      const hint = overlay.querySelector(".install-hint");
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
      } else if (isIOS()) {
        hint.textContent = tr(
          "Appuyez sur l'icône Partager en bas de Safari, puis « Sur l'écran d'accueil ».",
          "Tap the Share icon at the bottom of Safari, then “Add to Home Screen”."
        );
        hint.hidden = false;
      } else {
        hint.textContent = tr(
          "Ouvrez le menu de votre navigateur puis « Installer l'application » / « Ajouter à l'écran d'accueil ».",
          "Open your browser menu, then “Install app” / “Add to Home Screen”."
        );
        hint.hidden = false;
      }
    });
  }

  const subscribeLink = overlay.querySelector(".calendar-subscribe");
  const copyBtn = overlay.querySelector(".calendar-copy");
  if (subscribeLink) subscribeLink.href = `webcal://${location.host}/calendar.ics`;
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const url = `${location.origin}/calendar.ics`;
      try {
        await navigator.clipboard.writeText(url);
        const prev = copyBtn.textContent;
        copyBtn.textContent = tr("Lien copié ✓", "Link copied ✓");
        setTimeout(() => (copyBtn.textContent = prev), 1800);
      } catch {
        prompt(tr("Copie ce lien :", "Copy this link:"), url);
      }
    });
  }

  overlay.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const changed = btn.dataset.lang !== LANG;
      setLang(btn.dataset.lang); // persiste le choix explicite même sans changement
      if (changed) render();
    });
  });

  overlay.querySelectorAll(".theme-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setTheme(btn.dataset.themeValue);
      document.documentElement.dataset.theme = btn.dataset.themeValue;
      overlay.querySelectorAll(".theme-btn").forEach((b) => b.classList.toggle("active", b === btn));
    });
  });

  closeBtn.addEventListener("click", () => setOpen(false));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) setOpen(false);
  });

  overlay.querySelectorAll("input[data-field]").forEach((input) => {
    input.addEventListener("change", () => {
      const beachId = input.closest("[data-beach-id]").dataset.beachId;
      const value = parseFloat(input.value);
      if (Number.isNaN(value)) return;
      if (input.dataset.field === "swim_threshold_m") setThreshold(beachId, value);
      else if (input.dataset.field === "travel_minutes") setTravelMinutes(beachId, Math.max(0, Math.round(value)));
      render();
    });
  });

  overlay.querySelectorAll(".fav-star").forEach((btn) => {
    btn.addEventListener("click", () => {
      const beachId = btn.closest("[data-beach-id]").dataset.beachId;
      const isFav = btn.classList.contains("active");
      toggleFavorite(beachId, isFav, favoriteCount);
      render();
    });
  });

  setupBeachDrag(overlay.querySelector(".settings-beach-list"));

  overlay.querySelectorAll(".color-swatch").forEach((btn) => {
    btn.addEventListener("click", () => {
      const beachId = btn.closest("[data-beach-id]").dataset.beachId;
      openColorPickerId = openColorPickerId === beachId ? null : beachId;
      overlay.querySelectorAll(".color-palette").forEach((p) => {
        p.hidden = p.dataset.for !== openColorPickerId;
      });
    });
  });

  overlay.querySelectorAll(".color-swatch-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      const beachId = btn.closest(".color-palette").dataset.for;
      setColor(beachId, btn.dataset.color);
      openColorPickerId = null;
      render();
    });
  });

  overlay.querySelectorAll(".remove-custom").forEach((btn) => {
    btn.addEventListener("click", () => {
      const beachId = btn.closest("[data-beach-id]").dataset.beachId;
      removeCustomBeach(beachId);
      render();
    });
  });

  addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = addForm.elements.name.value.trim();
    const threshold = parseFloat(addForm.elements.threshold.value);
    if (name && !Number.isNaN(threshold)) {
      const usedColors = Array.from(overlay.querySelectorAll(".color-swatch")).map((el) => el.dataset.color);
      addCustomBeach(name, threshold, usedColors);
      render();
    }
  });

  resetBtn.addEventListener("click", () => {
    resetAll();
    openColorPickerId = null;
    render();
  });
}

/**
 * Réordonnancement par glisser-déposer (souris + tactile via Pointer Events,
 * fonctionne sur iOS contrairement au drag-and-drop HTML5 natif). On déplace
 * la ligne visuellement, on la permute dans le DOM quand elle franchit le
 * milieu d'une ligne voisine, et on persiste l'ordre final au relâchement.
 */
function setupBeachDrag(list) {
  if (!list) return;

  list.querySelectorAll(".drag-handle").forEach((handle) => {
    handle.style.touchAction = "none";

    handle.addEventListener("pointerdown", (e) => {
      const row = handle.closest(".settings-beach-row");
      let startY = e.clientY;
      row.setPointerCapture(e.pointerId);
      row.classList.add("dragging");

      const onMove = (moveEvent) => {
        const dy = moveEvent.clientY - startY;
        row.style.transform = `translateY(${dy}px)`;

        for (const sibling of list.querySelectorAll(".settings-beach-row")) {
          if (sibling === row) continue;
          const rect = sibling.getBoundingClientRect();
          if (moveEvent.clientY > rect.top && moveEvent.clientY < rect.bottom) {
            const rowIndex = Array.from(list.children).indexOf(row);
            const siblingIndex = Array.from(list.children).indexOf(sibling);
            list.insertBefore(row, rowIndex < siblingIndex ? sibling.nextSibling : sibling);
            row.style.transform = "translateY(0)";
            startY = moveEvent.clientY;
            break;
          }
        }
      };

      const onUp = () => {
        row.classList.remove("dragging");
        row.style.transform = "";
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        const newOrder = Array.from(list.querySelectorAll(".settings-beach-row")).map((r) => r.dataset.beachId);
        setOrder(newOrder);
        render();
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });
  });
}

// Au-delà, le seuil n'est jamais franchi dans les données ("toujours baignable")
const MAX_PLAUSIBLE_WINDOW_MS = 14 * 3600 * 1000;

/** Heure de départ = début du créneau moins le temps de trajet perso. */
const departureTime = (start, travelMinutes) => new Date(start.getTime() - travelMinutes * 60000);

function beachStatus(beach, levels, now) {
  const windows = swimWindows(levels, beach.swim_threshold_m);
  const current = currentSwimWindow(windows, now);
  const next = nextSwimWindow(windows, now);
  const travel = beach.travel_minutes || 0;

  // "Partir vers" : maintenant si on arrive encore dans le créneau en cours,
  // sinon l'heure de départ pour attraper le début du prochain créneau.
  let departHtml = "";
  if (travel > 0) {
    const arrivalIfNow = new Date(now.getTime() + travel * 60000);
    let label = null;
    if (current && arrivalIfNow <= current.end) {
      label = tr("maintenant", "now");
    } else if (next) {
      const dep = departureTime(next.start, travel);
      label = dep <= now ? tr("maintenant", "now") : fmtTime(dep);
    }
    if (label) departHtml = `<p class="meta">${tr("Partir vers :", "Leave around:")} <span class="dep">${label}</span></p>`;
  }

  let statusClass, symbol, statusText;
  if (current) {
    statusClass = "ok";
    symbol = "✓";
    statusText = `${tr("Baignade possible", "Swimming possible")}<br /><span class="status-until">${tr("jusqu'à", "until")} ${fmtTime(current.end)}</span>`;
  } else if (next && next.start.toDateString() === now.toDateString()) {
    statusClass = "warn";
    symbol = "⚠";
    statusText = `${tr("Pas maintenant", "Not now")}<br /><span class="status-until">${tr("à partir de", "from")} ${fmtTime(next.start)}</span>`;
  } else if (next) {
    statusClass = "no";
    symbol = "⚠";
    statusText = `${tr("Pas maintenant", "Not now")}<br /><span class="status-until">${tr("à partir de", "from")} ${fmtTime(next.start)} (${fmtDate(next.start)})</span>`;
  } else {
    statusClass = "no";
    symbol = "✕";
    statusText = tr("Pas de créneau à venir dans les données chargées", "No upcoming window in the loaded data");
  }
  const activeWindow = current || next;
  let durationHtml = "";
  if (activeWindow && activeWindow.end - activeWindow.start > MAX_PLAUSIBLE_WINDOW_MS) {
    // Seuil jamais franchi dans les données chargées (plage "toujours baignable") :
    // la fenêtre calculée n'est pas bornée par la marée, donc pas de vraie durée à afficher.
    durationHtml = `<p class="meta">${tr("Baignade possible en continu sur toute la marée", "Swimmable throughout the whole tide")}</p>`;
  } else if (activeWindow) {
    durationHtml = `<p class="meta">${tr("Durée de baignade :", "Swim window:")} ${fmtDuration(activeWindow.end - activeWindow.start)}</p>`;
    if (current) {
      durationHtml += `<p class="meta">${tr("Temps restant :", "Time left:")} ${fmtDuration(activeWindow.end - now)}</p>`;
    }
  }

  const wq = beach.water_quality;
  const wqClass = wq?.latest_classification?.split(" ")[0] || "";
  const wqStatusClass = { excellent: "ok", bon: "ok", suffisant: "warn", insuffisant: "no" }[wqClass] || "";
  const wqSymbol = { excellent: "✓", bon: "✓", suffisant: "⚠", insuffisant: "✕" }[wqClass] || "";

  const hazardsHtml = beach.hazards?.length
    ? `<p class="meta hazards">⚠ ${beach.hazards.join(" · ")}</p>`
    : "";

  const detailsHtml = `
    <p class="meta"><span class="icon-arrows">↕</span> ${tr("Seuil :", "Threshold:")} ${fmtHeight(beach.swim_threshold_m)}</p>
    ${beach.swimmable_at_low_tide ? `<p class="meta">${tr("Baignable même à marée basse", "Swimmable even at low tide")}</p>` : ""}
    ${beach.surveillance ? `<p class="meta"><span class="icon-flag">⚑</span> ${tr("Surveillance :", "Lifeguards:")} ${beach.surveillance.months}, ${beach.surveillance.hours}</p>` : ""}
    ${wq ? `<p class="meta wq-row"><span class="icon-drop">💧</span> ${tr("Qualité de l'eau", "Water quality")}<br /><span class="inline-status ${wqStatusClass}">${wqSymbol} ${trWaterQuality(wq.latest_classification)}</span></p>` : ""}
    ${beach.note ? `<p class="meta">${beach.note}</p>` : ""}
    ${hazardsHtml}
  `;

  return `
    <div class="card beach" data-beach-id="${beach.id}">
      ${beach.favorite ? `<span class="fav-badge" title="${tr("Favori (affiché sur le graph)", "Favourite (shown on the graph)")}">★</span>` : ""}
      <h3><span class="legend-dot" style="background:${beach.color}"></span>${esc(beach.name)}</h3>
      <p class="status ${statusClass}">${symbol} ${statusText}</p>
      ${departHtml}
      ${durationHtml}
      <div class="beach-details" hidden>${detailsHtml}</div>
      <button type="button" class="info-toggle" aria-label="${tr("Plus d'infos", "More info")}">${INFO_ICON}</button>
    </div>
  `;
}

async function render() {
  const now = new Date();
  // État UI à préserver quand le re-render vient du rafraîchissement périodique
  const prevScrollEl = app.querySelector(".curve-scroll");
  const prevScroll = prevScrollEl ? prevScrollEl.scrollLeft : null;
  const openDetailIds = new Set(
    Array.from(app.querySelectorAll(".card.beach"))
      .filter((c) => c.querySelector(".beach-details") && !c.querySelector(".beach-details").hidden)
      .map((c) => c.dataset.beachId)
  );
  try {
    const [{ levels, tides, meta }, baseBeachesConfig, eventsConfig] = await Promise.all([
      loadStationData("la-rochelle-pallice"),
      loadBeaches(),
      fetch("/api/events")
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .catch(() => fetch("/config/events.json").then((r) => r.json()).catch(() => ({ events: [] }))),
    ]);
    const events = eventsConfig.events || [];
    const allBeaches = buildBeachList(baseBeachesConfig.beaches);
    const favoriteBeaches = allBeaches.filter((b) => b.favorite).slice(0, MAX_FAVORITES);

    const dataStale = levels.length && now > new Date(levels[levels.length - 1].time);
    const current = dataStale ? null : findCurrentLevel(levels, now);
    const nextEvents = nextTideEvents(tides, now, 1);
    const prevEvents = previousTideEvents(tides, now, 1);

    const beachesHtml = allBeaches
      .map((b) => beachStatus(b, levels, now))
      .join("");

    const curve = curveSvg(levels, tides, now, favoriteBeaches, getPrefs().showEvents, events);
    const stationDisplay = STATION_DISPLAY_NAMES[meta.site] || meta.site.toUpperCase();

    const staleBanner = dataStale
      ? `<div class="stale-banner">⚠ ${tr("Données de marée expirées (dernier point :", "Tide data expired (last point:")} ${fmtDate(levels[levels.length - 1].time)} ${fmtTime(levels[levels.length - 1].time)}). ${tr("Relancer", "Re-run")} <code>scripts/fetch_api_maree.py</code> ${tr("puis redéployer.", "then redeploy.")}</div>`
      : "";

    document.documentElement.lang = LANG;
    document.documentElement.dataset.theme = getPrefs().theme;

    const tideName = (type) =>
      type === "high" ? tr("pleine mer", "high tide") : tr("basse mer", "low tide");

    const adminCard = adminInfo?.admin
      ? `<div class="admin-card">
           <div class="admin-card-info">
             <strong>${tr("Espace admin", "Admin area")}</strong> ·
             ${adminInfo.activeUsers} ${tr("actifs (15 j)", "active (15d)")} ·
             ${adminInfo.totalUsers} ${tr("au total", "total")}
           </div>
           <a class="admin-card-link" href="/admin/">${tr("Console & stats →", "Console & stats →")}</a>
         </div>`
      : "";

    app.innerHTML = `
      <div id="theme-scope">
      ${adminCard}
      ${staleBanner}
      <div class="hero-card">
        <div class="hero-head">
          <div>
            <p class="eyebrow">${
              getName().trim()
                ? `${stationDisplay} · ${tr("DASHBOARD DE", "DASHBOARD OF")} ${esc(getName().trim().toUpperCase())}`
                : stationDisplay
            }</p>
            <h1 class="app-title">${tr("Marées &amp; Seuils de baignade", "Tides &amp; Swim thresholds")}</h1>
          </div>
          <button class="settings-btn" type="button" aria-label="${tr("Réglages", "Settings")}">${GEAR_ICON}</button>
        </div>
        <div class="now-row">
          <p class="now-line">
            ${now.toLocaleDateString(dateLocale(), { day: "numeric", month: "long" })} · ${fmtTime(now)}<span class="refresh-wrap" title="${tr("Mise à jour de la page dans 1 min", "Page refreshes in 1 min")}">${refreshPieSvg()}</span> ·
            ${current ? fmtHeight(current.height) : "—"}
            <span class="trend">${current ? trendLabel(levels, now) : ""}</span>
          </p>
          <span class="moon-icon-now" title="${tr("Phase lunaire du jour", "Today's moon phase")}">${moonSvg(now, 22)}</span>
        </div>
        <p class="meta">
          ${prevEvents[0] ? `${tr("Dernière", "Last")} ${tideName(prevEvents[0].type)}${tr(" :", ":")} ${fmtTime(prevEvents[0].time)} (${fmtHeight(prevEvents[0].height)})` : ""}
          ${nextEvents[0] ? ` · ${tr("Prochaine", "Next")} ${tideName(nextEvents[0].type)}${tr(" :", ":")} ${fmtTime(nextEvents[0].time)} (${fmtHeight(nextEvents[0].height)})` : ""}
        </p>
        <div class="curve-wrap">
          <button class="curve-arrow prev" aria-label="${tr("Jour précédent", "Previous day")}" type="button">‹</button>
          <div class="curve-scroll" data-today-x="${curve.todayX}" data-px-per-day="${PX_PER_DAY}">
            ${curve.html}
          </div>
          <button class="curve-arrow next" aria-label="${tr("Jour suivant", "Next day")}" type="button">›</button>
          <button class="today-btn" type="button" hidden>${tr("Aujourd'hui", "Today")}</button>
        </div>
        ${legendHtml(favoriteBeaches)}
        ${tideListRow(tides, now)}
      </div>
      <p class="subtitle">${tr("Station de référence :", "Reference station:")} ${meta.site} · ${tr("données", "data")} ${meta.date_from} → ${meta.date_to}</p>

      <h2>${tr("Baignade par plage", "Swimming by beach")}</h2>
      <div class="beach-grid">${beachesHtml}</div>

      <footer class="credits">
        <p class="footnote version-line">
          v${APP_VERSION} · <a href="/nouveautes/">${tr("Nouveautés", "What's new")}</a>
        </p>
        <p class="footnote">* ${tr(
          "Coefficient estimé à partir du marnage du jour, calibré sur les niveaux caractéristiques du port de La Rochelle-Pallice (valeur indicative, non officielle).",
          "Coefficient estimated from the day's tidal range, calibrated on La Rochelle-Pallice's published characteristic levels (indicative, not official)."
        )}</p>
        <p class="footnote">
          ${tr("Données de marée :", "Tide data:")} <a href="https://api-maree.fr" target="_blank" rel="noopener">api-maree.fr</a> ${tr("(licence CC-BY), calculées à partir de composantes harmoniques", "(CC-BY licence), computed from harmonic constituents by")} <a href="https://www.ifremer.fr" target="_blank" rel="noopener">IFREMER</a> / PREVIMER ·
          ${tr("Qualité des eaux de baignade :", "Bathing water quality:")} <a href="https://baignades.sante.gouv.fr" target="_blank" rel="noopener">baignades.sante.gouv.fr</a> ${tr("(Ministère de la Santé / ARS)", "(French Ministry of Health / ARS)")} ·
          ${tr("Infos plages et surveillance :", "Beach and lifeguard info:")} <a href="https://www.larochelle.fr" target="_blank" rel="noopener">larochelle.fr</a>
        </p>
        <p class="footnote">
          ${tr("Construit avec", "Built with")} <a href="https://vite.dev" target="_blank" rel="noopener">Vite</a> · ${tr("Hébergé par", "Hosted on")} <a href="https://www.netlify.com" target="_blank" rel="noopener">Netlify</a>
        </p>
        <p class="footnote credits-brand">
          ${tr("Édité par", "Published by")} larochelle-today ·
          <a href="${tr("https://creativecommons.org/licenses/by-nc-sa/4.0/deed.fr", "https://creativecommons.org/licenses/by-nc-sa/4.0/deed.en")}" target="_blank" rel="license noopener"><img src="/cc-by-nc-sa.png" alt="${tr("Licence CC BY-NC-SA 4.0", "CC BY-NC-SA 4.0 licence")}" class="cc-badge" width="80" height="15" /></a>
        </p>
      </footer>
      </div>

      ${settingsPanelHtml(allBeaches)}
    `;

    setupCurveScroll(prevScroll);
    setupSettingsPanel();
    setupBeachCards(openDetailIds);
  } catch (err) {
    app.innerHTML = `
      <h1>${tr("Marées — La Rochelle", "Tides — La Rochelle")}</h1>
      <div class="card"><p class="status">${tr("Erreur de chargement :", "Loading error:")} ${err.message}</p></div>
    `;
  }
  scheduleRefresh();
}

function setupBeachCards(openDetailIds = new Set()) {
  app.querySelectorAll(".card.beach").forEach((card) => {
    const details = card.querySelector(".beach-details");
    const btn = card.querySelector(".info-toggle");
    if (!details || !btn) return;
    if (openDetailIds.has(card.dataset.beachId)) {
      details.hidden = false;
      btn.classList.add("active");
    }
    btn.addEventListener("click", () => {
      details.hidden = !details.hidden;
      btn.classList.toggle("active", !details.hidden);
    });
  });
}

function setupCurveScroll(initialScroll = null) {
  const scrollEl = app.querySelector(".curve-scroll");
  if (!scrollEl) return;
  const todayX = parseFloat(scrollEl.dataset.todayX);
  const pxPerDay = parseFloat(scrollEl.dataset.pxPerDay);
  const prevBtn = app.querySelector(".curve-arrow.prev");
  const nextBtn = app.querySelector(".curve-arrow.next");
  const todayBtn = app.querySelector(".today-btn");

  scrollEl.scrollLeft = initialScroll ?? todayX;
  todayBtn.hidden = Math.abs(scrollEl.scrollLeft - todayX) < 5;

  prevBtn.addEventListener("click", () => {
    scrollEl.scrollBy({ left: -pxPerDay, behavior: "smooth" });
  });
  nextBtn.addEventListener("click", () => {
    scrollEl.scrollBy({ left: pxPerDay, behavior: "smooth" });
  });
  todayBtn.addEventListener("click", () => {
    scrollEl.scrollTo({ left: todayX, behavior: "smooth" });
  });
  scrollEl.addEventListener("scroll", () => {
    todayBtn.hidden = Math.abs(scrollEl.scrollLeft - todayX) < 5;
  });
}

// Rafraîchit l'instant présent (point rouge, statuts, temps restant) sans
// perdre l'état UI. Timer re-armé à chaque render pour rester synchrone avec
// l'indicateur visuel ; différé pendant que le panneau de réglages est ouvert
// pour ne pas casser un drag ou une saisie en cours.
let refreshTimer = null;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    if (settingsOpen) scheduleRefresh();
    else render();
  }, REFRESH_INTERVAL_MS);
}

// Rendu initial après chargement des réglages serveur ; re-render une fois si
// un token vient d'être créé (le lien de partage + l'en-tête apparaissent).
onSession(() => {
  if (!document.hidden) render();
});
initSession().then(() => {
  render();
  checkAdmin();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !settingsOpen) render();
});

// PWA hors-ligne (prod uniquement : en dev le SW mettrait en cache les modules Vite)
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
}
