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
| Webhook outils (GET `?op=ext\|meca\|jumeaux&id=<id BGG>`, `op=suggest&q=`, `op=ean&code=`) | `https://n8n.srv1250642.hstgr.cloud/webhook/notes-jeux-outils` |
| Workflow n8n « Notes Jeux — Outils » | `tETUBgC3dAyYKHMn` (actif, `webhookId` `4ff48a3f-14f0-4866-8a30-5045489b4daa`) |
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

- **`this.helpers.httpRequest` décode le JSON tout seul** (selon le content-type) même avec `json: false` : `String(body)` donne `"[object Object]"`. Toujours `typeof r.body === 'string' ? JSON.parse(r.body) : r.body` (MyLudo, recommandations BGG).
- **Sandbox des nodes Code n8n : pas de `URL` ni `URLSearchParams`** (`typeof URL` = undefined). `Buffer`, `require`, `module` existent.
- **Ne jamais écrire de séquence `\uXXXX` dans le code d'un node** : la couche d'envoi la convertit en caractères invisibles (déployé ≠ testé). Utiliser `String.fromCharCode`.
- **Esprit Jeu sert ses pages en ISO-8859-1** : requête en `arraybuffer` + `Buffer.from(...).toString('latin1')`, sinon les accents deviennent `�`.
- **Okkazeo répond 403 au User-Agent seul** ; il faut les en-têtes d'un vrai navigateur (`Sec-Fetch-*`, `sec-ch-ua*`, `Referer`). Fragile : à surveiller.
- Okkazeo sépare un jeu en plusieurs éditions (même titre, ids différents) : on additionne jusqu'à 3 éditions qui ont des annonces (compteur lu sur la page de recherche) ; avec plusieurs éditions, le bouton ouvre la page de recherche. Une page de recherche sans « Nous avons trouvé » ni « Aucun jeu ne correspond » = « indisponible », jamais « 0 annonce ».
- Okkazeo ne cherche que le titre exact : « catane » n'y trouve rien (le jeu s'y appelle « Catane », « Catan » est une autre fiche) → « 0 annonce » légitime mais trompeur ; non géré.
- Fautes et pluriels : le choix du produit ignore les pluriels mot par mot et tolère 2 lettres d'écart si la recherche fait 8 caractères ou plus. Okkazeo ne renvoie pas « Mot Malin » pour « mots malins » : sans résultat, on relance la recherche au singulier (`variantesRecherche`). Matchmaking : 50 jeux max.
- Annonces Okkazeo sans ville (pas de code postal) : exclues du filtre Paris. Pas de pagination constatée (Clank 14/14, 7 Wonders Duel 23/23).
- BGG met `value="0"` pour une donnée inconnue (jeu récent) : traité comme absent.
- Choix du produit : titre exact → titre à 1 lettre près (`catane` → `Catan`) → mots présents, jeu de base avant extension, ordre de pertinence du site. Le titre retenu est affiché sous chaque note.
- Jeux très récents (ex. Drillers) : souvent absents des boutiques → « indisponible », normal.
- Philibert : un jeu sans avis (ex. Clank! VF) n'a pas de `aggregateRating` → « pas encore d'avis ».
- Dans un shell Windows, `curl "...?q=château"` envoie du Latin-1 : tester avec `scripts/smoke.mjs`.

## BGG (token d'application)

BGG exige un token (`api.geekdo.com/xmlapi2` → 401 sans lui). Il est dans le credential n8n **Header Auth** « BGG api token » (id `hKNciaFSDVbw4COS`, `Authorization: Bearer <token>`), saisi dans l'interface n8n uniquement (jamais dans un node, un fichier ou le chat). Les nodes `BGG Search` et `BGG Thing` l'utilisent (Authentication = Generic → Header Auth). **Grand encart BGG** (depuis le 2026-10-31, MyLudo est passé en petite tuile) : note /10, votes, durée, joueurs, poids, style de jeu ; `bgg.url` = lien direct vers la page du jeu (priorité sur Okkazeo), en pied d'encart.

