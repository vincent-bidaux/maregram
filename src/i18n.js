/**
 * i18n minimaliste : français par défaut pour les navigateurs francophones,
 * anglais sinon. Choix forcé persisté en cookie (`lang`), prioritaire sur la
 * langue du navigateur. Les chaînes sont inline aux points d'appel via
 * tr(fr, en) — pas de fichier de clés pour une app de cette taille.
 */
const COOKIE_RE = /(?:^|; )lang=(fr|en)/;

function cookieLang() {
  const m = document.cookie.match(COOKIE_RE);
  return m ? m[1] : null;
}

export function detectLang() {
  const forced = cookieLang();
  if (forced) return forced;
  const nav = (navigator.language || "fr").toLowerCase();
  return nav.startsWith("fr") ? "fr" : "en";
}

export let LANG = detectLang();

export function setLang(lang) {
  document.cookie = `lang=${lang};path=/;max-age=31536000;samesite=lax`;
  LANG = lang;
}

export const tr = (fr, en) => (LANG === "fr" ? fr : en);

export const dateLocale = () => (LANG === "fr" ? "fr-FR" : "en-GB");

/** Classifications qualité d'eau (données ARS en français) → affichage. */
const WQ_EN = { excellent: "excellent", bon: "good", suffisant: "sufficient", insuffisant: "poor" };

export function trWaterQuality(classification) {
  if (LANG === "fr" || !classification) return classification;
  const word = classification.split(" ")[0];
  return WQ_EN[word] ? classification.replace(word, WQ_EN[word]) : classification;
}
