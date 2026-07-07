# Marées La Rochelle

Dashboard de marées pour La Rochelle et ses plages : marée en cours, courbe de
hauteur d'eau, et surtout **créneaux de baignade par plage** (horaires à partir
desquels il y a assez d'eau pour se baigner, selon un seuil réglable par plage).

**Prod :** https://maree-la-rochelle.netlify.app

## Architecture

Site 100% statique (Vite, vanilla JS) : les données de marée sont des JSON
générés hors-ligne par un script Python et servis tels quels. Pas de backend.

```
public/data/la-rochelle-pallice/   Données générées (committées dans git)
  water_levels.json                Courbe de hauteur d'eau, pas de 10 min
  high_low_tides.json              Pleines/basses mers détectées par pics locaux
  meta.json                        Période couverte, source, attribution
public/config/beaches.json         Plages : seuils de baignade, surveillance,
                                   qualité d'eau (ARS), dangers, règles SUP
scripts/fetch_api_maree.py         Pipeline de données actif (api-maree.fr)
scripts/fetch_shom.py              OBSOLÈTE (WAF SHOM), gardé pour référence
src/                               App : main.js (UI), tide.js (logique marée),
                                   settings.js (réglages localStorage)
```

## Rafraîchir les données (à faire ~toutes les 2-3 semaines)

api-maree.fr ne sert qu'une **fenêtre glissante J-30 → J+30**. Le script est
cumulatif : il fusionne les nouveaux points avec l'existant sans perdre
l'historique. Si on laisse passer plus de ~30 jours sans le lancer, un trou
apparaît dans les données et l'app affiche une bannière "données expirées".

```bash
# La clé est lue depuis .env (voir .env.example ; inscription gratuite
# sur https://api-maree.fr/register)
python3 scripts/fetch_api_maree.py --site la-rochelle-pallice \
  --from 2026-06-01 --to 2026-09-30
```

Puis committer les JSON régénérés et redéployer.

## Développement & déploiement

```bash
npm install
npm run dev        # dev local
npm run build      # build dans dist/
netlify deploy --prod --dir=dist   # déploiement (site déjà lié via .netlify/)
```

## Données & limites connues

- **Source** : api-maree.fr (gratuit, licence CC-BY — attribution affichée en
  pied de page), calcul harmonique IFREMER/PREVIMER pour le port de référence
  La Rochelle-Pallice. Les 3 plages (Concurrence, Minimes, Chef de Baie) sont
  assez proches du port pour partager la même courbe.
- **Précision** : écart constaté vs SHOM officiel d'environ **15 min et
  0,2-0,3 m**. Suffisant pour un usage perso, pas pour de la navigation.
- **Coefficient de marée** : le vrai coefficient SHOM n'est pas disponible
  gratuitement ; l'app affiche une **estimation** dérivée de l'amplitude
  quotidienne, calibrée sur le min/max des données chargées (marquée d'un *).
- **Seuils de baignade** : aucune source officielle ne publie de hauteur d'eau
  minimale par plage. Valeurs actuelles empiriques (défaut 3 m), à ajuster
  après relevés sur place — modifiables dans l'app (panneau réglages,
  persistées en localStorage) ou en dur dans `public/config/beaches.json`.

## Phase 2 (prévu)

Plages hors agglomération : île d'Aix, Boyardville, Rivedoux, Châtelaillon,
Sablanceaux, Le Bois-Plage, Fouras. Attention : la plupart dépendent de ports
secondaires SHOM absents d'api-maree.fr (le plus proche disponible :
`ile-de-re-saint-martin` pour les plages de Ré) — il faudra soit accepter le
décalage, soit trouver une autre source.
