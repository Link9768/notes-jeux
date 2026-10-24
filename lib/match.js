// Choix automatique du produit. Collé tel quel en tête des nodes Code n8n (voir scripts/bundle.mjs).
const ACCESSORY_RE = /sleeve|pochette|sticker|autocollant|\bkit\b|feuille de score|piste de suivi|figurine|\bsacs?\b|insert|organiseur|playmat|tapis de jeu|goodies/i;

// Accents combinants (plage U+0300 a U+036F) : construits sans echappement unicode, que n8n transforme a l enregistrement.
const COMBINING_RE = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');

function normalize(s) {
  return String(s || '')
    .normalize('NFD').replace(COMBINING_RE, '')
    .toLowerCase()
    .replace(/\((vf|vo|fr|en|version francaise|version anglaise)\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isAccessory(title) {
  return ACCESSORY_RE.test(title || '');
}

// Vrai si a et b sont égaux à une insertion, suppression ou substitution près.
function within1(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}

// Distance d'édition (insertions, suppressions, substitutions) entre deux chaînes.
function distance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

// Pluriel ignoré mot par mot (« mots malins » = « mot malin ») ; mots de 3 lettres et moins intacts.
const singulier = t => t.split(' ').map(w => (w.length > 3 ? w.replace(/[sx]$/, '') : w));

// Ordre de préférence : titre exact → titre à une lettre près (« catane » → « Catan ») →
// titres contenant tous les mots (pluriels ignorés), jeu de base avant extension, dans l'ordre de pertinence du site →
// en dernier recours, titre à 2 lettres près si la recherche fait au moins 8 caractères.
function pickProduct(query, candidates) {
  const q = normalize(query);
  const pool = (candidates || []).filter(c => c && c.title && !isAccessory(c.title));
  if (!q || pool.length === 0) return null;
  const frFirst = (a, b) => (a.lang === 'fr' ? 0 : 1) - (b.lang === 'fr' ? 0 : 1);
  const exact = pool.filter(c => normalize(c.title) === q).sort(frFirst);
  if (exact.length) return exact[0];
  if (q.length >= 5) {
    const near = pool.filter(c => within1(normalize(c.title), q)).sort(frFirst);
    if (near.length) return near[0];
  }
  const words = singulier(q);
  const all = pool.filter(c => { const t = ` ${singulier(normalize(c.title)).join(' ')} `; return words.every(w => t.includes(` ${w} `)); });
  const isExt = c => /\bext(ension)?\b/.test(normalize(c.title));
  const base = /\bext(ension)?\b/.test(q) ? all : all.filter(c => !isExt(c));
  const best = [...(base.length ? base : all)].sort(frFirst)[0];
  if (best) return best;
  if (q.length < 8) return null;
  const proches = pool.filter(c => distance(normalize(c.title), q) <= 2).sort(frFirst);
  return proches[0] || null;
}

// Recherches à tenter sur un site qui ne cherche que le titre exact (Okkazeo) : telle quelle, puis au singulier
// (« mots malins » : Okkazeo ne trouve « Mot Malin » qu'avec « mot malin »).
function variantesRecherche(q) {
  const n = normalize(q);
  const s = singulier(n).join(' ');
  return s && s !== n ? [q, s] : [q];
}

if (typeof module !== 'undefined' && module.exports) module.exports = { normalize, isAccessory, pickProduct, variantesRecherche };
