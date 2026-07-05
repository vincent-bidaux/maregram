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
} from "./tide.js";

const app = document.getElementById("app");

const fmtTime = (d) =>
  new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const fmtDate = (d) =>
  new Date(d).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const fmtHeight = (h) => `${h.toFixed(2)} m`;
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

/**
 * Courbe SVG sur 2 jours : sections visuelles par jour, pics/creux annotés
 * (heure + hauteur), et un marqueur rouge pour l'instant présent.
 */
function curveSvg(levels, tides, now, beaches = []) {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const NB_DAYS = 2;
  const windowEnd = new Date(dayStart.getTime() + NB_DAYS * 24 * 3600 * 1000);

  const points = levels.filter((p) => {
    const t = new Date(p.time);
    return t >= dayStart && t <= windowEnd;
  });
  if (points.length < 2) return "";

  const w = 640;
  const h = 200;
  const padX = 10;
  const topLabelBand = 46; // place pour les libellés des pleines mers
  const bottomLabelBand = 46; // place pour les libellés des basses mers
  const heights = points.map((p) => p.height);
  const thresholds = beaches.map((b) => b.swim_threshold_m);
  const minH = Math.min(...heights, ...thresholds);
  const maxH = Math.max(...heights, ...thresholds);
  const t0 = dayStart.getTime();
  const t1 = windowEnd.getTime();

  const x = (t) => padX + ((t - t0) / (t1 - t0)) * (w - 2 * padX);
  const y = (v) =>
    h - bottomLabelBand - ((v - minH) / (maxH - minH || 1)) * (h - topLabelBand - bottomLabelBand);

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(new Date(p.time).getTime()).toFixed(1)} ${y(p.height).toFixed(1)}`)
    .join(" ");

  // Sections par jour : bande alternée + libellé + séparateur
  let daySections = "";
  for (let i = 0; i < NB_DAYS; i++) {
    const d0 = new Date(dayStart.getTime() + i * 86400000);
    const d1 = new Date(dayStart.getTime() + (i + 1) * 86400000);
    const bx0 = x(d0.getTime());
    const bx1 = x(d1.getTime());
    if (i % 2 === 1) {
      daySections += `<rect x="${bx0.toFixed(1)}" y="0" width="${(bx1 - bx0).toFixed(1)}" height="${h}" fill="rgba(255,255,255,0.03)" />`;
    }
    if (i > 0) {
      daySections += `<line x1="${bx0.toFixed(1)}" y1="0" x2="${bx0.toFixed(1)}" y2="${h}" stroke="rgba(255,255,255,0.12)" stroke-width="1" />`;
    }
    daySections += `<text x="${(bx0 + 6).toFixed(1)}" y="14" class="day-label">${fmtDayLabel(d0, dayStart)}</text>`;
  }

  // Libellés des pleines/basses mers visibles dans la fenêtre
  let tideLabels = "";
  for (const e of tides) {
    const t = new Date(e.time);
    if (t < dayStart || t > windowEnd) continue;
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

  const nowPoint = findCurrentLevel(points, now) || points[0];
  const nowX = x(now.getTime());
  const nowY = y(nowPoint.height);
  const nowClamped = Math.max(padX, Math.min(w - padX, nowX));

  const thresholdLines = beaches
    .map((b) => {
      const ty = y(b.swim_threshold_m);
      return `<line x1="${padX}" y1="${ty.toFixed(1)}" x2="${w - padX}" y2="${ty.toFixed(1)}" stroke="${b.color}" stroke-width="1.5" stroke-dasharray="2 4" opacity="0.85" />`;
    })
    .join("");

  const legend = beaches.length
    ? `
      <div class="threshold-legend">
        ${beaches
          .map(
            (b) => `
              <span class="legend-item">
                <span class="legend-dot" style="background:${b.color}"></span>
                ${b.name} (${b.swim_threshold_m.toFixed(2)} m)
              </span>
            `
          )
          .join("")}
      </div>
    `
    : "";

  return `
    <svg viewBox="0 0 ${w} ${h}" class="curve">
      ${daySections}
      ${thresholdLines}
      <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" />
      ${tideLabels}
      <circle cx="${nowClamped.toFixed(1)}" cy="${nowY.toFixed(1)}" r="5.5" fill="#e2554f" stroke="#0b1e2d" stroke-width="2" />
    </svg>
    ${legend}
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

  const items = todays
    .map(
      (e) => `
        <div class="tide-item">
          <span class="tide-arrow ${e.type}">${e.type === "high" ? "↑" : "↓"}</span>
          <span class="tide-item-text">
            <span class="tide-item-time">${fmtTime(e.time)}</span>
            <span class="tide-item-height">${e.height.toFixed(2)} m</span>
          </span>
        </div>
      `
    )
    .join("");

  return `<div class="tide-list">${items}</div>`;
}

