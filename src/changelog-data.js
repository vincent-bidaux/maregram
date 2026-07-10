/**
 * Historique public des fonctionnalités ajoutées à Marégram, le plus récent
 * en premier. Volontairement centré sur ce qui change l'usage de l'app — pas
 * les corrections de bugs ni les outils internes/admin. Mis à jour à chaque
 * nouvelle fonctionnalité publiée (voir footer : lien "Nouveautés").
 */
export const APP_VERSION = "10.2";

export const CHANGELOG = [
  {
    date: "2026-07-10",
    title: { fr: "Thème clair et modes noir & blanc", en: "Light theme and black & white modes" },
    body: {
      fr: "Un thème clair (fond crème, texte foncé) s'ajoute au thème sombre, avec deux modes noir & blanc (positif et négatif) pensés pour un futur écran connecté. À choisir dans les réglages.",
      en: "A light theme (cream background, dark text) joins the dark theme, plus two black & white modes (positive and negative) designed for a future connected display. Pick one in settings.",
    },
  },
  {
    date: "2026-07-10",
    title: { fr: "Marégram a un nom", en: "Marégram has a name" },
    body: {
      fr: "Le tableau de bord s'appelle désormais Marégram sur l'écran d'accueil et l'onglet du navigateur.",
      en: "The dashboard is now called Marégram on the home screen and browser tab.",
    },
  },
  {
    date: "2026-07-10",
    title: { fr: "Améliorations visuelles de la frise", en: "Timeline visual improvements" },
    body: {
      fr: "Les hauteurs d'eau affichent leur unité (m), le coefficient de marée change de teinte pour les grandes marées (au-delà de 90) et les marées faibles (en dessous de 50), et les évènements se distinguent mieux visuellement les uns des autres.",
      en: "Water heights now show their unit (m), the tidal coefficient is tinted for spring tides (above 90) and neap tides (below 50), and events are visually easier to tell apart.",
    },
  },
  {
    date: "2026-07-10",
    title: { fr: "Calendrier des marées abonnable", en: "Subscribable tide calendar" },
    body: {
      fr: "Un lien à ajouter dans l'agenda du téléphone ou de l'ordinateur (iPhone, Google, Outlook…) : un évènement par jour avec les horaires de marée, les hauteurs, le coefficient et les évènements locaux du jour.",
      en: "A link to subscribe from your phone or computer's calendar (iPhone, Google, Outlook…): one event per day with tide times, heights, coefficient and that day's local events.",
    },
  },
  {
    date: "2026-07-10",
    title: { fr: "Ajout à l'écran d'accueil en un clic", en: "One-tap add to home screen" },
    body: {
      fr: "Un bouton dans les réglages pour ajouter Marégram sur l'écran d'accueil du téléphone, avec les instructions adaptées à l'appareil utilisé.",
      en: "A settings button to add Marégram to your phone's home screen, with instructions tailored to your device.",
    },
  },
  {
    date: "2026-07-10",
    title: { fr: "Réglages synchronisés en ligne", en: "Settings synced online" },
    body: {
      fr: "Vos réglages (lieux favoris, seuils personnalisés, prénom…) sont désormais sauvegardés et accessibles depuis n'importe quel appareil via un lien personnel unique, sans création de compte.",
      en: "Your settings (favourite spots, custom thresholds, name…) are now saved and reachable from any device via a unique personal link, no account needed.",
    },
  },
  {
    date: "2026-07-09",
    title: { fr: "Évènements locaux sur la frise", en: "Local events on the timeline" },
    body: {
      fr: "Les grands rendez-vous de La Rochelle (Francofolies, finale de la coupe du monde…) s'affichent directement sur la courbe des marées, avec leurs horaires exacts.",
      en: "Big local happenings (Francofolies, World Cup final…) now show directly on the tide curve, with their exact times.",
    },
  },
  {
    date: "2026-07-09",
    title: { fr: "Version anglaise automatique", en: "Automatic English version" },
    body: {
      fr: "L'app se sert en anglais aux visiteurs dont le navigateur n'est pas configuré en français, avec un choix de langue forçable dans les réglages.",
      en: "The app now serves English automatically to visitors whose browser isn't set to French, with a language toggle in settings to override it.",
    },
  },
  {
    date: "2026-07-09",
    title: { fr: "Heure en direct et indicateur de rafraîchissement", en: "Live clock and refresh indicator" },
    body: {
      fr: "L'heure actuelle s'affiche à côté de la date, avec un petit compte à rebours visuel indiquant la prochaine mise à jour des données.",
      en: "The current time now shows next to the date, with a small visual countdown to the next data refresh.",
    },
  },
  {
    date: "2026-07-07",
    title: { fr: "Mode hors-ligne", en: "Offline mode" },
    body: {
      fr: "Une fois chargée, l'app continue de fonctionner sans réseau (utile à la plage), en affichant la dernière version des données consultée.",
      en: "Once loaded, the app keeps working without network access (handy at the beach), showing the last data it saw.",
    },
  },
  {
    date: "2026-07-07",
    title: { fr: "Phases de lune sur la frise", en: "Moon phases on the timeline" },
    body: {
      fr: "Chaque jour de la courbe affiche la phase de lune correspondante.",
      en: "Each day on the curve now shows its corresponding moon phase.",
    },
  },
  {
    date: "2026-07-07",
    title: { fr: "Créneaux de baignade et heure de départ", en: "Swim windows and time to leave" },
    body: {
      fr: "Chaque plage indique désormais sa durée de baignade, le temps restant, et — si un temps de trajet est renseigné dans les réglages — l'heure à laquelle partir pour en profiter.",
      en: "Each beach now shows its swim window duration, time remaining, and — if a travel time is set in settings — when to leave to catch it.",
    },
  },
  {
    date: "2026-07-06",
    title: { fr: "Réglages personnalisés par plage", en: "Per-beach custom settings" },
    body: {
      fr: "Panneau de réglages pour ajuster le seuil de baignade de chaque plage, marquer des favoris, changer les couleurs, ajouter ses propres lieux, et réordonner le tout par glisser-déposer.",
      en: "A settings panel to adjust each beach's swim threshold, mark favourites, change colours, add your own spots, and reorder everything by drag-and-drop.",
    },
  },
  {
    date: "2026-07-06",
    title: { fr: "Coefficient de marée estimé", en: "Estimated tidal coefficient" },
    body: {
      fr: "Un coefficient de marée (grandes marées, mortes-eaux…) est affiché, estimé à partir de l'amplitude quotidienne faute de donnée officielle gratuite.",
      en: "A tidal coefficient (spring tides, neap tides…) is now shown, estimated from the daily tidal range since no free official figure exists.",
    },
  },
  {
    date: "2026-07-05",
    title: { fr: "Lancement de Marégram", en: "Marégram launches" },
    body: {
      fr: "Premier tableau de bord des marées de La Rochelle : courbe de hauteur d'eau, seuils de baignade pour la Concurrence, les Minimes et Chef de Baie, avec les infos officielles de surveillance, de qualité de l'eau et de dangers pour chaque plage.",
      en: "First tide dashboard for La Rochelle: water height curve, swim thresholds for Concurrence, Minimes and Chef de Baie beaches, with official lifeguard, water-quality and hazard info for each.",
    },
  },
];
