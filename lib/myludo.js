// MyLudo : application JavaScript, API interne views/search/datas.php et views/game/datas.php (voir docs/sources.md).
function myludoUrl(g) { return `https://www.myludo.fr/#!/game/${g.code}-${g.id}`; }

function parseMyludoSearch(json) {
  return ((json && json.list) || [])
    .filter(g => g && g.id && g.title)
    .map(g => ({ title: String(g.title).trim(), id: String(g.id), type: g.type || 'basegame', url: myludoUrl(g) }));
}

// Jeu de base d'abord : une extension n'est choisie que si aucun jeu de base ne correspond à la requête.
function pickMyludo(query, candidates) {
  return pickProduct(query, candidates.filter(c => c.type === 'basegame')) || pickProduct(query, candidates);
}

// Note de la communauté (sur 10) : rating.game.note = « 8,3 », audience = nombre de notes.
function parseMyludoGame(g) {
  const r = g && g.rating && g.rating.game;
  const has = !!(r && r.audience > 0);
  const note = has ? parseFloat(String(r.note ?? r.weighted ?? r.average).replace(',', '.')) : NaN;
  return { note: Number.isFinite(note) ? note : null, avis: has ? r.audience : null, titre: g.title, url: myludoUrl(g) };
}

if (typeof module !== 'undefined' && module.exports) {
  if (typeof pickProduct === 'undefined') global.pickProduct = require('./match.js').pickProduct;
  module.exports = { parseMyludoSearch, pickMyludo, parseMyludoGame };
}
