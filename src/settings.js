/**
 * Réglages utilisateur persistés en local (localStorage), appliqués par-dessus
 * la config statique public/config/beaches.json : seuils, couleurs, favoris
 * (affichés sur le graph, max MAX_FAVORITES), ordre d'affichage global, et
 * lieux de baignade ajoutés localement. Pas de backend — tout reste sur
 * l'appareil de l'utilisateur.
 */
const STORAGE_KEY = "maree-la-rochelle:settings";
export const MAX_FAVORITES = 4;

export const COLOR_PALETTE = [
  "#f5a623", "#fbbf24", // ambre
  "#c77dff", "#9d4edd", // violet
  "#4ade80", "#16a34a", // vert
  "#60a5fa", "#2563eb", // bleu
  "#f87171", "#dc2626", // corail
  "#f472b6", "#db2777", // rose
];

function loadRaw() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      overrides: data?.overrides || {},
      order: data?.order || [],
      customBeaches: data?.customBeaches || [],
    };
  } catch {
    return { overrides: {}, order: [], customBeaches: [] };
  }
}

function saveRaw(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function update(mutator) {
  const data = loadRaw();
  mutator(data);
  saveRaw(data);
}

export function setThreshold(beachId, value) {
  update((s) => {
    s.overrides[beachId] = { ...s.overrides[beachId], swim_threshold_m: value };
  });
}

export function setColor(beachId, color) {
  update((s) => {
    s.overrides[beachId] = { ...s.overrides[beachId], color };
  });
}

/** currentFavoriteCount permet de refuser l'activation au-delà de MAX_FAVORITES. */
export function toggleFavorite(beachId, isCurrentlyFavorite, currentFavoriteCount) {
  if (!isCurrentlyFavorite && currentFavoriteCount >= MAX_FAVORITES) return;
  update((s) => {
    s.overrides[beachId] = { ...s.overrides[beachId], favorite: !isCurrentlyFavorite };
  });
}

export function moveBeach(orderedIds, beachId, direction) {
  const ids = [...orderedIds];
  const i = ids.indexOf(beachId);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  update((s) => {
    s.order = ids;
  });
}

export function addCustomBeach(name, thresholdM, usedColors = []) {
  const id = `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const used = new Set(usedColors);
  const color = COLOR_PALETTE.find((c) => !used.has(c)) || COLOR_PALETTE[0];
  update((s) => {
    s.customBeaches.push({ id, name, swim_threshold_m: thresholdM, color, custom: true });
  });
  return id;
}

export function removeCustomBeach(beachId) {
  update((s) => {
    s.customBeaches = s.customBeaches.filter((b) => b.id !== beachId);
    s.order = s.order.filter((id) => id !== beachId);
    delete s.overrides[beachId];
  });
}

export function resetAll() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Fusionne beaches.json + plages custom + surcharges (seuil/couleur/favori)
 * + ordre d'affichage global. Renvoie la liste finale utilisée partout
 * dans l'app (cartes, légende, graph).
 */
export function buildBeachList(baseBeaches) {
  const settings = loadRaw();

  const all = [
    ...baseBeaches.map((b) => ({ ...b, favorite: b.default_favorite ?? false, custom: false })),
    ...settings.customBeaches.map((b) => ({ ...b, favorite: false })),
  ];

  const merged = all.map((b) => ({
    ...b,
    swim_threshold_m: settings.overrides[b.id]?.swim_threshold_m ?? b.swim_threshold_m,
    color: settings.overrides[b.id]?.color ?? b.color,
    favorite: settings.overrides[b.id]?.favorite ?? b.favorite,
  }));

  const orderIndex = new Map(settings.order.map((id, i) => [id, i]));
  merged.sort((a, b) => {
    const ia = orderIndex.has(a.id) ? orderIndex.get(a.id) : Infinity;
    const ib = orderIndex.has(b.id) ? orderIndex.get(b.id) : Infinity;
    return ia - ib;
  });

  return merged;
}
