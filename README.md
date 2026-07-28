# Marégram — Marées La Rochelle

[![Site](https://img.shields.io/badge/site-maree--la--rochelle.netlify.app-5ec4ea)](https://maree-la-rochelle.netlify.app)
[![Nouveautés](https://img.shields.io/badge/changelog-nouveautés-informational)](https://maree-la-rochelle.netlify.app/nouveautes/)
[![Licence](https://img.shields.io/badge/licence-CC%20BY--NC--SA%204.0-lightgrey)](LICENSE.md)

Dashboard de marées pour La Rochelle et ses plages : marée en cours, courbe de
hauteur d'eau, **créneaux de baignade par plage** (horaires à partir desquels
il y a assez d'eau pour se baigner, selon un seuil réglable par plage),
évènements locaux sur la frise, réglages personnels synchronisés en ligne, et
une console d'administration.

- **Site** : https://maree-la-rochelle.netlify.app
- **Admin** (protégé par mot de passe) : https://maree-la-rochelle.netlify.app/admin/
- **Nouveautés (changelog public)** : https://maree-la-rochelle.netlify.app/nouveautes/
- **Dépôt GitHub** : `vincent-bidaux/maree-la-rochelle` (public, open source)
- **Nom public de l'app** : Marégram (le dépôt GitHub et l'URL Netlify ont
  gardé leur nom d'origine `maree-la-rochelle`, jamais renommés)
- **Dossier local** : peut s'appeler autre chose que le repo GitHub sur ta
  machine (ex. `~/git/maregram`) — un renommage de dossier local n'a aucun
  impact sur git, GitHub ou Netlify, qui n'en ont pas connaissance.

Projet personnel, code source ouvert sous licence CC BY-NC-SA 4.0 : libre de
cloner/modifier/redistribuer en créditant l'auteur et en gardant la même
licence, mais pas d'usage commercial (voir [LICENSE.md](LICENSE.md)).

## Continuer à développer depuis une autre machine

```bash
git clone https://github.com/vincent-bidaux/maree-la-rochelle.git
cd maree-la-rochelle
npm install                # seulement si tu veux builder/lancer en local
```

C'est tout pour éditer du code et pousser — **Netlify redéploie automatiquement
à chaque push sur `main`**, aucune commande de déploiement à lancer.

Pour un aperçu local complet (fonctions serveur, Blobs, réglages, admin) :

```bash
netlify login               # une fois par machine
netlify link                 # relie ce dossier au site Netlify existant
```

Puis créer un fichier `.env` (jamais commité, voir `.env.example`) avec :

```
API_MAREE_KEY=<clé api-maree.fr, inscription gratuite sur https://api-maree.fr/register>
```

Lancer ensuite `netlify dev` (pas `npm run dev` seul, qui ne fait tourner ni
les fonctions serveur ni Blobs) : ça sert le front en direct (Vite, hot
reload) + proxy les fonctions `netlify/functions/*`.

`npm run build` puis `npm run preview` sert le build de prod (`dist/`) en
statique, mais sans les fonctions serveur non plus.

## Architecture

**Frontend** : site Vite en vanilla JS, 3 pages (entrées Vite séparées dans
`vite.config.js`) :
- `index.html` → `src/main.js` — l'app principale
- `admin/index.html` → `src/admin.js` — console d'administration
- `nouveautes/index.html` → `src/changelog.js` — changelog public

**Backend** : Netlify Functions (dossier `netlify/functions/`) + **Netlify
Blobs** pour le stockage serveur (pas de base de données classique, pas de
compte utilisateur).

```
src/
  main.js          UI de l'app principale (rendu, frise SVG, panneau réglages)
  tide.js           Logique de marée (créneaux de baignade, coefficient estimé)
  settings.js        État réglages : sync serveur par token, mode aperçu admin
  admin.js / admin.css   Console admin (stats, gestion lieux/évènements)
  changelog.js / changelog-data.js   Page /nouveautes/ + APP_VERSION (source
                      de vérité unique, lue aussi par le footer de l'app)
  i18n.js            FR par défaut, EN si navigateur non-fr, forçable en réglages
  style.css          Tout le CSS (dont les thèmes, cf. plus bas)

netlify/functions/
  settings.js        /api/settings — réglages utilisateur par token (Blobs)
  admin.js           /api/admin/*  — auth, stats, gestion lieux/évènements
  beaches.js         /api/beaches  — endpoint PUBLIC des lieux publiés
  events.js          /api/events   — endpoint PUBLIC des évènements publiés
  calendar.js        /calendar.ics — flux iCal abonnable (webcal://)
netlify/shared/
  content.js          Store Blobs "content" (lieux + évènements), partagé
                      entre les fonctions publiques et admin

public/data/la-rochelle-pallice/   Données de marée générées (committées)
public/config/beaches.json         Amorçage initial des lieux (voir plus bas)
public/config/events.json          Amorçage initial des évènements
scripts/fetch_api_maree.py         Pipeline de données actif (api-maree.fr)
scripts/fetch_shom.py              OBSOLÈTE (WAF SHOM), gardé pour référence
```

### Où vivent réellement les données (important)

- **Marées** (`water_levels.json`, `high_low_tides.json`) : fichiers JSON
  statiques, committés dans git, régénérés par le script Python. Toujours la
  source de vérité.
- **Lieux de baignade et évènements** : stockés dans **Netlify Blobs** (store
  `"content"`), gérés depuis la console admin. Les fichiers
  `public/config/beaches.json` et `events.json` ne servent qu'à **amorcer**
  le store Blobs la toute première fois qu'il est lu (s'il n'existe pas
  encore) — **une fois amorcé, éditer ces fichiers JSON n'a plus aucun effet
  en production.** Toute modification de contenu doit passer par `/admin/`.
- **Réglages utilisateur** (favoris, seuils, nom, thème...) : Netlify Blobs
  (store `"settings"`), un enregistrement par token court, pas de compte.

## Console admin

Identifiant/mot de passe : variables d'environnement Netlify
`ADMIN_USER` / `ADMIN_PASSWORD` (**jamais dans le code ni dans git** — les
consulter avec `netlify env:list` une fois lié au site, ou dans le dashboard
Netlify du site). `ADMIN_SECRET` sert à signer le cookie de session (HMAC),
même principe : var d'env Netlify uniquement.

Onglets : Stats (utilisateurs actifs/total, table tokens+noms, favoris
populaires, **aperçu en lecture seule du dashboard d'un utilisateur** via
`/?preview=TOKEN`), Lieux (actifs/brouillons, glisser-déposer entre les deux
listes, édition inline), Évènements (idem + import CSV en brouillon).

⚠️ **Deux vrais tokens utilisateurs existent en prod : `J9U4yxj` (Vincent) et
`uyYSvLw` (Louis). Ne jamais les supprimer** via le bouton de suppression de
token dans l'onglet Stats.

## Rafraîchir les données de marée

Automatique : la GitHub Action `.github/workflows/refresh-tide-data.yml`
relance le fetch lundi et jeudi et pousse le commit ; Netlify redéploie à
chaque push. Secret GitHub requis : `API_MAREE_KEY`.

Manuel si besoin — api-maree.fr ne sert qu'une **fenêtre glissante
J-30 → J+30**. Le script est cumulatif : il fusionne les nouveaux points avec
l'existant sans perdre l'historique. Si on laisse passer plus de ~30 jours
sans le lancer, un trou apparaît dans les données et l'app affiche une
bannière "données expirées".

```bash
python3 scripts/fetch_api_maree.py --site la-rochelle-pallice \
  --from 2026-06-01 --to 2026-09-30
```

Puis committer les JSON régénérés (le push déclenche le redéploiement).

## Thèmes

Sombre (défaut), Clair, Noir & blanc positif, Noir & blanc négatif (pensés
pour un futur écran e-ink mural) sont implémentés dans `style.css` (variables
CSS + filtre `grayscale`/`invert` scopé à `#theme-scope`). **Le sélecteur de
thème est actuellement masqué** dans les réglages via le flag
`SHOW_THEME_PICKER = false` en haut de `main.js` — le code reste prêt, il
suffit de repasser le flag à `true` pour le réafficher.

⚠️ Piège technique à connaître si on retouche ça : le filtre CSS est
appliqué à `#theme-scope` (un wrapper autour du contenu de la page), **jamais
à `<body>` ou `<html>`**. Un filtre CSS crée un nouveau bloc de
positionnement pour ses descendants en `position: fixed` — si on le mettait
plus haut dans l'arbre, le panneau de réglages (`.settings-overlay`, fixed)
se déboîterait du viewport au scroll au lieu de rester plaqué à l'écran.
Vérifié empiriquement (scroll + ouverture du panneau en thème N&B) avant de
valider cette architecture.

## Versioning & changelog public

`src/changelog-data.js` est la source de vérité unique pour `APP_VERSION`
(actuellement **10.2**) et pour le contenu de `/nouveautes/`. **À chaque
nouvelle fonctionnalité visible par les utilisateurs** (pas les outils
admin) :

1. Incrémenter `APP_VERSION` et ajouter une entrée en tête de `CHANGELOG`
   (ordre antéchronologique, bilingue fr/en, avec la date).
2. Poser un tag git annoté `vX.Y` sur le commit correspondant et créer la
   [GitHub Release](https://github.com/vincent-bidaux/maree-la-rochelle/releases)
   associée (`git tag -a vX.Y -m "..."`, `git push origin vX.Y`, puis
   `gh release create vX.Y --notes "..."`) — reprendre le texte de la nouvelle
   entrée du changelog comme notes de version.

Les versions sont donc visibles à trois endroits qui doivent rester
cohérents : le footer du site, `/nouveautes/`, et l'onglet **Releases** de
GitHub.

## Données & limites connues

- **Source marées** : api-maree.fr (gratuit, licence CC-BY — attribution
  affichée en pied de page), calcul harmonique IFREMER/PREVIMER pour le port
  de référence La Rochelle-Pallice. Les 3 plages historiques (Concurrence,
  Minimes, Chef de Baie) sont assez proches du port pour partager la même
  courbe.
- **Précision** : écart constaté vs SHOM officiel d'environ **15 min et
  0,2-0,3 m**. Suffisant pour un usage perso, pas pour de la navigation.
- **Coefficient de marée** : le vrai coefficient SHOM n'est pas disponible
  gratuitement ; l'app affiche une **estimation** dérivée du marnage
  quotidien, calibrée sur les niveaux caractéristiques publiés du port
  (marqué d'un *). Coloré en tons discrets au-delà de 90 (grandes marées),
  au-delà de 100, ou en dessous de 50 (marées faibles).
- **Seuils de baignade** : aucune source officielle ne publie de hauteur
  d'eau minimale par plage. Valeurs empiriques, à ajuster après relevés sur
  place — gérables par plage depuis `/admin/` (valeurs par défaut) ou par
  chaque utilisateur dans ses propres réglages (surcharge personnelle).
- **Évènements locaux** : les 26 matchs du Stade Rochelais (Top 14
  2026-2027) sont en base **en brouillon** (horaires 21h-22h35 par défaut,
  places-holder faute d'horaires officiels connus) — à ajuster puis publier
  un par un depuis `/admin/` → onglet Évènements quand les vrais horaires
  seront connus.

## Pièges déjà rencontrés (pour ne pas les refaire)

- **Netlify Blobs est *eventually consistent* par défaut en production**
  (contrairement au bac à sable `netlify dev`, fortement cohérent) : un GET
  juste après un POST/PUT peut rater l'écriture. Tous les stores Blobs de ce
  projet (`settings`, `content`) sont ouverts avec `consistency: "strong"`
  — ne jamais l'enlever.
- **Ne jamais muter un tableau source pendant qu'une fonction le relit pour
  en dériver un autre.** Bug réel rencontré dans la gestion admin des lieux :
  une fonction réassignait `active` puis calculait `drafts` via une recherche
  qui lisait `active` (déjà réassigné) + l'ancien `drafts` — l'élément qui
  venait de changer de liste devenait introuvable et disparaissait
  silencieusement. Corrigé en construisant une table de correspondance sur
  l'union des deux tableaux *avant* toute réassignation. Se méfier du même
  pattern ailleurs (n'importe quel code qui réassigne des tableaux liés en
  série avec des lookups croisés).
- **Service worker iOS Safari** : sans précaution, un SW peut laisser une
  page blanche indéfinie sur iOS. Le SW de ce projet (`public/sw.js`) a un
  timeout réseau sur les navigations, ne met en cache que les réponses
  `ok`, et bascule sur une page minimale de repli plutôt qu'une erreur brute.
- **Dates d'évènements et fuseaux horaires** : les évènements ajoutés depuis
  `/admin/` (formulaire ou import CSV) sont saisis en heure de Paris et
  convertis en UTC avec prise en compte correcte de l'heure d'été/hiver
  (voir `parisWallToISO`/`isoToParisWall` dans `admin.js`).

## Licence

CC BY-NC-SA 4.0 — voir [LICENSE.md](LICENSE.md). Édité par larochelle-today.

## Phase 2 (prévu, pas commencé)

Plages hors agglomération : île d'Aix, Boyardville, Rivedoux, Châtelaillon,
Sablanceaux, Le Bois-Plage, Fouras. Attention : la plupart dépendent de ports
secondaires SHOM absents d'api-maree.fr (le plus proche disponible :
`ile-de-re-saint-martin` pour les plages de Ré) — il faudra soit accepter le
décalage, soit trouver une autre source.