**Style de jeu en français** : les `<link type="boardgamemechanic|boardgamecategory">` de BGG Thing, traduits par la table fixe `lib/bgg-fr.js` (listes fermées de BGG, ~190 mécaniques + ~85 catégories). Toutes les mécaniques (10 max), complétées par au moins 3 catégories pour atteindre 7 libellés. Correspondance insensible aux espaces et à la ponctuation (BGG écrit « Spies / Secret Agents »). Un libellé inconnu (nouvelle mécanique BGG) reste en anglais : l'ajouter à la table. `bgg-fr.js` est dans les 3 bundles qui contiennent `bgg.js` : le sandbox n8n a un `module`, donc le `require('./bgg-fr.js')` de secours planterait sinon. Fixture réelle : `tests/fixtures/bgg-thing-abyss.xml`.

**Piège (vécu le 2026-10-31)** : un credential référencé par son **nom seul** n'est pas résolu par n8n, qui lui substitue silencieusement un autre credential du même type (ici « GPT » : sa clé est partie vers BGG). Toujours référencer `{ id, name }` et relire le node par l'API juste après l'update, avant tout test. La recherche BGG renvoie ~120 résultats dans le désordre : `bggCandidates` classe nom exact, puis nom de base (avant « : »), puis titres courts (sinon *Clank!* était noyé derrière *Clank! In! Space!*). Fixture réelle : `tests/fixtures/bgg-search-clank.xml`.

**Lien direct vers la page BGG** (cas sans fiche BGG) : la fiche Okkazeo du jeu contient un lien `boardgamegeek.com/boardgame/<id>/<slug>` (node Sources → `bggUrl`). Repli : la fiche Okkazeo (`bggUrl`), puis l'identifiant BGG de la liste BGA (`lib/bga-games.json`). Sinon, lien de recherche BGG. Okkazeo ne cherche que le titre exact : « catane » n'y trouve rien, donc pas de lien direct.

**Board Game Arena** : la page charge `lib/bga-games.json` (même site GitHub Pages) et fait la correspondance dans le navigateur (`findBga` dans `index.html` : titre exact, puis à une lettre près, alias de 5 lettres et plus ; titres testés = la recherche et le titre MyLudo). pastille « BGA ✓ » cliquable (`gamepanel?game=<slug>`) à côté du nombre de joueurs si le jeu y est, « BGA » avec coche barrée sinon, rien si la liste est injoignable (ouverture en `file://`). La liste vient de la page `boardgamearena.com/gamelist` (`game_list`) : `node scripts/build-bga-list.mjs` la régénère (1 146 jeux publics le 2026-10-24), puis commit + push. Les titres français ne correspondent que si MyLudo donne le titre anglais ou si BGA a l'alias.

## Matchmaking Okkazeo (workflow « Notes Jeux — Panier »)

Case en bas de page : 2 à 50 jeux (un par ligne) → vendeurs Okkazeo qui en proposent au moins 2 (`lib/panier.js`). Par jeu : recherche Okkazeo (titre exact), puis annonces des éditions qui en ont (3 max). **Deux vitesses (2026-11-06)** : ≤ 15 jeux = rythme normal (3 jeux à la fois, sans pause) ; au-delà, garde-fous anti-bannissement : 2 jeux à la fois, ≥ 0,4 s entre deux requêtes Okkazeo, mémoire d'1 h par jeu dans `$getWorkflowStaticData('global').panier` (persistée seulement en exécution de production). Mesuré : 4 jeux nouveaux 5 s (~1,2 s/jeu), liste déjà cherchée 0,1 s ; 50 jeux nouveaux ≈ 1 min. La page affiche un compteur pendant l'attente. Une annonce = `<article class="text-left jeu">` : pseudo (« Vendu par <b>…</b> »), prix, lien `/annonces/<id>`, ville (CP), état, pastille `sticker envoi`. Vendeur = pseudo (casse ignorée), annonce la moins chère par jeu ; tri : nombre de jeux, près de Paris (`cp-paris-10km.json`), total. Vérifié le 2026-10-24 : 7 Wonders Duel + Carcassonne chez un vendeur de Paris 16e, réponse en 0,6 s. Pseudos anonymisés dans les fixtures : les tests les remplacent par des noms choisis.

