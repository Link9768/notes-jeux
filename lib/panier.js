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

// jeux : [{ titre, annonces: [...] }] (une entrée par jeu demandé et trouvé). Vendeurs qui ont au moins 2 jeux différents,
// avec l'annonce la moins chère de chaque jeu. Tri : nombre de jeux, puis vendeur près de Paris (cps), puis total le plus bas.
function matchVendeurs(jeux, cps, n = 10) {
  const proches = new Set(cps || []);
  const vendeurs = new Map();
  for (const j of jeux || []) {
    for (const a of j.annonces || []) {
      const k = String(a.vendeur || '').trim().toLowerCase();
      if (!k) continue;
      const v = vendeurs.get(k) || { vendeur: a.vendeur, ville: a.ville, cp: a.cp, jeux: new Map() };
      const prev = v.jeux.get(j.titre);
      if (!prev || a.prix < prev.prix) v.jeux.set(j.titre, { jeu: j.titre, ...a });
      if (!v.cp && a.cp) { v.ville = a.ville; v.cp = a.cp; }
      vendeurs.set(k, v);
    }
  }
  return [...vendeurs.values()]
    .filter(v => v.jeux.size >= 2)
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

// « Clank, Abyss » ou une liste par ligne → noms uniques (8 au plus : chaque jeu coûte 2 à 4 requêtes Okkazeo).
function parseListeJeux(brut, max = 8) {
  const vus = new Set();
  return String(brut || '').split(/[|\n;,]+/).map(s => s.trim()).filter(s => {
    const k = s.toLowerCase();
    if (!s || vus.has(k)) return false;
    vus.add(k);
    return true;
  }).slice(0, max);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseAnnoncesArticles, matchVendeurs, parseListeJeux };
}
