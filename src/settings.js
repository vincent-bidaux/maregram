/**
 * Réglages utilisateur adossés au serveur (Netlify Blobs via /api/settings),
 * sans compte : un token court identifie le dossier de réglages et voyage dans
 * l'URL (?token) pour le retrouver depuis n'importe quel appareil.
 *
 * État maintenu en mémoire, lu de façon synchrone par le rendu ; chaque
 * mutation planifie une sauvegarde serveur débouncée et met à jour un cache
 * localStorage (résilience hors-ligne et avant qu'un token n'existe). Le token
 * est créé paresseusement à la première personnalisation.
 */
const LEGACY_KEY = "maree-la-rochelle:settings";
const TOKEN_KEY = "maree-la-rochelle:token";
export const MAX_FAVORITES = 4;

export const COLOR_PALETTE = [
  "#f5a623", "#fbbf24", // ambre
  "#c77dff", "#9d4edd", // violet
  "#4ade80", "#16a34a", // vert
  "#60a5fa", "#2563eb", // bleu
  "#f87171", "#dc2626", // corail
  "#f472b6", "#db2777", // rose
];

const emptyState = () => ({ name: "", overrides: {}, order: [], customBeaches: [], prefs: {} });

let state = emptyState();
let token = null;
let saveTimer = null;
let onTokenCreated = null;

function normalize(rec) {
  const s = rec?.settings || {};
  return {
    name: rec?.name || "",
    overrides: s.overrides && typeof s.overrides === "object" ? s.overrides : {},
    order: Array.isArray(s.order) ? s.order : [],
    customBeaches: Array.isArray(s.customBeaches) ? s.customBeaches : [],
    prefs: s.prefs && typeof s.prefs === "object" ? s.prefs : {},
  };
}

function loadLegacyLocal() {
  try {
    const d = JSON.parse(localStorage.getItem(LEGACY_KEY));
    return {
      name: "",
      overrides: d?.overrides || {},
      order: d?.order || [],
      customBeaches: d?.customBeaches || [],
      prefs: d?.prefs || {},
    };
  } catch {
    return emptyState();
  }
}

function readTokenFromUrl() {
  const raw = location.search.slice(1);
  if (!raw) return null;
  // forme jolie ?kR5tv6 (sans =) ou forme explicite ?token=kR5tv6
  if (!raw.includes("=") && !raw.includes("&")) return decodeURIComponent(raw);
  return new URLSearchParams(location.search).get("token");
}

function reflectTokenInUrl() {
  const url = new URL(location.href);
  url.search = token ? `?${token}` : "";
  history.replaceState(null, "", url.toString());
}

export function getToken() {
  return token;
}
export function getName() {
  return state.name;
}
export function getShareUrl() {
  return token ? `${location.origin}/?${token}` : null;
}
/** Appelé une fois, quand un token vient d'être créé (pour rafraîchir l'UI). */
export function onSession(cb) {
  onTokenCreated = cb;
}

export async function initSession() {
  token = readTokenFromUrl() || localStorage.getItem(TOKEN_KEY);
  if (token) {
    try {
      const res = await fetch(`/api/settings?token=${encodeURIComponent(token)}`);
      if (res.ok) {
        state = normalize(await res.json());
        localStorage.setItem(TOKEN_KEY, token);
        reflectTokenInUrl();
        return;
      }
      // token inconnu (404) : on repart sur les réglages locaux
      token = null;
      localStorage.removeItem(TOKEN_KEY);
      reflectTokenInUrl();
    } catch {
      // réseau indisponible : on garde le cache local
      token = null;
    }
  }
  state = loadLegacyLocal();
}

function settingsPayload() {
  return {
    overrides: state.overrides,
    order: state.order,
    customBeaches: state.customBeaches,
    prefs: state.prefs,
  };
}

function scheduleSave() {
  localStorage.setItem(LEGACY_KEY, JSON.stringify(settingsPayload()));
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 700);
}

async function saveNow() {
  try {
    if (!token) {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: state.name, settings: settingsPayload() }),
      });
      if (!res.ok) return;
      token = (await res.json()).token;
      localStorage.setItem(TOKEN_KEY, token);
      reflectTokenInUrl();
      if (onTokenCreated) onTokenCreated();
    } else {
      await fetch(`/api/settings?token=${encodeURIComponent(token)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: state.name, settings: settingsPayload() }),
      });
    }
  } catch {
    // silencieux : le cache local est déjà à jour, réessai au prochain changement
  }
}

export function setName(name) {
  state.name = String(name).slice(0, 40);
  scheduleSave();
}

export function setThreshold(beachId, value) {
  state.overrides[beachId] = { ...state.overrides[beachId], swim_threshold_m: value };
  scheduleSave();
}

export function setTravelMinutes(beachId, minutes) {
  state.overrides[beachId] = { ...state.overrides[beachId], travel_minutes: minutes };
  scheduleSave();
}

export function setColor(beachId, color) {
  state.overrides[beachId] = { ...state.overrides[beachId], color };
  scheduleSave();
}

export function toggleFavorite(beachId, isCurrentlyFavorite, currentFavoriteCount) {
  if (!isCurrentlyFavorite && currentFavoriteCount >= MAX_FAVORITES) return;
  state.overrides[beachId] = { ...state.overrides[beachId], favorite: !isCurrentlyFavorite };
  scheduleSave();
}

export function setOrder(orderedIds) {
  state.order = orderedIds;
  scheduleSave();
}

export function addCustomBeach(name, thresholdM, usedColors = []) {
  const id = `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const used = new Set(usedColors);
  const color = COLOR_PALETTE.find((c) => !used.has(c)) || COLOR_PALETTE[0];
  state.customBeaches.push({ id, name, swim_threshold_m: thresholdM, color, custom: true });
  scheduleSave();
  return id;
}

export function removeCustomBeach(beachId) {
  state.customBeaches = state.customBeaches.filter((b) => b.id !== beachId);
  state.order = state.order.filter((id) => id !== beachId);
  delete state.overrides[beachId];
  scheduleSave();
}

export function getPrefs() {
  return { showEvents: state.prefs.showEvents ?? true };
}

export function setShowEvents(value) {
  state.prefs = { ...state.prefs, showEvents: value };
  scheduleSave();
}

/** Réinitialise les réglages de baignade (garde le nom et le token). */
export function resetAll() {
  state = { ...emptyState(), name: state.name };
  scheduleSave();
}

/**
 * Fusionne beaches.json + plages custom + surcharges (seuil/couleur/favori/
 * trajet) + ordre d'affichage global. Renvoie la liste finale utilisée partout.
 */
export function buildBeachList(baseBeaches) {
  const s = state;
  const all = [
    ...baseBeaches.map((b) => ({ ...b, favorite: b.default_favorite ?? false, custom: false })),
    ...s.customBeaches.map((b) => ({ ...b, favorite: false })),
  ];

  const merged = all.map((b) => ({
    ...b,
    swim_threshold_m: s.overrides[b.id]?.swim_threshold_m ?? b.swim_threshold_m,
    color: s.overrides[b.id]?.color ?? b.color,
    favorite: s.overrides[b.id]?.favorite ?? b.favorite,
    travel_minutes: s.overrides[b.id]?.travel_minutes ?? b.travel_minutes ?? 0,
  }));

  const orderIndex = new Map(s.order.map((id, i) => [id, i]));
  merged.sort((a, b) => {
    const ia = orderIndex.has(a.id) ? orderIndex.get(a.id) : Infinity;
    const ib = orderIndex.has(b.id) ? orderIndex.get(b.id) : Infinity;
    return ia - ib;
  });

  return merged;
}
