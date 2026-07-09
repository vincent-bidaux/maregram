/**
 * Service worker : network-first avec repli cache pour tout le same-origin.
 * En ligne, on sert du frais (et on met à jour le cache) ; hors ligne, on
 * sert la dernière version vue, données de marée incluses.
 *
 * Écrit défensivement pour iOS Safari : timeout réseau sur les navigations
 * (sinon Safari peut rester bloqué puis afficher une page blanche), mise en
 * cache des seules réponses valides, et repli ultime sur une page minimale
 * plutôt qu'une erreur.
 */
const CACHE = "maree-lr-v2";
const NAV_TIMEOUT_MS = 5000;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add("/")));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

async function cachePut(req, res) {
  try {
    const c = await caches.open(CACHE);
    await c.put(req, res);
  } catch {
    // stockage plein ou réponse non cachable : tant pis, on sert quand même
  }
}

const OFFLINE_FALLBACK = `<!doctype html><html lang="fr"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<body style="background:#0a1622;color:#eaf4f9;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
<p style="text-align:center;padding:1rem">Hors ligne et aucune version en cache.<br>Réessaie avec du réseau.</p></body></html>`;

async function handleNavigation(event) {
  try {
    const res = await withTimeout(fetch(event.request), NAV_TIMEOUT_MS);
    if (res && res.ok) {
      event.waitUntil(cachePut("/", res.clone()));
      return res;
    }
    throw new Error(`HTTP ${res && res.status}`);
  } catch {
    const cached = await caches.match("/", { ignoreSearch: true });
    return cached || new Response(OFFLINE_FALLBACK, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

async function handleAsset(event) {
  try {
    const res = await fetch(event.request);
    if (res && res.ok) event.waitUntil(cachePut(event.request, res.clone()));
    return res;
  } catch (err) {
    const cached = await caches.match(event.request, { ignoreSearch: true });
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(handleNavigation(event));
  } else {
    event.respondWith(handleAsset(event));
  }
});