## Page : cache et bouton retour

Les résultats déjà chargés sont gardés 15 min en mémoire de la page (clé : recherche en minuscules) : re-cliquer sur un jeu déjà vu ne rappelle pas le webhook. 🔍 sur un jeu (semblables, même auteur) empile l'écran courant ; « ← Retour à … » le réaffiche sans réseau.

Plusieurs jeux dans la barre (« Abyss, Clank, Azul », virgule ou point-virgule, 20 max ; une liste collée, un jeu par ligne, est convertie en virgules) : un onglet par jeu, chargés 6 à la fois (`charger` : un même jeu n'est demandé qu'une fois), puis navigation sans réseau. Étiquette = titre MyLudo une fois chargé, « … » pendant le chargement, « ⚠ » en cas d'échec (un clic relance).

## v2 (2026-10-31) — spec : `../docs/2026-10-31_notes-jeux-v2-design.md`

- **Encart BGG** : rang général + rang de la meilleure famille (`🏆 #452 · #341 stratégie`), `idéal à` (sondage `bestwith`), pastille « Extensions ✓ » (si `bgg.extensions > 0`) qui déplie la liste notée, mécaniques cliquables (`{id, nom}`) → top 20 BGG de la mécanique.
- **Prix neuf** : `priceOf` (JSON-LD `offers.price`) dans les tuiles Esprit Jeu / Philibert ; chaque annonce Okkazeo affiche l'écart au neuf le moins cher (`−45 %`, vert ≤ −30 %, orange ≤ −10 %).
- **Workflow Outils** (au clic, `lib/outils.js`, `n8n/code/outils.body.js`) : points d'accès internes BGG **sans token** `api.geekdo.com/api/geekitem/linkeditems` (liste d'une mécanique/famille/catégorie triée par rang, avec `config.numitems` = taille de l'étiquette) et `api.geekdo.com/api/geekitems` (fiche avec `links`). Pas de CORS → toujours via n8n. `boardgamegeek.com/search/...` répond 403 (d'où la saisie semi-automatique via MyLudo, ~2 s).
- **Jumeaux** : score sur données réelles, pas d'IA. Rareté d'une étiquette = log(150 000 / nb de jeux), mécaniques et familles « Mechanism: » ×1, familles « Theme: » et catégories ×0,5 ; présélection des 15 jeux qui partagent le plus de rareté (top 50 par rang de chaque étiquette), puis fiche de chacun, pénalités poids/durée/joueurs, bonus de notoriété ; seuil 0,2, 4 jeux max (2 avant le 2026-11-11). Validé : Skull King → Skull Queen + Wizard (absent des recos BGG), 7 Wonders Duel → Duel for Middle-earth, Azul → Sagrada + Calico. ~25 requêtes geekdo, 6 en parallèle, ~1,3 s. `scripts/outils-live.mjs <op> <id> [--save fixture]` exécute le node en vrai.
- **Code-barres** : 📷 → `capture` → `BarcodeDetector` (Android) sinon ZXing (`@zxing/library@0.21.3`, chargé à la demande) → `op=ean` (recherche Philibert par EAN, sinon Esprit Jeu).
- **Onglets** : un 🔍 ouvre le jeu ET l'ajoute en onglet (le jeu d'origine aussi) ; ✕ par onglet ; 15 max ; onglet « ⚖ Comparer » dès 2 jeux chargés ; bouton `🛒 N jeux → matchmaking` sous la recherche (titres MyLudo). « ← Retour à » conservé.
- Piège vu en écrivant le node : dans une `async function` déclarée, `this` n'est pas le contexte n8n → `this.helpers` plante. Passer par une fonction fléchée définie au niveau du node (`req`, `reqLatin1`).

