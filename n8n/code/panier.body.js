// Matchmaking Okkazeo : GET ?jeux=Clank|Abyss|… → vendeurs qui proposent au moins 2 de ces jeux (voir lib/panier.js).
const noms = parseListeJeux($('Webhook').first().json.query.jeux);
if (noms.length < 2) return [{ json: { jeux: noms.map(demande => ({ demande, titre: null, url: null, annonces: 0 })), vendeurs: [], erreurs: ['au moins 2 jeux'] } }];

// Okkazeo refuse (403) le User-Agent seul : il faut les en-têtes d'un vrai navigateur (mêmes en-têtes que le node Sources).
const BROWSER = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9',
  'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Site': 'none', 'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  'sec-ch-ua': '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
  'sec-ch-ua-mobile': '?0', 'sec-ch-ua-platform': '"Windows"',
  'Accept-Encoding': 'gzip, deflate, br', 'Referer': 'https://www.google.com/',
};
const get = async url => {
  const r = await this.helpers.httpRequest({ url, headers: BROWSER, json: false, timeout: 10000, returnFullResponse: true, ignoreHttpStatusErrors: true });
  if (r.statusCode >= 400) throw new Error(`HTTP ${r.statusCode} ${url}`);
  return String(r.body ?? '');
};

// Un jeu : recherche Okkazeo (titre exact), puis les annonces de ses éditions qui en ont (3 au plus, comme le node Sources).
async function unJeu(nom) {
  let recherche, cands = [], p = null;
  for (const v of variantesRecherche(nom)) { // telle quelle, puis au singulier si rien ne correspond
    recherche = 'https://www.okkazeo.com/jeux/resultats?rech_nom=' + encodeURIComponent(v);
    const search = await get(recherche);
    if (!/Nous avons trouvé|Aucun jeu ne correspond/.test(search)) throw new Error('page de recherche inattendue');
    cands = parseOkkazeoSearch(search);
    p = pickProduct(nom, cands);
    if (p) break;
  }
  if (!p) return { demande: nom, titre: null, url: recherche, annonces: [] };
  const editions = cands.filter(c => normalize(c.title) === normalize(p.title) && c.annonces !== 0).slice(0, 3);
  const pages = await Promise.all(editions.map(e => get(e.url)));
  return { demande: nom, titre: p.title, url: editions.length === 1 ? editions[0].url : recherche, annonces: pages.flatMap(parseAnnoncesArticles) };
}

// 3 jeux à la fois pour ne pas inonder Okkazeo.
const res = [];
for (let i = 0; i < noms.length; i += 3) res.push(...await Promise.allSettled(noms.slice(i, i + 3).map(unJeu)));
const msg = r => (r.reason && r.reason.message) || String(r.reason);
const jeux = res.map((r, i) => (r.status === 'fulfilled' ? r.value : { demande: noms[i], titre: null, url: null, annonces: [], erreur: msg(r) }));
const vendeurs = matchVendeurs(jeux.filter(j => j.titre), CP_PARIS);
const erreurs = jeux.filter(j => j.erreur).map(j => `${j.demande}: ${j.erreur}`);
return [{ json: { jeux: jeux.map(j => ({ demande: j.demande, titre: j.titre, url: j.url, annonces: j.annonces.length })), vendeurs, erreurs } }];