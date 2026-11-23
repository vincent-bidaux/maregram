/**
 * Point d'entrée du Worker Cloudflare : route les anciennes Netlify Functions
 * (worker/functions/*) et laisse tout le reste aux fichiers statiques du build
 * Vite (dist/, binding ASSETS).
 */
import admin from "./functions/admin.js";
import beaches from "./functions/beaches.js";
import calendar from "./functions/calendar.js";
import events from "./functions/events.js";
import settings from "./functions/settings.js";

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    const p = pathname.replace(/\/+$/, "") || "/";

    if (p === "/api/settings") return settings(req);
    if (p === "/api/beaches") return beaches(req);
    if (p === "/api/events") return events(req);
    if (p === "/calendar.ics") return calendar(req);
    const m = p.match(/^\/api\/admin\/([^/]+)$/);
    if (m) return admin(req, { params: { action: m[1] } });
    if (p.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return env.ASSETS.fetch(req);
  },
};
