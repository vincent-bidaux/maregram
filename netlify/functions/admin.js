/**
 * Espace admin : authentification (mot de passe en variable d'environnement,
 * jamais dans le bundle) via cookie de session signé HMAC, et statistiques
 * agrégées sur les dossiers de réglages (tokens).
 *
 *   POST /api/admin/login   { user, password }  → pose le cookie de session
 *   POST /api/admin/logout                       → efface le cookie
 *   GET  /api/admin/me                           → { admin, activeUsers, totalUsers }
 *   GET  /api/admin/stats                        → stats détaillées (admin only)
 */
import { getStore } from "@netlify/blobs";
import { getBeaches, saveBeaches, getEvents, saveEvents } from "../shared/content.js";

export const config = { path: "/api/admin/:action" };

const COOKIE = "admin_session";
const SESSION_DAYS = 30;
const ACTIVE_WINDOW_MS = 15 * 86400000;
const enc = new TextEncoder();

const b64url = (bytes) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlDecode = (s) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return b64url(new Uint8Array(sig));
}

async function makeSession(secret) {
  const payload = b64url(enc.encode(JSON.stringify({ exp: Date.now() + SESSION_DAYS * 86400000 })));
  return `${payload}.${await hmac(secret, payload)}`;
}

async function verifySession(secret, value) {
  if (!value || !secret) return false;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return false;
  if (sig !== (await hmac(secret, payload))) return false;
  try {
    return JSON.parse(b64urlDecode(payload)).exp > Date.now();
  } catch {
    return false;
  }
}

function getCookie(req, name) {
  const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });

async function isAdmin(req) {
  return verifySession(process.env.ADMIN_SECRET, getCookie(req, COOKIE));
}

async function collectStats() {
  const store = getStore({ name: "settings", consistency: "strong" });
  const { blobs } = await store.list();
  const now = Date.now();
  const users = [];
  const favCounts = {};
  const customCounts = {};
  let named = 0;

  for (const b of blobs) {
    const rec = await store.get(b.key, { type: "json" });
    if (!rec) continue;
    const name = rec.name || "";
    if (name) named++;
    users.push({ token: b.key, name, createdAt: rec.createdAt || null, lastSeen: rec.lastSeen || null });
    const ov = rec.settings?.overrides || {};
    for (const [id, o] of Object.entries(ov)) if (o && o.favorite === true) favCounts[id] = (favCounts[id] || 0) + 1;
    for (const cb of rec.settings?.customBeaches || []) {
      const key = (cb.name || "?").trim();
      customCounts[key] = (customCounts[key] || 0) + 1;
    }
  }

  users.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
  const activeUsers = users.filter((u) => u.lastSeen && now - u.lastSeen < ACTIVE_WINDOW_MS).length;
  const toSorted = (obj) =>
    Object.entries(obj)
      .map(([k, count]) => ({ key: k, count }))
      .sort((a, b) => b.count - a.count);

  return {
    totalUsers: users.length,
    activeUsers,
    namedUsers: named,
    users,
    favorites: toSorted(favCounts),
    customBeaches: toSorted(customCounts),
  };
}

export default async (req) => {
  const action = new URL(req.url).pathname.split("/").pop();
  const secret = process.env.ADMIN_SECRET;

  if (action === "login" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const okUser = !process.env.ADMIN_USER || body.user === process.env.ADMIN_USER;
    if (okUser && body.password && body.password === process.env.ADMIN_PASSWORD) {
      const secureFlag = new URL(req.url).protocol === "https:" ? " Secure;" : "";
      const cookie = `${COOKIE}=${await makeSession(secret)}; HttpOnly;${secureFlag} SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}`;
      return json({ ok: true }, 200, { "Set-Cookie": cookie });
    }
    return json({ error: "invalid_credentials" }, 401);
  }

  if (action === "logout") {
    return json({ ok: true }, 200, { "Set-Cookie": `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0` });
  }

  if (action === "me") {
    if (!(await isAdmin(req))) return json({ admin: false });
    const { activeUsers, totalUsers } = await collectStats();
    return json({ admin: true, activeUsers, totalUsers });
  }

  if (action === "stats") {
    if (!(await isAdmin(req))) return json({ error: "unauthorized" }, 401);
    return json(await collectStats());
  }

  // Gestion de contenu (lieux, évènements) — admin uniquement
  const origin = new URL(req.url).origin;

  if (action === "beaches") {
    if (!(await isAdmin(req))) return json({ error: "unauthorized" }, 401);
    if (req.method === "GET") return json(await getBeaches(origin));
    if (req.method === "PUT") {
      const body = await req.json().catch(() => null);
      if (!body || !Array.isArray(body.beaches)) return json({ error: "bad_request" }, 400);
      await saveBeaches(body);
      return json({ ok: true });
    }
    return json({ error: "method_not_allowed" }, 405);
  }

  if (action === "events") {
    if (!(await isAdmin(req))) return json({ error: "unauthorized" }, 401);
    if (req.method === "GET") return json(await getEvents(origin));
    if (req.method === "PUT") {
      const body = await req.json().catch(() => null);
      if (!body || !Array.isArray(body.events)) return json({ error: "bad_request" }, 400);
      await saveEvents(body);
      return json({ ok: true });
    }
    return json({ error: "method_not_allowed" }, 405);
  }

  return json({ error: "not_found" }, 404);
};
