# Sources — résultats de la sonde (2026-10-13, depuis n8n `n8n.srv1250642.hstgr.cloud`)

Étiquettes : **vérifié** = observé depuis n8n (workflow `TEST Notes Jeux — sonde`, id `VyS0j6QufSY69IpC`, désactivé).

## Okkazeo — OK avec en-têtes de navigateur complets (vérifié)
- `User-Agent` seul (desktop ou mobile) → **403 "403 Forbidden"** (corps de 14 octets, pas de page Cloudflare).
- Avec `Sec-Fetch-Dest/Mode/Site/User`, `Upgrade-Insecure-Requests`, `sec-ch-ua*`, `Accept-Encoding`, `Referer: https://www.google.com/` → **200**, JSON-LD `Product.offers` présent.
- Quel en-tête fait la différence : non isolé (supposé : `Sec-Fetch-*` / `sec-ch-ua`). Fragile : à surveiller.
- Recherche : `GET https://www.okkazeo.com/jeux/resultats?rech_nom=<nom>` (formulaire `rech_nom`), lien jeu `/jeux/<id>/<slug>`.
- Annonce (HTML) : `<span class="prix">40€<span class="sub">00</span></span>`, `Vendu par <b>…</b>`, `Ville (CP)<br/>`, date `JJ/MM/AAAA`.

## Philibert — OK (vérifié)
- Recherche : `GET https://www.philibertnet.com/fr/recherche?search_query=<nom>` → HTML rendu côté serveur (cartes `a.product-card__title`, langue dans `span.product-card__feature` « Français »/« Anglais », note « x/5 » seulement si avis).
- Page produit : JSON-LD `Product` ; `aggregateRating` présent quand il y a des avis (ex. Clank! Catacombes), **absent pour Clank! VF** (aucun avis) → afficher « pas encore d'avis ».

## Esprit Jeu — OK (vérifié)
- Recherche : `GET https://www.espritjeu.com/dhtml/resultat_recherche.php?keywords=<nom>` (formulaire du site). Lien produit `https://www.espritjeu.com/jeux-de-strategie/<slug>.html`.
- Page produit : JSON-LD `@graph` contenant `Product` avec `aggregateRating` (`ratingValue` 4.9, `ratingCount` 34, `bestRating` 5 pour Clank!).

## BGG — recherche par nom bloquée sans token (vérifié)
- `boardgamegeek.com/xmlapi2/*`, `/boardgame/<id>`, `/search/boardgame` → **403 Cloudflare « Just a moment »**.
- `api.geekdo.com/xmlapi2/*` → **401** (token requis ; atteint sans challenge Cloudflare).
- Endpoints JSON non documentés **sans token** : `api.geekdo.com/api/geekitems?objecttype=thing&objectid=<id>` (nom, année, joueurs, durée, âge, image) et `api.geekdo.com/api/dynamicinfo?objectid=<id>&objecttype=thing` (`stats.average`, `usersrated`, `avgweight`). Clank! (201808) : 7.758, 48 208 votes, poids 2.232.
- Aucune recherche par nom sans token trouvée (`/api/search`, `/api/geeksearch`, `/xmlapi/search` testés).
- **Décision requise** : token BGG (https://boardgamegeek.com/applications) → credential n8n « Header Auth » `Authorization: Bearer <token>`, requêtes vers `https://api.geekdo.com/xmlapi2/...`.

## Fixtures (`tests/fixtures/`)
`philibert-search-clank.html`, `philibert-product-clank.html` (Clank! VF, sans avis), `philibert-product-catacombes.html` (avec avis), `espritjeu-search-clank.html`, `espritjeu-product-clank.html`, `okkazeo-clank.html`, `okkazeo-search-clank.html`. Pseudos vendeurs et IP serveur anonymisés. Fixtures BGG XML : à capturer une fois le token disponible.

## MyLudo — note de la communauté, OK depuis n8n (vérifié le 2026-10-17)
- Application JavaScript (page d'accueil de 1,6 Ko) : pas de HTML à lire. API interne, **jeton CSRF + cookie obligatoires** (sinon `{"success":false,"message":"Illegal action"}`) : `GET https://www.myludo.fr/` → jeton dans `<meta name="csrf-token">` + cookie `MYLUDO_SESSID`, renvoyés en `X-Csrf-Token` et `Cookie`.
- Recherche : `GET /views/search/datas.php?type=search&tab=games&page=1&order=bymagic&words=<nom>` → `list[]` (`id`, `code`, `title`, `type` = `basegame` | `extension` | `goodie`).
- Fiche : `GET /views/game/datas.php?type=game&id=<id>` → `rating.game` : `note` (« 8,3 », sur 10), `audience` (nombre de notes), `average`, `weighted`. Lien public : `https://www.myludo.fr/#!/game/<code>-<id>`.
- Clank! (19410) : 8,3 / 1 500 notes ; 7 Wonders Duel : 8,5 / 4 150 ; Drillers : fiche sans note.
- API non documentée : peut changer sans préavis.
