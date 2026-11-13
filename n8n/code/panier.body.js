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
// Deux vitesses (rythmePanier, lib/panier.js) : jusqu'à 15 jeux, rythme normal ; au-delà (100 au plus), 2 jeux à la fois et
// 0,4 s entre deux requêtes Okkazeo (garde-fou anti-bannissement : même débit à 20 ou à 100 jeux).
const { pauseMs: PAUSE_MS, ouvriers: OUVRIERS } = rythmePanier(noms.length);
let prochain = 0;
const attendre = async () => {
  const t = Math.max(0, prochain - Date.now());
  prochain = Math.max(Date.now(), prochain) + PAUSE_MS;
  if (t) await new Promise(ok => setTimeout(ok, t));
};
const get = async url => {
  await attendre();
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

// Mémoire d'1 h dans le workflow (données statiques, gardées entre deux exécutions de production) :
// un jeu déjà cherché dans l'heure ne coûte aucune requête. Absente hors production (tests) → objet vide.
const MEMOIRE_MS = 60 * 60 * 1000;
const statique = typeof $getWorkflowStaticData === 'function' ? $getWorkflowStaticData('global') : {};
const memoire = statique.panier || (statique.panier = {});
for (const k of Object.keys(memoire)) if (Date.now() - memoire[k].t > MEMOIRE_MS) delete memoire[k];
async function unJeuMemo(nom) {
  const k = normalize(nom), m = memoire[k];
  if (m) return { ...m.v, demande: nom };
  const v = await unJeu(nom);
  memoire[k] = { t: Date.now(), v };
  return v;
}

// File d'attente (3 jeux à la fois, 2 en mode prudent) ; un jeu en échec n'arrête pas les autres.
const msg = e => (e && e.message) || String(e);
const jeux = new Array(noms.length);
let suivant = 0;
await Promise.all(Array.from({ length: OUVRIERS }, async () => {
  while (suivant < noms.length) {
    const i = suivant++;
    try { jeux[i] = await unJeuMemo(noms[i]); } catch (e) { jeux[i] = { demande: noms[i], titre: null, url: null, annonces: [], erreur: msg(e) }; }
  }
}));
const vendeurs = matchVendeurs(jeux.filter(j => j.titre), CP_PARIS);
const erreurs = jeux.filter(j => j.erreur).map(j => `${j.demande}: ${j.erreur}`);
return [{ json: { jeux: jeux.map(j => ({ demande: j.demande, titre: j.titre, url: j.url, annonces: j.annonces.length })), vendeurs, erreurs } }];