## Listes et liens (2026-10-31)

- **Mes listes** : « À essayer », « À acheter », « À tester sur BGA » (fixes) + listes créées. `localStorage` clé `notesJeux.listes` = **propres à l'appareil/navigateur** (pas de synchro). « ＋ Liste » sous le titre du jeu (pastilles = ajout/retrait, titre stocké = titre MyLudo), « + » à côté de « BGA ✓ » → « À tester sur BGA ». Écran `📋 Mes listes` (bouton sous la recherche) : jeux cliquables (= 🔍), ✕, 🛒 → matchmaking, suppression des listes créées.
- **Extensions** : le titre d'une extension ouvre sa page de jeu dans l'appli (recherche par titre BGG anglais, vérifié : « Abyss: Kraken » trouvé par BGG, MyLudo, Philibert, Esprit Jeu).
- **Liens externes dans le même onglet** (plus de `target="_blank"`, qui déclenchait « pop-up bloqué » sur mobile), **sauf les vidéos YouTube** (nouvel onglet, voulu).

## Duo et Jumeaux préchargés (2026-11-07)

- **Pastille « Duo »** à côté de BGA (`duoBadge`), « Duo ! » si le duo s'intègre au jeu de base ; clic = page du duo dans l'appli. Node Sources → `duo: {titre, url, integrable}` (`duoBgg` + `pickDuo` dans `lib/bgg.js`) : fiche `api.geekdo.com/api/geekitems` du jeu (sans token), candidats = liens `boardgameintegration` + `reimplementation` (6 max), duo = famille **« Versions & Editions: Two-Player Versions of More-Player Games »** (le nombre de joueurs ne suffit pas : Wingspan Asia est noté 1-7), intégrable = dans `boardgameintegration`. Vérifié : Res Arcana → Res Arcana Duo !, Wingspan → Wingspan Asia !, Abyss/Clank → rien. Panne → `duo: null` sans erreur. ~0,3 s en parallèle de MyLudo : temps de recherche inchangé (2,0–2,7 s mesurés). Fixture : `tests/fixtures/bgg-geekitems-duo.json`.
- **Jumeaux préchargés** : `render` lance `outil({op:'jumeaux'})` en arrière-plan (jeu affiché seulement, pas les onglets en fond) ; le clic sur 🎯 déplie sans attente. Coût : ~25 requêtes geekdo par jeu affiché.
- **Vidéos des règles** (encart `#videos` sous l'encart Okkazeo, rien si aucune) : Outils `op=videos&q=<titre MyLudo>&q2=<titre BGG>`, au rendu en arrière-plan. Recherche dans la chaîne `youtube.com/@<chaîne>/search?query=` sans clé d'API, cookie `SOCS=CAI` obligatoire (sinon 302 vers consent.youtube.com), vidéos = `videoRenderer` du JSON `ytInitialData` (`parseYtVideos`). **Ludochrono** = chaîne **@LudovoxFr**, titres « Ludochrono - <jeu> » (`pickLudochrono`, titre exact : « Res Arcana Duo » ≠ Res Arcana). **Le Chalet** = chaîne **@UnMondedejeux** (Un Monde de jeux, seule chaîne trouvée pour « chalet des jeux »), titres « <jeu>, on explique et on joue » (`pickChalet`) : format récent, peu de jeux. Vérifié depuis le VPS : Res Arcana, Wingspan, Azul, Clank → Ludochrono ; Zénith → les deux ; 0,7–1,3 s. Fixtures : `tests/fixtures/yt-*.html` (allégées).
- **Déploiement d'un gros node** (Sources ≈ 45 Ko) : recopier le bundle dans l'outil MCP est risqué ; un script GET workflow → remplace `jsCode` du seul node → PUT (même effet qu'une mise à jour partielle, credentials conservés), puis `verify-deployed.mjs`. Changer `lib/bgg.js` impose de redéployer les 4 nodes qui l'embarquent (BGG Candidats, BGG Fiche, Sources, Outils).

## Matchmaking Leboncoin (favori, 2026-11-11)

**Pourquoi un favori** : DataDome bloque le VPS n8n (vérifié) ; le navigateur de l'utilisateur (IP résidentielle, cookies) passe. Le favori `lbc.js` s'exécute donc sur leboncoin.fr et fait ses `fetch` same-origin.

- **Parcours** : bouton « Leboncoin » (à côté de « Chercher les vendeurs ») → `leboncoin.fr/recherche?category=41#nj=<jeux séparés par |>` dans un nouvel onglet → l'utilisateur lance le favori « Matchmaking LBC » (code dans le `<details>` sous la case) → panneau en haut à droite (Shadow DOM, ✕ pour le masquer ; relancer le favori le réaffiche).
- **Recherche** : `GET /recherche?category=41&text=<jeu>&locations=Paris__48.82659_2.36366_10000_10000` (`&page=2` si `total > 35`, 35 annonces/page). Données = `<script id="__NEXT_DATA__">` → `props.pageProps.searchData` `{ total, max_pages, ads }` ; champs lus : `subject`, `price[0]`, `url`, `location.city/zipcode`, `owner.name/user_id`, `attributes` (`shippable`).
- **Vendeur** = `owner.user_id` (`cle` dans `matchVendeurs`, lib/panier.js ; deux vendeurs peuvent avoir le même pseudo). Sans `cle` (Okkazeo) : pseudo, comme avant → le node n8n « Panier » embarque ce changement (redéployé).
- **Filtre** (`annonceCorrespond`) : tous les mots du jeu en mots entiers (pluriel et accents ignorés) ; lots/listes (`lot`, `220 jeux`, `liste`) et jeux vidéo (`PS4`, `Switch`… + `ratchet`) écartés. Bruit réel vu : « Ratchet & Clank Rift Apart » (sans mention de console), « ❗️220 Jeux Sociétés Liste de A à L ». **Depuis le 2026-11-12** : en dehors du nom du jeu, le titre ne doit contenir que des mots génériques (`LBC_GENERIQUES` : jeu, de société, neuf, VF, TBE, éditeurs…) → « Splendor Marvel », « Azul Duel », « Patchwork Express », « Mon premier Carcassonne », « Clank Legacy », « extension la tour » écartés ; exception jeu de base + extensions (« base », « + extension », « avec extensions »). Test réel du 2026-11-11 (avant ce filtre) dans Chrome : CSP OK, hash `#nj=` conservé, 10 jeux en 30 s sans captcha.
- **Garde-fous** : requêtes séquentielles, pause aléatoire 1–1,5 s, cache 1 h par jeu (`sessionStorage` `nj-lbc:j:<jeu>`), liste gardée en `nj-lbc:liste`. Captcha (403, redirection ou page sans `__NEXT_DATA__`) → arrêt immédiat, résultats partiels affichés ; recharger la page, résoudre le captcha, relancer le favori (le cache évite de refaire les jeux faits).
- **Fichiers** : `lbc.js` (racine, navigateur), `lib/leboncoin.js` (logique testée), `tests/leboncoin.test.js`. Fixtures `tests/fixtures/lbc-search-{azul,clank}.html` allégées, pseudos et `user_id` anonymisés (non versionnées comme les autres `*.html`).
- **À vérifier en vrai navigateur** : CSP de leboncoin.fr (seul `frame-ancestors` relevé : l'injection d'un script externe devrait passer), hash `#nj=` conservé après l'arrivée sur la page, favori sur Android (Chrome, saisie du nom dans la barre d'adresse).

## Leboncoin : toute la France et lots (2026-11-12)

- Recherche **sans zone** (toute la France), 3 pages max par jeu (105 annonces les plus récentes) ; badge « près de Paris » via `cp-paris-10km.json`. Cache sessionStorage préfixe `nj-lbc2:` (1 h).
- **Lots** : la description n'est **pas** dans les résultats de recherche (`body` vide, vérifié), mais Leboncoin y cherche quand même. Candidat = annonce de la recherche dont le titre ne nomme pas le jeu (`lotsCandidats`). Un candidat remonté pour ≥ 2 jeux de la liste est lu sur sa page `/ad/…` (`parseAnnonceBody` : `props.pageProps.ad.body`, vérifié : 1 446 car. pour un lot de ~40 jeux) ; `jeuxDansTexte` (nom entier, mots consécutifs) confirme les jeux ; 20 lots lus max ; encart « Lots qui contiennent plusieurs de tes jeux ». Fixture : `tests/fixtures/lbc-annonce-lot.html`.
- **Filtre « Jeux de société »** : `&toy_type=jeuxdesociete` (attribut `toy_type` des annonces de la catégorie 41, qui mélange jouets, scooters, Nerf, Lego). Vérifié : « scout » = 15 854 résultats (scooters) sans le filtre, 102 avec, dont les vrais Scout.
- **Règle unique titres + lots** (`resteEstJeu`, 2026-11-12) : hors mots génériques et prix, ce qui reste EST le jeu (mêmes mots, ou une lettre d'écart dans un mot dès 5 lettres, **jamais sur les espaces**). Lots : description découpée en éléments (lignes, tirets, virgules, parenthèses, « + », « et ») → « - Munchkin Apocalypse 15€ » ne compte pas pour Apocalypse, « Tireless Pilgrim » pas pour Pilgrim (cas réels). Coût : « 7 wonders duel agora 15€ » non compté.
- **Recherche principale** (`pickProduct`, `lib/match.js`) : tolérance d'une/deux lettres seulement à nombre de mots égal (« el dorado » ne prend plus « Eldorado », autre jeu). **BGG** (`bggCandidates`) : un nom principal exact écarte les jeux qui n'ont ce nom qu'en alternatif (avant : Eldorado, alias El Dorado, le plus voté). `match.js` est dans les 5 nodes : les 5 redéployés.
- **Okkazeo** : le matchmaking (workflow Panier) est déjà **toute la France** (vendeurs près de Paris classés d'abord) ; seul l'encart Okkazeo de la fiche d'un jeu liste les annonces ≤ 10 km (avec le total France).

## Sécurité

Les webhooks sont publics. La recherche déclenche environ 8 requêtes vers des sites tiers par appel (2 par boutique + 2 BGG) : acceptable pour un usage perso. Si besoin, ajouter une clé simple dans l'URL et la vérifier dans un node du workflow.

## MyLudo (tuile minimaliste comme Philibert et Esprit Jeu : note, nombre de notes, titre ; même auteur)

Depuis le 2026-10-31, la page n'affiche plus les mécaniques MyLudo (le style de jeu vient de BGG) ; le node les calcule encore, elles servent à classer les jeux du même auteur.

API interne non officielle, 3 requêtes de base (accueil → jeton CSRF + cookie, recherche, fiche) ; détail dans `docs/sources.md`. Jeu de base préféré aux extensions. Si l'API change, l'encart passe en « indisponible » sans casser le reste.

- **Note** : `rating.game.note` (sur 10). **Infos** : `players`, `age`, `time_min/max`, `rating.complexity.note` (sur 5).
- **Style de jeu** : `game/datas.php?type=info` → `themes.mecanisme` (+ `themes.theme`). On affiche les 5 mécaniques les plus **rares** (comptage `count` du tag, jeux de base seulement), pas les plus courantes.
- **Semblable à** : ce ne sont plus des jeux MyLudo. Depuis le 2026-10-31, ce sont les **recommandations des joueurs BGG** (`api.geekdo.com/api/geekitem/recs?objectid=<id BGG>&objecttype=thing`, sans token, point d'accès interne non officiel) pour le jeu retenu par les nodes BGG : `pickBggRecs` (`lib/bgg.js`) en garde 5, sans le jeu ni sa gamme ni doublon de nom de base, avec note, votes et rang BGG (aucune fiche à lire). Encart « Les joueurs aiment aussi · recommandations BGG » (ex-« Semblable à » : ce sont les jeux que les mêmes joueurs ont bien notés, pas des jeux aux règles proches) au-dessus de « Du même auteur ». L'ancien calcul MyLudo (mécaniques partagées) était moins pertinent : supprimé. Les titres sont en anglais. Panne → `similaires: null` + erreur `bgg-recs`, le reste est servi.
- **Du même auteur** : premier `people` au rôle « Auteur » de `type=info`, puis `people/datas.php?type=games&id=<id>&filter=basegame&limit=100&order=bytitle&page=1..3`. Cette liste n'est triable que par titre/date : pas de tri par notoriété. On classe par **nombre d'éditions** du titre (jeux les plus réédités), puis ceux déjà dans le top 100 d'une mécanique du jeu ; 7 jeux max, sans le jeu ni sa gamme, sans note. Ne **pas** lire les fiches des jeux de l'auteur : ~1 s chacune côté MyLudo, non parallélisable (40 fiches = 14 s mesurés). Heuristique : bonne pour Bauza (Hanabi, Tokaido, Takenoko), moyenne pour un auteur très prolifique (Cathala).
- Coût : ~14 requêtes MyLudo par recherche (≤ 10 mécaniques, encore utilisées pour le style de jeu et pour classer les jeux de l'auteur) + 1 à 3 pages de l'auteur ; plus de fiche MyLudo lue en dehors de celle du jeu (≈ 1 s chacune). Recherche complète : 2 à 3 s. Mécaniques en panne → `null` (« indisponible »), la note reste.
- Mécaniques en **français** (MyLudo) : pas les libellés BGG (« Push Your Luck »).
- Limites vues en production : MyLudo liste des jeux datés dans le futur (2027) ; `rating.game` peut être vide pour un jeu récent (Drillers). Recommandations BGG d'un jeu très récent (Drillers) : jeux obscurs, peu de joueurs en ont écrit.
- Fixtures : `tests/fixtures/myludo-info-*.json` et `myludo-tags-clank.json` (listes allégées à id/code/title/edition/type).

## Rejouabilité et difficulté MyLudo (2026-11-11)

- **Aucun site ne note la rejouabilité** par jeu (BGG, MyLudo, boutiques, sites FR : recherché). Indicateur maison = **parties enregistrées sur BGG par propriétaire** (`api.geekdo.com/api/dynamicinfo?objectid=<id>&objecttype=thing` → `item.stats.numplays / numowned`, sans token), dans `pickRejouabilite` (`lib/bgg.js`), node Sources (`ficheBgg`, même fiche geekitems que le Duo, en parallèle de MyLudo). Seuils calibrés sur 32 jeux : ≥ 4,5 forte (Azul 4,9, The Crew 6,9), ≥ 3 bonne (7 Wonders Duel 3,6, Clank 3,0), ≥ 2 moyenne (Moustache 2,1), sinon faible (Detective 1,0). Famille « Escape Room Games » → usage unique (Exit 0,6) ; mécanique « Legacy Game » → « campagne à jouer une fois ». Biais connus : jeu d'avant 2008 sous-noté (Catan 1,8, affiché « jeu ancien ») ; < 1 000 propriétaires → « peu de données ». Affiché `🔁` dans les infos de l'encart BGG.
- **Difficulté MyLudo** : `myludo.complexite` (`rating.complexity.note`, sur 5) affichée `⚖ x/5` dans la tuile MyLudo ; 0 = inconnue → null (vu sur Exit). `myludo.js` est aussi dans le node Outils : le redéployer avec Sources.
- MyLudo était en panne (503, timeouts) le 2026-11-11 : tuile « indisponible », le reste servi.
