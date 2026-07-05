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

function trendLabel(levels, now) {
  const idx = levels.findIndex((p) => new Date(p.time) > now);
  if (idx < 1) return "";
  const rising = levels[idx].height > levels[idx - 1].height;
  return rising ? "montante ↗" : "descendante ↘";
}

function curveSvg(levels, now) {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 2 * 24 * 3600 * 1000);
  const points = levels.filter((p) => {
    const t = new Date(p.time);
    return t >= dayStart && t <= dayEnd;
  });
  if (points.length < 2) return "";

  const w = 640;
  const h = 140;
  const pad = 6;
  const heights = points.map((p) => p.height);
  const minH = Math.min(...heights);
  const maxH = Math.max(...heights);
  const t0 = new Date(points[0].time).getTime();
  const t1 = new Date(points[points.length - 1].time).getTime();

  const x = (t) => pad + ((t - t0) / (t1 - t0)) * (w - 2 * pad);
  const y = (v) => h - pad - ((v - minH) / (maxH - minH || 1)) * (h - 2 * pad);

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(new Date(p.time).getTime()).toFixed(1)} ${y(p.height).toFixed(1)}`)
    .join(" ");

  const nowX = x(now.getTime());
  const nowClamped = Math.max(pad, Math.min(w - pad, nowX));

  return `
    <svg viewBox="0 0 ${w} ${h}" class="curve">
      <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2" />
      <line x1="${nowClamped}" y1="0" x2="${nowClamped}" y2="${h}" stroke="var(--muted)" stroke-dasharray="4 3" />
    </svg>
  `;
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
      <h3>${beach.name}</h3>
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
      <h1>Marées — La Rochelle</h1>
      <p class="subtitle">Station de référence : ${meta.site} · données ${meta.date_from} → ${meta.date_to}</p>

      <div class="card">
        <p class="now-height">${current ? fmtHeight(current.height) : "—"} <span class="trend">${current ? trendLabel(levels, now) : ""}</span></p>
        <p class="meta">
          ${prevEvents[0] ? `Dernière ${prevEvents[0].type === "high" ? "pleine" : "basse"} mer : ${fmtTime(prevEvents[0].time)} (${fmtHeight(prevEvents[0].height)})` : ""}
          ${nextEvents[0] ? ` · Prochaine ${nextEvents[0].type === "high" ? "pleine" : "basse"} mer : ${fmtTime(nextEvents[0].time)} (${fmtHeight(nextEvents[0].height)})` : ""}
        </p>
        ${curveSvg(levels, now)}
      </div>

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
