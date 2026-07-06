/**
 * Réglages utilisateur persistés en local (localStorage) et appliqués
 * par-dessus la config statique public/config/beaches.json. Ça permet
 * d'ajuster les seuils de baignade après des relevés sur place, sans
 * redéployer le site.
 */
const STORAGE_KEY = "maree-la-rochelle:overrides";

export function loadOverrides() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

export function saveOverride(beachId, field, value) {
  const overrides = loadOverrides();
  overrides[beachId] = { ...overrides[beachId], [field]: value };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

export function resetOverrides() {
  localStorage.removeItem(STORAGE_KEY);
}

/** Renvoie une copie de beachesConfig avec les surcharges appliquées. */
export function applyOverrides(beachesConfig, overrides) {
  return {
    ...beachesConfig,
    beaches: beachesConfig.beaches.map((b) => ({
      ...b,
      swim_threshold_m: overrides[b.id]?.swim_threshold_m ?? b.swim_threshold_m,
    })),
  };
}
