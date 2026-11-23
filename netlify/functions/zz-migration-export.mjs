// Fonction TEMPORAIRE de migration Netlify -> Cloudflare (supprimée au commit suivant).
import { getStore } from "@netlify/blobs";

export const config = { path: "/__migration-export" };

const KEY = "BuLzFBScCv9Sm5UqvyZOxT7hiJTn59QtqHPQCOCZTIZOy9_AlsdVLA";
const STORES = ["settings", "content"];
const ENV_KEYS = ["ADMIN_USER", "ADMIN_PASSWORD", "ADMIN_SECRET"];

const b64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export default async (req) => {
  if (new URL(req.url).searchParams.get("k") !== KEY) return new Response("Not found", { status: 404 });
  const env = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k] ?? null]));
  const stores = {};
  for (const name of STORES) {
    const store = getStore({ name, consistency: "strong" });
    const { blobs } = await store.list();
    const entries = [];
    for (const b of blobs) {
      const res = await store.getWithMetadata(b.key, { type: "arrayBuffer" });
      if (!res) continue;
      entries.push({ key: b.key, metadata: res.metadata || {}, data: b64(res.data) });
    }
    stores[name] = entries;
  }
  return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), env, stores }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
};
