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
    complexite: c && c.audience > 0 ? frNum(c.note) : null,
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

// Semblables = jeux qui partagent le plus de mécaniques, une mécanique rare comptant plus qu'une courante.
// Exclus : le jeu lui-même, sa gamme (titre qui commence par le sien), les doublons d'éditions, les non-jeux de base.
function pickSimilaires(titre, tagLists, n = 3) {
  const base = normalize(titre);
  const vus = new Map();
  for (const t of tagLists) {
    const w = 1 / Math.sqrt(Math.max(t.count, 1));
    t.list.forEach((g, i) => {
      if (g.type !== "basegame") return;
      const k = normalize(g.title);
      if (!k || k === base || k.startsWith(base + " ") || base.startsWith(k + " ")) return;
      const s = vus.get(k) || { g, tags: new Set(), w: 0, r: 0 };
      if (s.tags.has(t.id)) return;
      s.tags.add(t.id); s.w += w; s.r += i; vus.set(k, s);
    });
  }
  const min = tagLists.length >= 2 ? 2 : 1;
  return [...vus.values()].filter(s => s.tags.size >= min)
    .sort((a, b) => b.w - a.w || a.r - b.r).slice(0, n)
    .map(({ g }) => ({ id: g.id, titre: g.title, annee: g.edition || null, url: myludoUrl(g) }));
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

if (typeof module !== 'undefined' && module.exports) {
  if (typeof pickProduct === 'undefined') global.pickProduct = require('./match.js').pickProduct;
  if (typeof normalize === 'undefined') global.normalize = require('./match.js').normalize;
  module.exports = { parseMyludoSearch, pickMyludo, parseMyludoGame, parseMyludoInfo, topMecaniques, pickSimilaires, pickAuteurJeux };
}
