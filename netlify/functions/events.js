/**
 * Endpoint public des évènements de la timeline : renvoie uniquement les
 * évènements publiés. Lu par l'app et par le flux iCal ; le fichier statique
 * public/config/events.json sert d'amorçage.
 */
import { getEvents } from "../shared/content.js";

export const config = { path: "/api/events" };

export default async (req) => {
  const origin = new URL(req.url).origin;
  const cfg = await getEvents(origin);
  const published = (cfg.events || []).filter((e) => e.published !== false);
  return new Response(JSON.stringify({ events: published }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
};
