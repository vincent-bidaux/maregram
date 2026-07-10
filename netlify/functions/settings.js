/**
 * Réglages utilisateur côté serveur, sans compte : chaque jeu de réglages est
 * identifié par un token court stocké dans Netlify Blobs. Le token voyage dans
 * l'URL (?token) pour retrouver ses réglages depuis n'importe quel appareil.
 *
 *   GET  /api/settings?token=T  → charge le dossier (met à jour lastSeen)
 *   POST /api/settings          → crée un dossier, renvoie un token unique
 *   PUT  /api/settings?token=T  → écrase name/settings du dossier
 */
import { getStore } from "@netlify/blobs";

export const config = { path: "/api/settings" };

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz"; // sans 0/O/1/I/l
const randToken = (len = 7) => {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return [...a].map((b) => ALPHABET[b % ALPHABET.length]).join("");
};

async function uniqueToken(store) {
  for (let i = 0; i < 6; i++) {
    const t = randToken();
    if (!(await store.get(t))) return t;
  }
  return randToken(10);
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

// Ne garde que la forme attendue (évite de stocker n'importe quoi)
function cleanSettings(s = {}) {
  return {
    overrides: s.overrides && typeof s.overrides === "object" ? s.overrides : {},
    order: Array.isArray(s.order) ? s.order : [],
    customBeaches: Array.isArray(s.customBeaches) ? s.customBeaches : [],
    prefs: s.prefs && typeof s.prefs === "object" ? s.prefs : {},
  };
}

export default async (req) => {
  const store = getStore("settings");
  const token = new URL(req.url).searchParams.get("token");

  try {
    if (req.method === "GET") {
      if (!token) return json({ error: "missing_token" }, 400);
      const rec = await store.get(token, { type: "json" });
      if (!rec) return json({ error: "not_found" }, 404);
      rec.lastSeen = Date.now();
      await store.setJSON(token, rec);
      return json(rec);
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const newToken = await uniqueToken(store);
      const rec = {
        name: typeof body.name === "string" ? body.name.slice(0, 40) : "",
        settings: cleanSettings(body.settings),
        createdAt: Date.now(),
        lastSeen: Date.now(),
      };
      await store.setJSON(newToken, rec);
      return json({ token: newToken, ...rec });
    }

    if (req.method === "PUT") {
      if (!token) return json({ error: "missing_token" }, 400);
      const existing = await store.get(token, { type: "json" });
      if (!existing) return json({ error: "not_found" }, 404);
      const body = await req.json().catch(() => ({}));
      const rec = {
        ...existing,
        name: typeof body.name === "string" ? body.name.slice(0, 40) : existing.name || "",
        settings: cleanSettings(body.settings ?? existing.settings),
        lastSeen: Date.now(),
      };
      await store.setJSON(token, rec);
      return json(rec);
    }

    return json({ error: "method_not_allowed" }, 405);
  } catch (err) {
    return json({ error: "server_error", message: err.message }, 500);
  }
};
