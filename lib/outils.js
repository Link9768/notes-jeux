// Outils chargés au clic (workflow « Notes Jeux — Outils ») : extensions, top d'une mécanique, jumeaux.
// Sources : points d'accès internes BGG sans token, api.geekdo.com/api/geekitem/linkeditems et /api/geekitems (vérifiés le 2026-10-31).
// Dépend de normalize() (lib/match.js) et bggFr() (lib/bgg.js), chargés avant dans le node.

const BGG = 'https://boardgamegeek.com';
const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

// Liste linkeditems → jeux { id, titre, annee, note, votes, rang, poids, url }.
function parseLinkedItems(json) {
  return ((json && json.items) || []).filter(i => i && i.objectid && i.name).map(i => ({
    id: String(i.objectid), titre: i.name, annee: num(i.yearpublished), type: i.subtype || null,
    note: num(i.average) ? Math.round(num(i.average) * 10) / 10 : null, votes: Number(i.usersrated) || 0,
    rang: num(i.rank), poids: num(i.avgweight), url: BGG + (i.href || '/boardgame/' + i.objectid),
  }));
}

// Extensions d'un jeu : les plus jouées (votes) d'abord.
function pickExtensions(json, n = 30) {
  return parseLinkedItems(json).sort((a, b) => b.votes - a.votes).slice(0, n);
}

// Meilleurs jeux d'une mécanique : ordre du classement BGG (sort=rank), jeux classés seulement.
function pickTopMeca(json, n = 20) {
  return parseLinkedItems(json).filter(j => j.rang).slice(0, n);
}

// Fiche geekitems → étiquettes utiles à la ressemblance. Familles gardées : « Mechanism: » et « Theme: » seulement
// (les autres sont des séries, des éditeurs ou des adaptations numériques).
function geekItemTags(json) {
  const it = (json && json.item) || {};
  const l = it.links || {};
  const tags = (k, type) => (l[k] || []).filter(x => x && x.objectid && x.name).map(x => ({ id: String(x.objectid), nom: x.name, type }));
  return {
    id: String(it.objectid || ''), titre: it.name || '', type: it.subtype || null, annee: num(it.yearpublished),
    minp: num(it.minplayers), maxp: num(it.maxplayers), mint: num(it.minplaytime), maxt: num(it.maxplaytime),
    tags: [
      ...tags('boardgamemechanic', 'mecanique'),
      ...tags('boardgamefamily', 'famille').filter(t => /^Mechanism:/i.test(t.nom)),
      ...tags('boardgamefamily', 'theme').filter(t => /^Theme:/i.test(t.nom)),
      ...tags('boardgamecategory', 'categorie'),
    ],
  };
}

// Paramètres linkeditems d'une étiquette (mécanique et catégorie = « property », famille = « family »).
function linkedItemsUrl(tag, { index = 'boardgame', count = 50 } = {}) {
  const sub = { mecanique: 'boardgamemechanic', categorie: 'boardgamecategory', famille: 'boardgamefamily', theme: 'boardgamefamily' }[tag.type];
  const objtype = sub === 'boardgamefamily' ? 'family' : 'property';
  return `https://api.geekdo.com/api/geekitem/linkeditems?ajax=1&linkdata_index=${index}&nosession=1&objectid=${tag.id}&objecttype=${objtype}&pageid=1&showcount=${count}&sort=rank&subtype=${sub}`;
}

// Jumeaux : jeux qui partagent les étiquettes les plus RARES du jeu (rareté = log(N / nombre de jeux de l'étiquette)).
// listes : [{ tag, total, jeux }] (linkeditems de chaque étiquette du jeu) ; fiches : Map id → geekItemTags des finalistes.
const N_JEUX = 150000;
// Familles « Theme: » (Nature, Art…) : décor, pas mécanisme → même poids qu'une catégorie.
const POIDS_TYPE = { mecanique: 1, famille: 1, theme: 0.5, categorie: 0.5 };
const rarete = total => Math.log(N_JEUX / Math.max(1, total || 1));
const nomBaseJeu = t => normalize(String(t || '').split(/:| - /)[0]);

function preselection(cible, listes, n = 15) {
  const base = nomBaseJeu(cible.titre);
  const score = new Map();
  for (const { tag, total, jeux } of listes) {
    const w = rarete(total) * (POIDS_TYPE[tag.type] || 0);
    for (const j of jeux) {
      if (j.id === cible.id || (j.type && j.type !== 'boardgame')) continue;
      const k = nomBaseJeu(j.titre);
      if (!k || k === base || k.startsWith(base + ' ') || base.startsWith(k + ' ')) continue;
      const s = score.get(j.id) || { jeu: j, s: 0 };
      s.s += w;
      score.set(j.id, s);
    }
  }
  return [...score.values()].sort((a, b) => b.s - a.s).slice(0, n).map(x => x.jeu);
}

function libelleTag(t) { return bggFr(String(t.nom).replace(/^(Mechanism|Theme):\s*/i, '')); }

