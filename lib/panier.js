// Matchmaking Okkazeo : quels vendeurs proposent plusieurs des jeux d'une liste ? (node « Panier », voir scripts/bundle.mjs)
// Une annonce de la fiche d'un jeu = <article class="text-left jeu …"> : lien /annonces/<id>/<slug>, prix, « Vendu par <b>pseudo</b> »,
// « Ville (CP)<br/> », pastille « sticker envoi » si le vendeur expédie (structure observée le 2026-10-13).
const nettoie = t => String(t || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();

function parseAnnoncesArticles(html) {
  const out = [];
  for (const art of String(html || '').split(/(?=<article class="text-left jeu)/).slice(1)) {
    const vendeur = (art.match(/Vendu par\s*<b>([^<]+)<\/b>/) || [])[1];
    const prix = art.match(/<span class="prix">\s*(\d+)\s*€\s*<span class="sub">\s*(\d{2})/);
    if (!vendeur || !prix) continue;
    const lien = (art.match(/href="(\/annonces\/\d+[^"]*)"/) || [])[1];
    const loc = art.match(/([^<>\n]+?)\s*\((\d{4,5})\)\s*<br/);
    // « Jeu d'occasion (état correct) », « Jeu d'occasion + extensions (état excellent) », « (juste déballé) », « Jeu neuf ».
    const etat = /Jeu\s+neuf/i.test(art) ? 'neuf'
      : ((art.match(/\(état ([^)]+)\)/) || art.match(/Jeu\s+d'occasion[^(<]*\(([^)]+)\)/) || [])[1] || '');
    out.push({
      vendeur: nettoie(vendeur),
      prix: Number(prix[1]) + Number(prix[2]) / 100,
      url: lien ? 'https://www.okkazeo.com' + lien : null,
      ville: loc ? nettoie(loc[1]) : null,
      cp: loc ? loc[2] : null,
      etat: etat ? nettoie(etat) : null,
      envoi: /class="sticker envoi"/.test(art), // « Envoi en France », « Envoi France et Europe »
    });
  }
  return out;
}

// Page d'une annonce : « <span class="nb_annonces">…</span> 35 </span> annonces en ligne » = total d'annonces du vendeur (null si absent).
function nbAnnoncesVendeur(html) {
  const m = /<span class="nb_annonces">(?:\s*<i[^>]*><\/i>)?\s*([0-9]+)\s*<\/span>\s*annonces?\s+en\s+ligne/.exec(String(html || ''));
  return m ? Number(m[1]) : null;
}

// jeux : [{ titre, annonces: [...] }] (une entrée par jeu demandé et trouvé). Vendeurs qui ont au moins 2 jeux différents,
// avec l'annonce la moins chère de chaque jeu. Tri : nombre de jeux, puis vendeur près de Paris (cps), puis total le plus bas.
// requis (facultatif) : titres « à sécuriser » ; seuls restent les vendeurs qui ont TOUS ces jeux (même un seul vendeur de 2 jeux suffit : les jeux
// requis comptent dans nbJeux avec les autres jeux de la liste).
function matchVendeurs(jeux, cps, n = 10, requis = []) {
  const proches = new Set(cps || []);
  const vendeurs = new Map();
  for (const j of jeux || []) {
    for (const a of j.annonces || []) {
      const k = String(a.cle ?? a.vendeur ?? '').trim().toLowerCase();
      if (!k) continue;
      const v = vendeurs.get(k) || { vendeur: a.vendeur, ville: a.ville, cp: a.cp, jeux: new Map() };
      const prev = v.jeux.get(j.titre);
      if (!prev || a.prix < prev.prix) v.jeux.set(j.titre, { jeu: j.titre, ...a });
      if (!v.cp && a.cp) { v.ville = a.ville; v.cp = a.cp; }
      vendeurs.set(k, v);
    }
  }
  return [...vendeurs.values()]
    .filter(v => requis.length ? requis.every(t => v.jeux.has(t)) : v.jeux.size >= 2)
    .map(v => {
      const annonces = [...v.jeux.values()].sort((a, b) => a.prix - b.prix);
      return {
        vendeur: v.vendeur, ville: v.ville, cp: v.cp,
        procheParis: !!(v.cp && proches.has(v.cp)),
        envoi: annonces.every(a => a.envoi),
        nbJeux: annonces.length,
        total: Math.round(annonces.reduce((s, a) => s + a.prix, 0) * 100) / 100,
        annonces: annonces.map(a => ({ jeu: a.jeu, prix: a.prix, etat: a.etat, url: a.url })),
      };
    })
    .sort((a, b) => b.nbJeux - a.nbJeux || Number(b.procheParis) - Number(a.procheParis) || a.total - b.total)
    .slice(0, n);
}

// « Clank, Abyss » ou une liste par ligne → noms uniques (300 au plus : chaque jeu coûte 2 à 4 requêtes Okkazeo, espacées par le node).
function parseListeJeux(brut, max = 300) {
  const vus = new Set();
  return String(brut || '').split(/[|\n;,]+/).map(s => s.trim()).filter(s => {
    const k = s.toLowerCase();
    if (!s || vus.has(k)) return false;
    vus.add(k);
    return true;
  }).slice(0, max);
}

// Rythme des requêtes Okkazeo selon la taille TOTALE de la liste (anti-bannissement) : normal jusqu'à 15 jeux ; prudent de 16 à 64
// (2 jeux à la fois, 0,4 s entre deux requêtes) ; lent au-delà (1 jeu à la fois, 1 s entre deux requêtes : l'IP du VPS a été bloquée
// par Cloudflare après un scan de 299 jeux au rythme prudent).
function rythmePanier(n) {
  if (n > 64) return { pauseMs: 1000, ouvriers: 1 };
  return n > 15 ? { pauseMs: 400, ouvriers: 2 } : { pauseMs: 0, ouvriers: 3 };
}

// Blocage Okkazeo (Cloudflare) : 403/429/503, ou page de challenge servie en 200. Ne PAS tester « challenge-platform » ni « __CF » :
// présents sur toutes les pages normales (vérifié dans les fixtures du 2026-11).
function okkBloque(statut, html) {
  return statut === 403 || statut === 429 || statut === 503 || /_cf_chl_opt|<title>\s*Just a moment/i.test(String(html || ''));
}

// En-têtes d'un vrai navigateur : Okkazeo répond 403 au User-Agent seul (mêmes en-têtes que le node Sources).
const OKK_NAVIGATEUR = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9',
  'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Site': 'none', 'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  'sec-ch-ua': '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
  'sec-ch-ua-mobile': '?0', 'sec-ch-ua-platform': '"Windows"',
  'Accept-Encoding': 'gzip, deflate, br', 'Referer': 'https://www.google.com/',
};

// Un jeu : recherche Okkazeo (titre exact), puis les annonces de ses éditions qui en ont (3 au plus, comme le node Sources).
// get(url) → HTML (lève une erreur si HTTP >= 400). attendues = annonces annoncées par la page de recherche (pour repérer une page illisible).
async function annoncesOkkazeo(nom, get) {
  let recherche, cands = [], p = null;
  for (const v of variantesRecherche(nom)) { // telle quelle, puis au singulier si rien ne correspond
    recherche = 'https://www.okkazeo.com/jeux/resultats?rech_nom=' + encodeURIComponent(v);
    const search = await get(recherche);
    if (!/Nous avons trouvé|Aucun jeu ne correspond/.test(search)) throw new Error('page de recherche inattendue');
    cands = parseOkkazeoSearch(search);
    p = pickProduct(nom, cands);
    if (p) break;
  }
  if (!p) return { demande: nom, titre: null, url: recherche, annonces: [], attendues: 0 };
  const editions = cands.filter(c => normalize(c.title) === normalize(p.title) && c.annonces !== 0).slice(0, 3);
  const pages = await Promise.all(editions.map(e => get(e.url)));
  return {
    demande: nom, titre: p.title, url: editions.length === 1 ? editions[0].url : recherche,
    annonces: pages.flatMap(parseAnnoncesArticles),
    attendues: editions.reduce((s, e) => s + (Number(e.annonces) || 0), 0),
  };
}

if (typeof module !== 'undefined' && module.exports) {
  // Hors n8n, les fonctions de match.js et sites.js ne sont pas globales (dans n8n, le bundle les place devant ce fichier).
  if (typeof normalize === 'undefined') Object.assign(global, require('./match.js'));
  if (typeof parseOkkazeoSearch === 'undefined') global.parseOkkazeoSearch = require('./sites.js').parseOkkazeoSearch;
  module.exports = { nbAnnoncesVendeur, parseAnnoncesArticles, matchVendeurs, parseListeJeux, rythmePanier, okkBloque, OKK_NAVIGATEUR, annoncesOkkazeo };
}
