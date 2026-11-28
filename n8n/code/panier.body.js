// Matchmaking Okkazeo : GET ?jeux=Clank|Abyss|… → vendeurs qui proposent au moins 2 de ces jeux (voir lib/panier.js).
// secu = jeux « à sécuriser » (3 au plus, aussi cherchés comme les autres) : l'encart « sécurisés » ne garde que les vendeurs qui ont TOUS ces jeux.
const q = $('Webhook').first().json.query;
const secu = parseListeJeux(q.secu, 3);
const noms = parseListeJeux(secu.concat(parseListeJeux(q.jeux)).join('|'));
if (noms.length < 2) return [{ json: { jeux: noms.map(demande => ({ demande, titre: null, url: null, annonces: 0 })), vendeurs: [], erreurs: ['au moins 2 jeux'] } }];

// total = taille de la liste ENTIÈRE (la page appelle par paquets cumulés) ; absent (ancienne page) → ce paquet.
const total = Math.min(303, Math.max(noms.length, Number(q.total) || 0));
const final = noms.length >= total;
// Trois vitesses selon le total (rythmePanier, lib/panier.js) : ≤ 15 normal ; 16 à 64 : 2 jeux à la fois, 0,4 s entre deux requêtes ;
// au-delà : 1 jeu à la fois, 1 s entre deux requêtes (garde-fous anti-bannissement).
const { pauseMs: PAUSE_MS, ouvriers: OUVRIERS } = rythmePanier(total);
let prochain = 0;
const attendre = async () => {
  const t = Math.max(0, prochain - Date.now());
  prochain = Math.max(Date.now(), prochain) + PAUSE_MS;
  if (t) await new Promise(ok => setTimeout(ok, t));
};
// Coupe-circuit : au 1er blocage Okkazeo (403/429/503, challenge Cloudflare, page inattendue), plus aucune requête (avant ET après l'attente).
const BLOQUE = 'Okkazeo bloque le serveur';
let bloque = false;
const get = async url => {
  if (bloque) throw new Error(BLOQUE);
  await attendre();
  if (bloque) throw new Error(BLOQUE);
  const r = await this.helpers.httpRequest({ url, headers: OKK_NAVIGATEUR, json: false, timeout: 10000, returnFullResponse: true, ignoreHttpStatusErrors: true });
  const body = String(r.body ?? '');
  if (okkBloque(r.statusCode, body)) { bloque = true; throw new Error(BLOQUE); }
  if (r.statusCode >= 400) throw new Error(`HTTP ${r.statusCode} ${url}`);
  return body;
};

// Un jeu : recherche Okkazeo puis annonces de ses éditions (annoncesOkkazeo, lib/panier.js, partagé avec le workflow Veille).
const unJeu = nom => annoncesOkkazeo(nom, get);

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
    try { jeux[i] = await unJeuMemo(noms[i]); } catch (e) {
      if (msg(e) === BLOQUE || /inattendue/.test(msg(e))) bloque = true;
      jeux[i] = bloque ? { demande: noms[i], titre: null, url: null, annonces: [], nonVerifie: true } : { demande: noms[i], titre: null, url: null, annonces: [], erreur: msg(e) };
    }
  }
}));
const trouves = jeux.filter(j => j.titre);
const vendeurs = matchVendeurs(trouves, CP_PARIS);
const secuNorm = new Set(secu.map(s => normalize(s)));
const requis = trouves.filter(j => secuNorm.has(normalize(j.demande))).map(j => j.titre);
const introuvables = jeux.filter(j => !j.titre && secuNorm.has(normalize(j.demande))).map(j => j.demande);
const securises = secu.length && !introuvables.length ? matchVendeurs(trouves, CP_PARIS, 10, requis) : [];
// Total d'annonces de chaque vendeur affiché : lu sur la page de sa 1re annonce (une requête par vendeur, au même rythme ; mémoire d'1 h).
const nbParUrl = new Map(); // un vendeur présent dans les deux listes (sécurisés et autres) n'est lu qu'une fois
const nbPour = url => nbParUrl.get(url) || nbParUrl.set(url, (async () => {
  const k = 'nb:' + url, m = memoire[k];
  if (m) return m.v;
  let nb = null;
  try { nb = nbAnnoncesVendeur(await get(url)); } catch (e) { nb = null; }
  memoire[k] = { t: Date.now(), v: nb };
  return nb;
})()).get(url);
// Seulement à l'appel final et sans blocage : un appel intermédiaire n'a pas à coûter une requête par vendeur.
if (final && !bloque) await Promise.all(vendeurs.concat(securises).map(async v => {
  const a = v.annonces.find(x => x.url);
  if (a) v.nbAnnonces = await nbPour(a.url);
}));
const erreurs = jeux.filter(j => j.erreur).map(j => `${j.demande}: ${j.erreur}`);
return [{ json: { jeux: jeux.map(j => ({ demande: j.demande, titre: j.titre, url: j.url, annonces: j.annonces.length, ...(j.nonVerifie ? { nonVerifie: true } : {}) })), vendeurs, ...(secu.length ? { securises: { jeux: requis, introuvables, vendeurs: securises } } : {}), ...(bloque ? { bloque: true } : {}), erreurs } }];