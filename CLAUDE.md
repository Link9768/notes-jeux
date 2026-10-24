# Notes Jeux

Page web mono-fichier (`index.html`, sans build) : on tape un nom de jeu et on voit les notes Esprit Jeu, Philibert et BGG, plus les annonces d'occasion Okkazeo à ≤ 10 km des Olympiades (Paris 13e). Les données viennent d'un workflow n8n exposé en webhook.

Spec : `../docs/2026-10-13_notes-jeux-dashboard-design.md` · Plan : `../docs/2026-10-13_notes-jeux-plan.md` · Sources vérifiées : `docs/sources.md`.

## Adresses et identifiants

| Élément | Valeur |
|---|---|
| Webhook (GET `?q=<nom>`) | `https://n8n.srv1250642.hstgr.cloud/webhook/notes-jeux` |
| Workflow n8n « Notes Jeux — API » | `wA0aeGJ9Uh0FqKnW` (actif, `webhookId` `7c1e4a52-9d3b-4f6e-8a21-5b0c9e3d7f14`) |
| Webhook matchmaking (GET `?jeux=A|B|C`) | `https://n8n.srv1250642.hstgr.cloud/webhook/notes-jeux-panier` |
| Workflow n8n « Notes Jeux — Panier » | `BpOByDLzTv8MtBky` (actif, `webhookId` `10db9f42-1e86-4a88-ab2b-de28f39f6c84`) |
| Workflow de sonde (jetable, **désactivé**) | `VyS0j6QufSY69IpC` — webhook ouvert qui récupère n'importe quelle URL : ne le laisser actif que le temps d'un test |
| Page publique prévue | `https://link9768.github.io/notes-jeux/` (repo `Link9768/notes-jeux`) |

## Fichiers

- `index.html` — front (thème sombre, responsive, lit `?q=`).
- `lib/*.js` — logique testée : `match.js` (choix du produit), `jsonld.js`, `okkazeo.js` (annonces), `sites.js` (recherches des boutiques), `bgg.js`, `cp-paris-10km.json`.
- `n8n/code/*.body.js` — corps des 4 nodes Code (dont `panier`, workflow à part) ; `scripts/bundle.mjs` colle `lib/` + corps = **le code déployé**.
- `n8n/Notes Jeux API.json` — export du workflow (la source de vérité reste l'instance n8n).
- `scripts/` — `build-cp-list.mjs` (codes postaux), `bundle.mjs`, `verify-deployed.mjs`, `smoke.mjs`.
- `tests/` — `node --test "tests/*.test.js"` (⚠ le glob est obligatoire : `node --test tests/` ne fonctionne pas). `tests/fixtures/` = vraies pages enregistrées le 2026-10-13.

## Modifier un node Code

1. Modifier `lib/` ou `n8n/code/*.body.js`, **test d'abord** (`tests/bundle.test.js` exécute le code exact du node avec n8n simulé).
2. `node scripts/bundle.mjs sources` (ou `bgg-candidats`, `bgg-fiche`, `panier`) → coller le résultat avec `n8n_update_partial_workflow` (`updateNode`, `parameters.jsCode`).
3. `node scripts/verify-deployed.mjs --export` → doit afficher `IDENTIQUE` pour les 4 nodes (lit la clé d'API dans `../.mcp.json`, ne l'affiche pas), puis `node scripts/smoke.mjs "clank" "catane"`.

## Pièges vérifiés

- **Sandbox des nodes Code n8n : pas de `URL` ni `URLSearchParams`** (`typeof URL` = undefined). `Buffer`, `require`, `module` existent.
- **Ne jamais écrire de séquence `\uXXXX` dans le code d'un node** : la couche d'envoi la convertit en caractères invisibles (déployé ≠ testé). Utiliser `String.fromCharCode`.
- **Esprit Jeu sert ses pages en ISO-8859-1** : requête en `arraybuffer` + `Buffer.from(...).toString('latin1')`, sinon les accents deviennent `�`.
- **Okkazeo répond 403 au User-Agent seul** ; il faut les en-têtes d'un vrai navigateur (`Sec-Fetch-*`, `sec-ch-ua*`, `Referer`). Fragile : à surveiller.
- Okkazeo sépare un jeu en plusieurs éditions (même titre, ids différents) : on additionne jusqu'à 3 éditions qui ont des annonces (compteur lu sur la page de recherche) ; avec plusieurs éditions, le bouton ouvre la page de recherche. Une page de recherche sans « Nous avons trouvé » ni « Aucun jeu ne correspond » = « indisponible », jamais « 0 annonce ».
- Okkazeo ne cherche que le titre exact : « catane » n'y trouve rien (le jeu s'y appelle « Catane », « Catan » est une autre fiche) → « 0 annonce » légitime mais trompeur ; non géré.
- Annonces Okkazeo sans ville (pas de code postal) : exclues du filtre Paris. Pas de pagination constatée (Clank 14/14, 7 Wonders Duel 23/23).
- BGG met `value="0"` pour une donnée inconnue (jeu récent) : traité comme absent.
- Choix du produit : titre exact → titre à 1 lettre près (`catane` → `Catan`) → mots présents, jeu de base avant extension, ordre de pertinence du site. Le titre retenu est affiché sous chaque note.
- Jeux très récents (ex. Drillers) : souvent absents des boutiques → « indisponible », normal.
- Philibert : un jeu sans avis (ex. Clank! VF) n'a pas de `aggregateRating` → « pas encore d'avis ».
- Dans un shell Windows, `curl "...?q=château"` envoie du Latin-1 : tester avec `scripts/smoke.mjs`.

