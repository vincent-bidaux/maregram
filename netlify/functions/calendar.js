/**
 * Flux iCal des marées de La Rochelle-Pallice : un évènement « journée entière »
 * par jour, titre = pleines mers (tient dans l'agenda), description = coefficient,
 * amplitude, toutes les marées, puis les évènements locaux du jour.
 *
 * Les données (marées, évènements) sont lues depuis les fichiers statiques du
 * site déployé, donc toujours à jour après le dernier déploiement.
 */
import { approxCoefficient } from "../../src/tide.js";

export const config = { path: "/calendar.ics" };

const PARIS = "Europe/Paris";

// 4.96 -> "4m96", 2.03 -> "2m03", 5.001 -> "5m00" (report d'arrondi géré)
function heightFmt(h) {
  const cents = Math.round(h * 100);
  return `${Math.floor(cents / 100)}m${String(cents % 100).padStart(2, "0")}`;
}

function parisParts(t) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: PARIS,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(t));
  const g = (type) => p.find((x) => x.type === type).value;
  return { y: g("year"), mo: g("month"), d: g("day"), h: g("hour"), mi: g("minute") };
}

const parisDateKey = (t) => {
  const { y, mo, d } = parisParts(t);
  return `${y}-${mo}-${d}`;
};
const parisHM = (t) => {
  const { h, mi } = parisParts(t);
  return `${parseInt(h, 10)}:${mi}`;
};

const nextDateCompact = (ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.getUTCFullYear()}${String(next.getUTCMonth() + 1).padStart(2, "0")}${String(next.getUTCDate()).padStart(2, "0")}`;
};

const icsEscape = (s) =>
  String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// Repli sur les lignes >74 octets (RFC 5545), coupe prudente sur les caractères
function foldLine(line) {
  if (line.length <= 72) return line;
  const chunks = [];
  for (let i = 0; i < line.length; i += 72) chunks.push(line.slice(i, i + 72));
  return chunks.join("\r\n ");
}

const eventLabelFr = (ev) =>
  typeof ev.label === "string" ? ev.label : ev.label.fr || ev.label.en || "";

function buildIcs(tides, events) {
  const byDay = new Map();
  for (const e of tides) {
    const key = parisDateKey(e.time);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(e);
  }

  const eventsByDay = new Map();
  for (const ev of events) {
    const key = parisDateKey(ev.start);
    if (!eventsByDay.has(key)) eventsByDay.set(key, []);
    eventsByDay.get(key).push(eventLabelFr(ev));
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//larochelle-today//Marees LR//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Marées La Rochelle",
    "X-WR-TIMEZONE:Europe/Paris",
    "REFRESH-INTERVAL;VALUE=DURATION:P1D",
    "X-PUBLISHED-TTL:P1D",
  ];

  for (const key of [...byDay.keys()].sort()) {
    const dayTides = byDay.get(key).sort((a, b) => new Date(a.time) - new Date(b.time));
    const highs = dayTides.filter((e) => e.type === "high");
    const lows = dayTides.filter((e) => e.type === "low");
    if (!highs.length || !lows.length) continue;

    const avgHigh = highs.reduce((s, e) => s + e.height, 0) / highs.length;
    const avgLow = lows.reduce((s, e) => s + e.height, 0) / lows.length;
    const amplitude = avgHigh - avgLow;
    const coeff = approxCoefficient(amplitude);

    const token = (e) => `${e.type === "high" ? "↑" : "↓"}${parisHM(e.time)} ${heightFmt(e.height)}`;
    const summary = highs.map(token).join(" ");
    const tideLine = `C${coeff} · AMP${Math.round(amplitude)}m · ${dayTides.map(token).join(" ")}`;
    const descParts = [tideLine, ...(eventsByDay.get(key) || [])];

    lines.push(
      "BEGIN:VEVENT",
      `UID:${key}@maree-la-rochelle`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${key.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${nextDateCompact(key)}`,
      foldLine(`SUMMARY:${icsEscape(summary)}`),
      foldLine(`DESCRIPTION:${descParts.map(icsEscape).join("\\n")}`),
      "TRANSP:TRANSPARENT",
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export default async (req) => {
  const origin = new URL(req.url).origin;
  try {
    const [tides, eventsCfg] = await Promise.all([
      fetch(`${origin}/data/la-rochelle-pallice/high_low_tides.json`).then((r) => r.json()),
      fetch(`${origin}/config/events.json`)
        .then((r) => r.json())
        .catch(() => ({ events: [] })),
    ]);
    const ics = buildIcs(tides, eventsCfg.events || []);
    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "Content-Disposition": 'inline; filename="marees-la-rochelle.ics"',
      },
    });
  } catch (err) {
    return new Response(`Erreur de génération du calendrier : ${err.message}`, { status: 500 });
  }
};
