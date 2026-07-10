/**
 * Endpoint public des lieux de baignade : renvoie uniquement les lieux publiés,
 * dans l'ordre défini par l'admin. Remplace la lecture directe de
 * public/config/beaches.json par l'app (le fichier statique sert d'amorçage).
 */
import { getBeaches } from "../shared/content.js";

export const config = { path: "/api/beaches" };

export default async (req) => {
  const origin = new URL(req.url).origin;
  const cfg = await getBeaches(origin);
  const published = (cfg.beaches || []).filter((b) => b.published !== false);
  return new Response(JSON.stringify({ ...cfg, beaches: published }), {
    // pas de cache navigateur : les changements admin apparaissent au prochain
    // chargement/refresh ; le service worker garde une copie pour le hors-ligne
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
};
