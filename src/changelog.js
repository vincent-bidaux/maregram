/**
 * Page publique "Nouveautés" : liste, la plus récente en premier, des
 * fonctionnalités ajoutées à Marégram. Contenu dans changelog-data.js.
 */
import "./style.css";
import { tr, dateLocale } from "./i18n.js";
import { APP_VERSION, CHANGELOG } from "./changelog-data.js";

const root = document.getElementById("changelog");

const fmtDate = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(dateLocale(), { day: "numeric", month: "long", year: "numeric" });

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

document.documentElement.lang = tr("fr", "en");

root.innerHTML = `
  <div class="changelog-wrap">
    <p class="changelog-back"><a href="/">${tr("← Retour au tableau de bord", "← Back to the dashboard")}</a></p>
    <h1>${tr("Nouveautés", "What's new")}</h1>
    <p class="changelog-intro">
      ${tr("Marégram", "Marégram")} · v${APP_VERSION} ·
      ${tr("l'historique des fonctionnalités ajoutées, les plus récentes en premier.", "the history of features added, most recent first.")}
    </p>
    <ul class="changelog-list">
      ${CHANGELOG.map(
        (entry) => `
        <li class="changelog-entry">
          <p class="changelog-date">${esc(fmtDate(entry.date))}</p>
          <h2>${esc(entry.title[tr("fr", "en")])}</h2>
          <p>${esc(entry.body[tr("fr", "en")])}</p>
        </li>`
      ).join("")}
    </ul>
  </div>
`;
