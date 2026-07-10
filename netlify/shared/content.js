/**
 * Contenu géré par l'admin (lieux de baignade, évènements) stocké dans Netlify
 * Blobs, avec amorçage depuis les fichiers statiques historiques la première
 * fois (migration douce). Partagé par les fonctions publiques et admin.
 */
import { getStore } from "@netlify/blobs";

const store = () => getStore({ name: "content", consistency: "strong" });

export async function getBeaches(origin) {
  const s = store();
  let cfg = await s.get("beaches", { type: "json" });
  if (!cfg) {
    const seed = await fetch(`${origin}/config/beaches.json`).then((r) => r.json());
    cfg = { ...seed, beaches: (seed.beaches || []).map((b) => ({ ...b, published: true })) };
    await s.setJSON("beaches", cfg);
  }
  return cfg;
}

export async function saveBeaches(cfg) {
  await store().setJSON("beaches", { ...cfg, updatedAt: Date.now() });
}

export async function getEvents(origin) {
  const s = store();
  let cfg = await s.get("events", { type: "json" });
  if (!cfg) {
    const seed = await fetch(`${origin}/config/events.json`).then((r) => r.json());
    cfg = { events: (seed.events || []).map((e) => ({ ...e, published: true })) };
    await s.setJSON("events", cfg);
  }
  return cfg;
}

export async function saveEvents(cfg) {
  await store().setJSON("events", { ...cfg, updatedAt: Date.now() });
}