## BGG : abandonné

La recherche par nom de BGG exige un token qu'on n'a pas (`api.geekdo.com/xmlapi2` → 401, `boardgamegeek.com` → Cloudflare 403). La page n'affiche plus de tuile BGG ; MyLudo la remplace (voir plus bas). Les nodes BGG du workflow restent en place mais renvoient `null` (`bgg` n'est plus lu par le front).

**Lien direct vers la page BGG** (sans token) : la fiche Okkazeo du jeu contient un lien `boardgamegeek.com/boardgame/<id>/<slug>` (node Sources → `bggUrl`). Repli : l'identifiant BGG de la liste BGA (`lib/bga-games.json`). Sinon, lien de recherche BGG. Okkazeo ne cherche que le titre exact : « catane » n'y trouve rien, donc pas de lien direct.

**Board Game Arena** : la page charge `lib/bga-games.json` (même site GitHub Pages) et fait la correspondance dans le navigateur (`findBga` dans `index.html` : titre exact, puis à une lettre près, alias de 5 lettres et plus ; titres testés = la recherche et le titre MyLudo). pastille « BGA ✓ » cliquable (`gamepanel?game=<slug>`) à côté du nombre de joueurs si le jeu y est, « BGA » avec coche barrée sinon, rien si la liste est injoignable (ouverture en `file://`). La liste vient de la page `boardgamearena.com/gamelist` (`game_list`) : `node scripts/build-bga-list.mjs` la régénère (1 146 jeux publics le 2026-10-24), puis commit + push. Les titres français ne correspondent que si MyLudo donne le titre anglais ou si BGA a l'alias.

## Matchmaking Okkazeo (workflow « Notes Jeux — Panier »)

Case en bas de page : 2 à 8 jeux (un par ligne) → vendeurs Okkazeo qui en proposent au moins 2 (`lib/panier.js`). Par jeu : recherche Okkazeo (titre exact), puis annonces des éditions qui en ont (3 max) ; 3 jeux en parallèle. Une annonce = `<article class="text-left jeu">` : pseudo (« Vendu par <b>…</b> »), prix, lien `/annonces/<id>`, ville (CP), état, pastille `sticker envoi`. Vendeur = pseudo (casse ignorée), annonce la moins chère par jeu ; tri : nombre de jeux, près de Paris (`cp-paris-10km.json`), total. Vérifié le 2026-10-24 : 7 Wonders Duel + Carcassonne chez un vendeur de Paris 16e, réponse en 0,6 s. Pseudos anonymisés dans les fixtures : les tests les remplacent par des noms choisis.

