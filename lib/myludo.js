// MyLudo : application JavaScript, API interne views/search/datas.php et views/game/datas.php (voir docs/sources.md).
function myludoUrl(g) { return `https://www.myludo.fr/#!/game/${g.code}-${g.id}`; }

function parseMyludoSearch(json) {
  return ((json && json.list) || [])
    .filter(g => g && g.id && g.title)
    .map(g => ({ title: String(g.title).trim(), id: String(g.id), type: g.type || 'basegame', annee: g.edition || null, url: myludoUrl(g) }));
}

// Jeu de base d'abord : une extension n'est choisie que si aucun jeu de base ne correspond à la requête.
// id (facultatif) : jeu choisi par l'utilisateur parmi les homonymes ; inconnu → choix normal.
function pickMyludo(query, candidates, id) {
  const voulu = id && candidates.find(c => c.id === String(id));
  if (voulu) return voulu;
  return pickProduct(query, candidates.filter(c => c.type === 'basegame')) || pickProduct(query, candidates);
}

// Fiche : note de la communauté (sur 10) + infos pratiques. rating.game.note = « 8,3 », audience = nombre de notes.
const frNum = v => { const n = parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };
function parseMyludoGame(g) {
  const r = g && g.rating && g.rating.game;
  const c = g && g.rating && g.rating.complexity;
  const has = !!(r && r.audience > 0);
  const note = has ? frNum(r.note ?? r.weighted ?? r.average) : null;
  const tmin = frNum(g.time_min), tmax = frNum(g.time_max);
  const duree = tmin && tmax && tmin !== tmax ? tmin + "–" + tmax : (tmin || tmax || frNum(g.duration));
  return {
    note, avis: has ? r.audience : null, titre: g.title, url: myludoUrl(g),
    image: (g.image && (g.image.S160 || g.image.S300)) || null,
    annee: g.edition || null, joueurs: g.players || null, age: g.age || null, duree: duree || null,
    complexite: (c && c.audience > 0 && frNum(c.note)) || null, // 0 = inconnue (vu sur Exit)
  };
}

// Fiche détaillée (type=info) : themes.mecanisme = { "deck-building-22": "Deck building", ... } → id du tag en fin de clé.
function parseMyludoInfo(info) {
  const t = (info && info.themes) || {};
  const tags = o => Object.entries(o || {}).map(([slug, nom]) => ({ id: (slug.match(/-(\d+)$/) || [])[1], nom: String(nom) })).filter(x => x.id);
  const auteurs = Object.values((info && info.people) || {}).filter(p => p && p.id && (p.roles || []).includes('Auteur')).map(p => ({ id: String(p.id), nom: String(p.title) }));
  return { mecaniques: tags(t.mecanisme), themes: tags(t.theme).map(x => x.nom), auteurs };
}

// tagLists : [{ id, nom, count, list }] (list = jeux de base du tag, du mieux classé au moins bien).
// Mécaniques principales = les plus rares (les plus distinctives), pas les plus répandues (« Exploration »).
function topMecaniques(tagLists, n = 5) {
  return [...tagLists].sort((a, b) => a.count - b.count).slice(0, n).map(t => t.nom);
}

// Jeux du même auteur (people/datas.php?type=games, tous rôles confondus, non triable par notoriété) : jeux de base seulement,
// sans le jeu ni sa gamme, un titre une seule fois (édition la plus récente). Les plus connus d'abord = les plus réédités
// (éditions et traductions sont des entrées distinctes), puis ceux déjà classés dans les listes de mécaniques du jeu
// (populaires : titres normalisés). Pas de lecture des fiches (≈ 1 s chacune côté MyLudo).
function pickAuteurJeux(titre, list, populaires = new Set(), n = 7) {
  const base = normalize(titre);
  const groupes = new Map();
  for (const g of list || []) {
    if (!g || g.type !== 'basegame') continue;
    const k = normalize(g.title);
    if (!k || k === base || k.startsWith(base + ' ') || base.startsWith(k + ' ')) continue;
    if (!groupes.has(k)) groupes.set(k, []);
    groupes.get(k).push(g);
  }
  return [...groupes.entries()]
    .map(([k, gs]) => ({ pop: populaires.has(k) ? 1 : 0, n: gs.length, g: gs.reduce((a, b) => ((b.edition || 0) > (a.edition || 0) ? b : a)) }))
    .sort((a, b) => b.n - a.n || b.pop - a.pop)
    .slice(0, n)
    .map(({ g }) => ({ id: g.id, titre: g.title, annee: g.edition || null, url: myludoUrl(g) }));
}

// Jeux de base au même titre que le jeu choisi (« Loop » 2025, 2023, 2019), un par année, le plus récent d'abord ; null s'il est seul.
function homonymesMyludo(choisi, candidates) {
  if (!choisi) return null;
  const t = normalize(choisi.title), vus = new Set();
  const l = [choisi, ...candidates.filter(c => c.id !== choisi.id)].filter(c => c.type === 'basegame' && normalize(c.title) === t)
    .filter(c => !vus.has(c.annee) && vus.add(c.annee)) // le jeu choisi d'abord : il garde sa place si une autre édition a la même année
    .map(c => ({ id: c.id, annee: c.annee }));
  return l.length >= 2 ? l.sort((a, b) => (b.annee || 0) - (a.annee || 0)) : null;
}

if (typeof module !== 'undefined' && module.exports) {
  if (typeof pickProduct === 'undefined') global.pickProduct = require('./match.js').pickProduct;
  if (typeof normalize === 'undefined') global.normalize = require('./match.js').normalize;
  module.exports = { parseMyludoSearch, pickMyludo, homonymesMyludo, parseMyludoGame, parseMyludoInfo, topMecaniques, pickAuteurJeux };
}