function beachStatus(beach, levels, now) {
  const windows = swimWindows(levels, beach.swim_threshold_m);
  const current = currentSwimWindow(windows, now);
  const next = nextSwimWindow(windows, now);

  let statusHtml;
  if (current) {
    statusHtml = `<span class="badge ok">Baignade possible</span> jusqu'à ${fmtTime(current.end)}`;
  } else if (next) {
    statusHtml = `<span class="badge no">Pas maintenant</span> à partir de ${fmtTime(next.start)} (${fmtDate(next.start)})`;
  } else {
    statusHtml = `<span class="badge no">Pas de créneau à venir dans les données chargées</span>`;
  }

  const wq = beach.water_quality;
  const wqClass = wq?.latest_classification?.split(" ")[0] || "";
  const wqBadgeClass = { excellent: "ok", bon: "ok", suffisant: "warn", insuffisant: "no" }[wqClass] || "";

  const hazardsHtml = beach.hazards?.length
    ? `<p class="meta hazards">⚠ ${beach.hazards.join(" · ")}</p>`
    : "";

  return `
    <div class="card beach">
      <h3><span class="legend-dot" style="background:${beach.color}"></span>${beach.name}</h3>
      <p class="status">${statusHtml}</p>
      <p class="meta">Seuil : ${fmtHeight(beach.swim_threshold_m)}${beach.swimmable_at_low_tide ? " · baignable même à marée basse" : ""}</p>
      <p class="meta">Surveillance : ${beach.surveillance?.months || "?"}, ${beach.surveillance?.hours || "?"}</p>
      ${wq ? `<p class="meta">Qualité de l'eau : <span class="badge ${wqBadgeClass}">${wq.latest_classification}</span></p>` : ""}
      ${hazardsHtml}
    </div>
  `;
}

async function render() {
  const now = new Date();
  try {
    const [{ levels, tides, meta }, beachesConfig] = await Promise.all([
      loadStationData("la-rochelle-pallice"),
      loadBeaches(),
    ]);

    const current = findCurrentLevel(levels, now);
    const nextEvents = nextTideEvents(tides, now, 1);
    const prevEvents = previousTideEvents(tides, now, 1);

    const beachesHtml = beachesConfig.beaches
      .map((b) => beachStatus(b, levels, now))
      .join("");

    app.innerHTML = `
      <div class="hero-card">
        <p class="eyebrow">Aujourd'hui</p>
        <h1 class="date-big">${now.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</h1>
        <p class="now-height">${current ? fmtHeight(current.height) : "—"} <span class="trend">${current ? trendLabel(levels, now) : ""}</span></p>
        <p class="meta">
          ${prevEvents[0] ? `Dernière ${prevEvents[0].type === "high" ? "pleine" : "basse"} mer : ${fmtTime(prevEvents[0].time)} (${fmtHeight(prevEvents[0].height)})` : ""}
          ${nextEvents[0] ? ` · Prochaine ${nextEvents[0].type === "high" ? "pleine" : "basse"} mer : ${fmtTime(nextEvents[0].time)} (${fmtHeight(nextEvents[0].height)})` : ""}
        </p>
        ${curveSvg(levels, tides, now, beachesConfig.beaches)}
        ${tideListRow(tides, now)}
      </div>
      <p class="subtitle">Station de référence : ${meta.site} · données ${meta.date_from} → ${meta.date_to}</p>

      <h2>Baignade par plage</h2>
      ${beachesHtml}

      <p class="footnote">${meta.attribution}</p>
    `;
  } catch (err) {
    app.innerHTML = `
      <h1>Marées — La Rochelle</h1>
      <div class="card"><p class="status">Erreur de chargement : ${err.message}</p></div>
    `;
  }
}

render();