function scoreJumeaux(cible, listes, finalistes, fiches, n = 2) {
  const totaux = new Map(listes.map(l => [l.tag.id + l.tag.type, l.total]));
  const poidsTag = t => rarete(totaux.get(t.id + t.type)) * (POIDS_TYPE[t.type] || 0);
  const total = cible.tags.reduce((s, t) => s + poidsTag(t), 0) || 1;
  const moy = (a, b) => (a && b ? (a + b) / 2 : a || b || null);
  const out = [];
  for (const j of finalistes) {
    const f = fiches.get(j.id);
    if (!f) continue;
    const ids = new Set(f.tags.map(t => t.id + t.type));
    const communs = cible.tags.filter(t => ids.has(t.id + t.type));
    let s = communs.reduce((x, t) => x + poidsTag(t), 0) / total;
    // Pénalités : écart de poids (complexité), de durée, nombres de joueurs sans recouvrement.
    if (cible.poids && j.poids) s *= Math.exp(-Math.abs(cible.poids - j.poids) / 1.5);
    const d1 = moy(cible.mint, cible.maxt), d2 = moy(f.mint, f.maxt);
    if (d1 && d2) s *= 1 / (1 + 0.25 * Math.abs(Math.log(d1 / d2)));
    if (cible.minp && cible.maxp && f.minp && f.maxp && (f.maxp < cible.minp || f.minp > cible.maxp)) s *= 0.6;
    // À ressemblance égale, le jeu le plus joué passe devant (100 votes → ×0,85 ; 10 000 et plus → ×1).
    s *= Math.min(1, 0.7 + 0.075 * Math.log10((j.votes || 0) + 1));
    const raison = [...communs].sort((a, b) => poidsTag(b) - poidsTag(a)).slice(0, 3).map(libelleTag);
    out.push({ id: j.id, titre: j.titre, annee: j.annee, url: j.url, note: j.note, votes: j.votes, score: Math.round(s * 100) / 100, raison: [...new Set(raison)] });
  }
  return out.sort((a, b) => b.score - a.score).filter(x => x.score >= 0.2).slice(0, n);
}

// Saisie semi-automatique : titres qui commencent par la saisie d'abord, jeux de base avant extensions, sans doublon.
function classerSuggestions(q, candidats, n = 8) {
  const k = normalize(q);
  const rang = c => (normalize(c.title).startsWith(k) ? 0 : 2) + (c.type === 'basegame' ? 0 : 1);
  const vus = new Set();
  return (candidats || []).map((c, i) => ({ c, i })).sort((a, b) => rang(a.c) - rang(b.c) || a.i - b.i)
    .map(x => x.c.title).filter(t => !vus.has(t) && vus.add(t)).slice(0, n);
}

// Code-barres : un EAN-8/13 ou UPC-A (8 à 14 chiffres).
const estEan = s => /^\d{8,14}$/.test(String(s || '').trim());

// Vidéos YouTube de la recherche d'une chaîne (youtube.com/@chaine/search?query=…, sans clé d'API) :
// les vidéos sont dans le JSON « var ytInitialData = {…}; » de la page (objets videoRenderer, parcourus récursivement).
function parseYtVideos(html) {
  const m = String(html || '').match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
  if (!m) return [];
  const out = [];
  const vus = new Set();
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    const v = o.videoRenderer;
    if (v && v.videoId && !vus.has(v.videoId)) {
      vus.add(v.videoId);
      out.push({ id: v.videoId, titre: ((v.title && v.title.runs) || []).map(r => r.text).join(''), duree: (v.lengthText && v.lengthText.simpleText) || null,
        url: 'https://www.youtube.com/watch?v=' + v.videoId, image: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg` });
    }
    for (const k in o) walk(o[k]);
  })(JSON.parse(m[1]));
  return out;
}
// Le titre de la vidéo désigne-t-il ce jeu ? Égalité (accents, casse et ponctuation ignorés), à une lettre près dès 5 lettres.
function aUneLettre(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i);
}
const memeTitre = (a, titres) => { const n = normalize(a); return !!n && titres.some(t => { const k = normalize(t); return k && (n === k || (k.length >= 5 && aUneLettre(n, k))); }); };
// Ludochrono (chaîne Ludovox) : « Ludochrono - Res Arcana » ; « Ludochrono - Res Arcana Duo » n'est pas Res Arcana.
function pickLudochrono(videos, titres) {
  return (videos || []).find(v => { const m = v.titre.match(/^\s*ludo\s*chrono\s*[-–:|]\s*(.+)$/i); return m && memeTitre(m[1], titres); }) || null;
}
// Le Chalet (chaîne Un Monde de jeux) : « Zénith, on explique et on joue avec … », « Trail Again On explique et on joue ».
function pickChalet(videos, titres) {
  return (videos || []).find(v => { const m = v.titre.match(/^(.+?)[\s,.!:-]*on (vous )?explique/i); return m && memeTitre(m[1], titres); }) || null;
}

if (typeof module !== 'undefined' && module.exports) {
  if (typeof normalize === 'undefined') global.normalize = require('./match.js').normalize;
  if (typeof bggFr === 'undefined') global.bggFr = require('./bgg.js').bggFr;
  module.exports = { parseLinkedItems, pickExtensions, pickTopMeca, geekItemTags, linkedItemsUrl, preselection, scoreJumeaux, classerSuggestions, estEan, parseYtVideos, pickLudochrono, pickChalet };
}
