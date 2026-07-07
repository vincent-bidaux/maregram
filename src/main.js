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
  setThreshold,
  setTravelMinutes,
  setColor,
  toggleFavorite,
  setOrder,
  addCustomBeach,
  removeCustomBeach,
  resetAll,
  buildBeachList,
} from "./settings.js";

const app = document.getElementById("app");

const fmtTime = (d) =>
  new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const fmtDate = (d) =>
  new Date(d).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const fmtHeight = (h) => `${h.toFixed(2)} m`;
const fmtDuration = (ms) => {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
};
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDayLabel = (d, today) => {
  const isToday = d.toDateString() === today.toDateString();
  const isTomorrow = d.toDateString() === new Date(today.getTime() + 86400000).toDateString();
  if (isToday) return "Aujourd'hui";
  if (isTomorrow) return "Demain";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
};

function trendLabel(levels, now) {
  const idx = levels.findIndex((p) => new Date(p.time) > now);
  if (idx < 1) return "";
  const rising = levels[idx].height > levels[idx - 1].height;
  return rising ? "montante ↗" : "descendante ↘";
}

// Phase lunaire approximative (précision ~1 jour, suffisante pour une icône).
const SYNODIC_MONTH = 29.530588853;
const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
const MOON_ICONS = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];

function moonEmoji(date) {
  const days = (date.getTime() - KNOWN_NEW_MOON) / 86400000;
  let fraction = (days % SYNODIC_MONTH) / SYNODIC_MONTH;
  if (fraction < 0) fraction += 1;
  return MOON_ICONS[Math.round(fraction * 8) % 8];
}

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

/**
 * Courbe SVG sur toute la période chargée : sections visuelles par jour,
 * pics/creux annotés (heure + hauteur), lignes de seuil par plage, et un
 * marqueur rouge pour l'instant présent. Rendu en pixels réels (pas de
 * viewBox mise à l'échelle) pour être placé dans un conteneur scrollable.
 */
