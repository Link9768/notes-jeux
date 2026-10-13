// Choix automatique du produit. Collé tel quel en tête des nodes Code n8n (voir scripts/bundle.mjs).
const ACCESSORY_RE = /sleeve|pochette|sticker|autocollant|\bkit\b|feuille de score|piste de suivi|figurine|\bsacs?\b|insert|organiseur|playmat|tapis de jeu|goodies/i;

function normalize(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\((vf|vo|fr|en|version francaise|version anglaise)\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isAccessory(title) {
  return ACCESSORY_RE.test(title || '');
}

function pickProduct(query, candidates) {
  const q = normalize(query);
  const pool = (candidates || []).filter(c => c && c.title && !isAccessory(c.title));
  if (!q || pool.length === 0) return null;
  const frFirst = (a, b) => (a.lang === 'fr' ? 0 : 1) - (b.lang === 'fr' ? 0 : 1);
  const exact = pool.filter(c => normalize(c.title) === q).sort(frFirst);
  if (exact.length) return exact[0];
  const words = q.split(' ');
  const all = pool
    .filter(c => { const t = ` ${normalize(c.title)} `; return words.every(w => t.includes(` ${w} `)); })
    .sort((a, b) => normalize(a.title).length - normalize(b.title).length || frFirst(a, b));
  return all[0] || null;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { normalize, isAccessory, pickProduct };