## Page : cache et bouton retour

Les résultats déjà chargés sont gardés 15 min en mémoire de la page (clé : recherche en minuscules) : re-cliquer sur un jeu déjà vu ne rappelle pas le webhook. 🔍 sur un jeu (semblables, même auteur) empile l'écran courant ; « ← Retour à … » le réaffiche sans réseau.

## Sécurité

Les webhooks sont publics. La recherche déclenche environ 8 requêtes vers des sites tiers par appel (2 par boutique + 2 BGG) : acceptable pour un usage perso. Si besoin, ajouter une clé simple dans l'URL et la vérifier dans un node du workflow.

## MyLudo (grand encart : note, infos, style de jeu, semblables)

API interne non officielle, 3 requêtes de base (accueil → jeton CSRF + cookie, recherche, fiche) ; détail dans `docs/sources.md`. Jeu de base préféré aux extensions. Si l'API change, l'encart passe en « indisponible » sans casser le reste.

- **Note** : `rating.game.note` (sur 10). **Infos** : `players`, `age`, `time_min/max`, `rating.complexity.note` (sur 5).
- **Style de jeu** : `game/datas.php?type=info` → `themes.mecanisme` (+ `themes.theme`). On affiche les 5 mécaniques les plus **rares** (comptage `count` du tag, jeux de base seulement), pas les plus courantes.
- **Semblable à** : pour chaque mécanique, `theme/datas.php?type=games&id=<tag>&order=byrankdesc&filter=basegame&limit=100` (les 100 mieux classés). Score = nombre de mécaniques partagées, pondéré par `1/√count` (une mécanique rare pèse plus). Exclus : le jeu, sa gamme (titre commençant par le sien), doublons d'éditions, non-jeux de base. Il faut ≥ 2 mécaniques en commun. 3 jeux, avec leur note (1 requête fiche chacun).
- **Du même auteur** : premier `people` au rôle « Auteur » de `type=info`, puis `people/datas.php?type=games&id=<id>&filter=basegame&limit=100&order=bytitle&page=1..3`. Cette liste n'est triable que par titre/date : pas de tri par notoriété. On classe par **nombre d'éditions** du titre (jeux les plus réédités), puis ceux déjà dans le top 100 d'une mécanique du jeu ; 7 jeux max, sans le jeu ni sa gamme, sans note. Ne **pas** lire les fiches des jeux de l'auteur : ~1 s chacune côté MyLudo, non parallélisable (40 fiches = 14 s mesurés). Heuristique : bonne pour Bauza (Hanabi, Tokaido, Takenoko), moyenne pour un auteur très prolifique (Cathala).
- Coût : ~14 requêtes MyLudo par recherche (≤ 10 mécaniques) + 1 à 3 pages de l'auteur. Une fiche MyLudo non mise en cache coûte ~1 s : les 3 notes des semblables font l'essentiel du temps (3–4 s au total). Mécaniques/semblables en panne → `null` (« indisponible »), la note reste.
- Mécaniques en **français** (MyLudo) : pas les libellés BGG (« Push Your Luck »).
- Limites vues en production : les « semblables » restent approximatifs (Abyss → Râ pertinent, les deux autres moins) ; MyLudo liste des jeux datés dans le futur (2027) ; `rating.game` peut être vide pour un jeu récent (Drillers).
- Fixtures : `tests/fixtures/myludo-info-*.json` et `myludo-tags-clank.json` (listes allégées à id/code/title/edition/type).
