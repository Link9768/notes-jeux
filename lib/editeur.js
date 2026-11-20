// Éditeurs : jeux au même titre (« Loop » existe en plusieurs éditeurs). Chaque source expose l'éditeur autrement :
// BGG (liens boardgamepublisher), MyLudo (fiche info, rôle « Éditeur »), Philibert (slug de la marque dans l'URL produit),
// Esprit Jeu (marque de la page produit). Ici : comparer deux noms d'éditeur et lire les marques des boutiques.

// Termes qui ne distinguent pas un éditeur (« Yellow Mountain Editions » ~ « Yellow Mountain »).
const EDITEUR_VIDES = new Set(['edition', 'editions', 'game', 'games', 'studio', 'studios', 'jeu', 'jeux', 'publishing', 'publisher', 'france', 'the', 'les', 'des', 'and']);
const motsEditeur = s => normalize(s).split(' ').filter(w => w.length >= 3 && !EDITEUR_VIDES.has(w));

// Distance d'édition (insertions, suppressions, remplacements) entre deux mots.
function ecart(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

// Vrai si tous les mots significatifs d'un nom se retrouvent dans l'autre (préfixe accepté : « renegade » ~ « renegades »).
function memeEditeur(a, b) {
  if (String(a || '').includes('|')) return String(a).split('|').some(u => memeEditeur(u, b)); // plusieurs éditeurs du jeu choisi : « A|B »
  const x = motsEditeur(a || ''), y = motsEditeur(b || '');
  if (!x.length || !y.length) return false;
  // Préfixe accepté, et deux lettres d'écart dès 5 lettres (on tape « Yellow », l'éditeur s'écrit « Iello » : vu sur « Loop »).
  const dans = (w, l) => l.some(v => v === w || v.startsWith(w) || w.startsWith(v) || (w.length >= 5 && v.length >= 5 && ecart(w, v) <= 2));
  return x.every(w => dans(w, y)) || y.every(w => dans(w, x));
}

// Parmi les candidats d'une boutique au même titre que p : celui dont la marque correspond à l'éditeur (null si aucun ou si p est seul).
// marque : candidat → nom de marque (Philibert : slug de l'URL, tirets en espaces).
function parEditeur(candidats, p, editeur, marque) {
  const exacts = candidats.filter(c => normalize(c.title) === normalize(p.title));
  return exacts.length > 1 ? exacts.find(c => memeEditeur(editeur, marque(c) || '')) || null : null;
}

// Philibert : /fr/<marque>/<id>-<titre>-<ean>.html
const marquePhilibert = url => (/philibertnet\.com\/fr\/([^/]+)\/[0-9]+-/.exec(String(url || '')) || [])[1] || null;

// Esprit Jeu : "brand":"OriGames" (dataLayer de la page produit), sinon microdonnées itemprop="brand".
function marqueEspritJeu(html) {
  const h = String(html || '');
  const m = /"brand":"([^"]+)"/.exec(h) || /itemprop="brand"[\s\S]{0,300}?content="([^"]+)"/.exec(h);
  return m ? m[1].trim() : null;
}

// « Loop Yellow » → [{ nom: 'Loop', editeur: 'Yellow' }] ; « Terraforming Mars Intrafin » → nom de 3 puis 2 mots. 3 essais au plus.
function decoupagesEditeur(q) {
  const mots = String(q || '').trim().split(/\s+/).filter(Boolean);
  const out = [];
  for (let k = mots.length - 1; k >= 1 && out.length < 3; k--) out.push({ nom: mots.slice(0, k).join(' '), editeur: mots.slice(k).join(' ') });
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  if (typeof normalize === 'undefined') global.normalize = require('./match.js').normalize;
  module.exports = { parEditeur, memeEditeur, marquePhilibert, marqueEspritJeu, decoupagesEditeur };
}
