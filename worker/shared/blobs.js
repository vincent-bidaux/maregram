/**
 * Couche de compatibilité « Netlify Blobs » au-dessus de Cloudflare KV, pour
 * garder le code des fonctions quasi inchangé après la migration (nov. 2026).
 * Chaque store Blobs historique correspond à un namespace KV bindé dans
 * wrangler.jsonc.
 *
 * NB : KV est eventually consistent entre datacenters (une écriture est en
 * général visible immédiatement dans le datacenter qui l'a faite, jusqu'à
 * ~60 s ailleurs). Suffisant ici : un même utilisateur relit depuis le même
 * point de présence.
 */
import { env } from "cloudflare:workers";

const BINDINGS = {
  settings: "SETTINGS_KV",
  content: "CONTENT_KV",
};

const kvType = (type) => (type === "json" ? "json" : type === "arrayBuffer" ? "arrayBuffer" : "text");

export function getStore(opts) {
  const name = typeof opts === "string" ? opts : opts.name;
  const kv = env[BINDINGS[name]];
  if (!kv) throw new Error(`Binding KV manquant pour le store "${name}"`);
  return {
    get: (key, { type } = {}) => kv.get(key, kvType(type)),
    async getWithMetadata(key, { type } = {}) {
      const r = await kv.getWithMetadata(key, kvType(type));
      return r.value === null ? null : { data: r.value, metadata: r.metadata || {} };
    },
    setJSON: (key, value) => kv.put(key, JSON.stringify(value)),
    set: (key, value, { metadata } = {}) => kv.put(key, value, metadata ? { metadata } : undefined),
    delete: (key) => kv.delete(key),
    async list() {
      const blobs = [];
      let cursor;
      do {
        const r = await kv.list({ cursor });
        blobs.push(...r.keys.map((k) => ({ key: k.name })));
        cursor = r.list_complete ? undefined : r.cursor;
      } while (cursor);
      return { blobs };
    },
  };
}

/** Lit un fichier statique du build (dist/) sans repasser par le réseau. */
export const fetchAsset = (origin, path) => env.ASSETS.fetch(new Request(new URL(path, origin)));