function curveSvg(levels, tides, now, beaches = []) {
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
    const dayLabelText = fmtDayLabel(d0, now);
    const dayLabelWidth = measureTextWidth(
      dayLabelText.toUpperCase(),
      "600 11px system-ui, -apple-system, 'Segoe UI', sans-serif"
    );
    const moonX = bx0 + 6 + dayLabelWidth + 8;
    daySections += `<text x="${(bx0 + 6).toFixed(1)}" y="14" class="day-label">${dayLabelText}</text>`;
    daySections += `<text x="${moonX.toFixed(1)}" y="15" class="day-moon">${moonEmoji(d0)}</text>`;
  }

  // Libellés de toutes les pleines/basses mers
  let tideLabels = "";
  for (const e of tides) {
    const t = new Date(e.time);
    const ex = x(t.getTime());
    const ey = y(e.height);
    const time = fmtTime(e.time);
    const height = e.height.toFixed(2);
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
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="curve">
      ${daySections}
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
    amplitudeHtml = `
      <p class="meta amplitude" title="Estimation à partir du marnage du jour, calibrée sur les niveaux caractéristiques du port (marnage ≈ 5,65 m pour un coefficient 100) ; le SHOM ne publie pas gratuitement le coefficient officiel">
        Coefficient ≈ ${coeff}* · Amplitude moyenne aujourd'hui ≈ ${avgAmplitude.toFixed(2)} m
      </p>
    `;
  }

  return `<div class="tide-list">${items}</div>${amplitudeHtml}`;
}

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
          <button type="button" class="drag-handle" aria-label="Réordonner">${DRAG_HANDLE_ICON}</button>
          <div class="settings-beach-main">
            <div class="settings-beach-top">
              <button type="button" class="fav-star ${b.favorite ? "active" : ""}" ${starDisabled ? "disabled" : ""} aria-label="Favori">${b.favorite ? "★" : "☆"}</button>
              <button type="button" class="color-swatch" data-color="${b.color}" style="background:${b.color}" aria-label="Changer la couleur"></button>
              <span class="settings-row-label">${esc(b.name)}</span>
              ${b.custom ? `<button type="button" class="remove-custom" aria-label="Supprimer">✕</button>` : ""}
            </div>
            ${colorPaletteHtml(b.id)}
            <div class="settings-beach-bottom">
              <span class="settings-row-input" title="Temps de trajet jusqu'à ce lieu (pour l'heure de départ)">
                <span>🚶</span>
                <input type="number" step="5" min="0" max="240" value="${b.travel_minutes}" data-field="travel_minutes" />
                <span>min</span>
              </span>
              <span class="settings-row-input">
                <input type="number" step="0.05" min="0" max="10" value="${b.swim_threshold_m.toFixed(2)}" data-field="swim_threshold_m" />
                <span>m</span>
              </span>
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
          <h2>Réglages</h2>
          <button class="settings-close" type="button" aria-label="Fermer">✕</button>
        </div>
        <div class="settings-body">
          <h3>Lieux de baignade</h3>
          <p class="meta">
            L'étoile ajoute le lieu au graph (max ${MAX_FAVORITES}). Glisse la poignée pour réordonner —
            l'ordre s'applique à toute l'app. Réglages enregistrés sur cet appareil seulement.
          </p>
          <div class="settings-beach-list">${rows}</div>

          <h3>Ajouter un lieu</h3>
          <form class="add-beach-form">
            <input type="text" name="name" placeholder="Nom du lieu" required />
            <span class="settings-row-input">
              <input type="number" name="threshold" step="0.05" min="0" max="10" placeholder="3.00" required />
              <span>m</span>
            </span>
            <button type="submit">Ajouter</button>
          </form>

          <button class="settings-reset" type="button">Réinitialiser les valeurs par défaut</button>
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

  openBtn.addEventListener("click", () => {
    settingsOpen = true;
    overlay.classList.add("open");
  });
  closeBtn.addEventListener("click", () => {
    settingsOpen = false;
    overlay.classList.remove("open");
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      settingsOpen = false;
      overlay.classList.remove("open");
    }
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
  const depHtml = (start) =>
    travel > 0 ? ` · partir à ${fmtTime(departureTime(start, travel))}` : "";

  let statusClass, symbol, statusText;
  if (current) {
    statusClass = "ok";
    symbol = "✓";
    statusText = `Baignade possible<br /><span class="status-until">jusqu'à ${fmtTime(current.end)}</span>`;
  } else if (next && next.start.toDateString() === now.toDateString()) {
    statusClass = "warn";
    symbol = "⚠";
    statusText = `Pas maintenant<br /><span class="status-until">à partir de ${fmtTime(next.start)}${depHtml(next.start)}</span>`;
  } else if (next) {
    statusClass = "no";
    symbol = "⚠";
    statusText = `Pas maintenant<br /><span class="status-until">à partir de ${fmtTime(next.start)} (${fmtDate(next.start)})${depHtml(next.start)}</span>`;
  } else {
    statusClass = "no";
    symbol = "✕";
    statusText = `Pas de créneau à venir dans les données chargées`;
  }
  const activeWindow = current || next;
  let durationHtml = "";
  if (activeWindow && activeWindow.end - activeWindow.start > MAX_PLAUSIBLE_WINDOW_MS) {
    // Seuil jamais franchi dans les données chargées (plage "toujours baignable") :
    // la fenêtre calculée n'est pas bornée par la marée, donc pas de vraie durée à afficher.
    durationHtml = `<p class="meta">Baignade possible en continu sur toute la marée</p>`;
  } else if (activeWindow) {
    durationHtml = `<p class="meta">Durée de baignade : ${fmtDuration(activeWindow.end - activeWindow.start)}</p>`;
    if (current) {
      durationHtml += `<p class="meta">Temps restant : ${fmtDuration(activeWindow.end - now)}</p>`;
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
    <p class="meta"><span class="icon-arrows">↕</span> Seuil : ${fmtHeight(beach.swim_threshold_m)}</p>
    ${beach.swimmable_at_low_tide ? `<p class="meta">Baignable même à marée basse</p>` : ""}
    ${beach.surveillance ? `<p class="meta"><span class="icon-flag">⚑</span> Surveillance : ${beach.surveillance.months}, ${beach.surveillance.hours}</p>` : ""}
    ${wq ? `<p class="meta wq-row"><span class="icon-drop">💧</span> Qualité de l'eau<br /><span class="inline-status ${wqStatusClass}">${wqSymbol} ${wq.latest_classification}</span></p>` : ""}
    ${beach.note ? `<p class="meta">${beach.note}</p>` : ""}
    ${hazardsHtml}
  `;

  return `
    <div class="card beach" data-beach-id="${beach.id}">
      ${beach.favorite ? `<span class="fav-badge" title="Favori (affiché sur le graph)">★</span>` : ""}
      <h3><span class="legend-dot" style="background:${beach.color}"></span>${esc(beach.name)}</h3>
      <p class="status ${statusClass}">${symbol} ${statusText}</p>
      ${durationHtml}
      <div class="beach-details" hidden>${detailsHtml}</div>
      <button type="button" class="info-toggle" aria-label="Plus d'infos">${INFO_ICON}</button>
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
    const [{ levels, tides, meta }, baseBeachesConfig] = await Promise.all([
      loadStationData("la-rochelle-pallice"),
      loadBeaches(),
    ]);
    const allBeaches = buildBeachList(baseBeachesConfig.beaches);
    const favoriteBeaches = allBeaches.filter((b) => b.favorite).slice(0, MAX_FAVORITES);

    const dataStale = levels.length && now > new Date(levels[levels.length - 1].time);
    const current = dataStale ? null : findCurrentLevel(levels, now);
    const nextEvents = nextTideEvents(tides, now, 1);
    const prevEvents = previousTideEvents(tides, now, 1);

    const beachesHtml = allBeaches
      .map((b) => beachStatus(b, levels, now))
      .join("");

    const curve = curveSvg(levels, tides, now, favoriteBeaches);
    const stationDisplay = STATION_DISPLAY_NAMES[meta.site] || meta.site.toUpperCase();

    const staleBanner = dataStale
      ? `<div class="stale-banner">⚠ Données de marée expirées (dernier point : ${fmtDate(levels[levels.length - 1].time)} ${fmtTime(levels[levels.length - 1].time)}). Relancer <code>scripts/fetch_api_maree.py</code> puis redéployer.</div>`
      : "";

    app.innerHTML = `
      ${staleBanner}
      <div class="hero-card">
        <div class="hero-head">
          <div>
            <p class="eyebrow">${stationDisplay}</p>
            <h1 class="app-title">Marées &amp; Seuils de baignade</h1>
          </div>
          <button class="settings-btn" type="button" aria-label="Réglages">${GEAR_ICON}</button>
        </div>
        <div class="now-row">
          <p class="now-line">
            ${now.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} ·
            ${current ? fmtHeight(current.height) : "—"}
            <span class="trend">${current ? trendLabel(levels, now) : ""}</span>
          </p>
          <span class="moon-icon-now" title="Phase lunaire du jour">${moonEmoji(now)}</span>
        </div>
        <p class="meta">
          ${prevEvents[0] ? `Dernière ${prevEvents[0].type === "high" ? "pleine" : "basse"} mer : ${fmtTime(prevEvents[0].time)} (${fmtHeight(prevEvents[0].height)})` : ""}
          ${nextEvents[0] ? ` · Prochaine ${nextEvents[0].type === "high" ? "pleine" : "basse"} mer : ${fmtTime(nextEvents[0].time)} (${fmtHeight(nextEvents[0].height)})` : ""}
        </p>
        <div class="curve-wrap">
          <button class="curve-arrow prev" aria-label="Jour précédent" type="button">‹</button>
          <div class="curve-scroll" data-today-x="${curve.todayX}" data-px-per-day="${PX_PER_DAY}">
            ${curve.html}
          </div>
          <button class="curve-arrow next" aria-label="Jour suivant" type="button">›</button>
          <button class="today-btn" type="button" hidden>Aujourd'hui</button>
        </div>
        ${legendHtml(favoriteBeaches)}
        ${tideListRow(tides, now)}
      </div>
      <p class="subtitle">Station de référence : ${meta.site} · données ${meta.date_from} → ${meta.date_to}</p>

      <h2>Baignade par plage</h2>
      <div class="beach-grid">${beachesHtml}</div>

      <p class="footnote">${meta.attribution}<br />* Coefficient estimé à partir du marnage, calibré sur les niveaux caractéristiques du port de La Rochelle-Pallice — le SHOM ne publie pas gratuitement la valeur officielle.</p>

      ${settingsPanelHtml(allBeaches)}
    `;

    setupCurveScroll(prevScroll);
    setupSettingsPanel();
    setupBeachCards(openDetailIds);
  } catch (err) {
    app.innerHTML = `
      <h1>Marées — La Rochelle</h1>
      <div class="card"><p class="status">Erreur de chargement : ${err.message}</p></div>
    `;
  }
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

render();

// Rafraîchit l'instant présent (point rouge, statuts, temps restant) sans
// perdre l'état UI ; suspendu pendant que le panneau de réglages est ouvert
// pour ne pas casser un drag ou une saisie en cours.
setInterval(() => {
  if (!settingsOpen) render();
}, 60_000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !settingsOpen) render();
});

// PWA hors-ligne (prod uniquement : en dev le SW mettrait en cache les modules Vite)
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}
