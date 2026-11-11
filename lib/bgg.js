// BGG xmlapi2 (recherche + fiche). Dépend de normalize() (lib/match.js, chargé avant dans les nodes n8n).
function bggDecode(s) { return String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }
function bggAttr(tag, name) { const m = String(tag).match(new RegExp(`\\b${name}="([^"]*)"`)); return m ? bggDecode(m[1]) : null; }
function bggVal(body, tag) { const m = String(body).match(new RegExp(`<${tag}\\b[^>]*\\bvalue="([^"]*)"`)); return m ? m[1] : null; }

function parseBggSearch(xml) {
  return [...String(xml || '').matchAll(/<item\b([^>]*)>([\s\S]*?)<\/item>/g)].map(([, a, body]) => {
    const nom = (body.match(/<name\b[^>]*>/) || [''])[0];
    return { id: bggAttr(a, 'id'), type: bggAttr(a, 'type'), name: bggAttr(nom, 'value'), primaire: bggAttr(nom, 'type') === 'primary' };
  });
}

// Candidats, du plus probable au moins probable (20 au plus, limite de l'API thing) :
// nom exact, puis jeux dont le nom de base (avant « : » ou « - ») est la recherche (« Clank!: A Deck-Building Adventure »),
// sinon tous les mots (titres les plus courts d'abord : BGG renvoie ses 120 résultats dans le désordre).
function bggCandidates(query, items) {
  const q = normalize(query);
  if (!q) return [];
  const nom = i => String(i.name || '');
  // Un nom principal exact écarte les jeux qui n'ont ce nom qu'en alternatif (pickBgg garderait le plus voté :
  // « El Dorado » donnait Eldorado, alias El Dorado).
  const exactTous = items.filter(i => normalize(nom(i)) === q);
  const principal = exactTous.some(i => i.primaire);
  const exact = principal ? exactTous.filter(i => i.primaire) : exactTous;
  const base = items.filter(i => i.type === 'boardgame' && (!principal || i.primaire) && normalize(nom(i).split(/:| - /)[0]) === q);
  let hit = [...exact, ...base];
  if (!hit.length) {
    const words = q.split(' ');
    hit = items.filter(i => { const t = ` ${normalize(nom(i))} `; return words.every(w => t.includes(` ${w} `)); })
      .sort((x, y) => nom(x).length - nom(y).length);
  }
  return [...new Set(hit.map(i => i.id))].slice(0, 20);
}

function parseBggThings(xml) {
  return [...String(xml || '').matchAll(/<item\b([^>]*)>([\s\S]*?)<\/item>/g)].map(([, a, b]) => {
    // BGG met value="0" pour « inconnu » (jeu récent) : 0 n'est jamais une donnée, sauf le nombre de votes.
    const n = (k, zeroOk) => { const v = bggVal(b, k); return v == null || v === '' || (!zeroOk && Number(v) === 0) ? null : Number(v); };
    const primary = (b.match(/<name\b[^>]*type="primary"[^>]*>/) || [''])[0];
    const liens = type => [...b.matchAll(/<link\b[^>]*>/g)].map(m => m[0]).filter(l => bggAttr(l, 'type') === type)
      .map(l => ({ id: bggAttr(l, 'id'), nom: bggAttr(l, 'value') })).filter(l => l.nom);
    // Rangs : général (subtype boardgame) et par famille (stratégie, famille, ambiance…) ; « Not Ranked » ignoré.
    const rangs = [...b.matchAll(/<rank\b[^>]*>/g)].map(m => ({ type: bggAttr(m[0], 'type'), nom: bggAttr(m[0], 'name'), rang: Number(bggAttr(m[0], 'value')) }))
      .filter(r => Number.isInteger(r.rang) && r.rang > 0);
    // Sondage « meilleur nombre de joueurs » : « Best with 3–4 players » → « 3–4 ».
    const best = (b.match(/<result name="bestwith" value="([^"]*)"/) || [])[1];
    return {
      id: bggAttr(a, 'id'), type: bggAttr(a, 'type'), titre: bggAttr(primary, 'value'),
      image: ((b.match(/<image>([^<]*)<\/image>/) || [])[1] || '').trim() || null,
      annee: n('yearpublished'), minp: n('minplayers'), maxp: n('maxplayers'),
      mint: n('minplaytime'), maxt: n('maxplaytime'), age: n('minage'),
      votes: n('usersrated', true), average: n('average'), poids: n('averageweight'),
      mecaniques: liens('boardgamemechanic'), categories: liens('boardgamecategory'), extensions: liens('boardgameexpansion').length,
      rang: (rangs.find(r => r.type === 'subtype' && r.nom === 'boardgame') || {}).rang || null,
      rangsFamille: rangs.filter(r => r.type === 'family'),
      ideal: best ? bggDecode(best).replace(/^Best with\s*/i, '').replace(/\s*players?$/i, '').trim() || null : null,
    };
  });
}

// Libellé BGG (mécanique, catégorie) en français (lib/bgg-fr.js), sans tenir compte des espaces ni de la ponctuation
// (BGG écrit « Spies / Secret Agents » et « Murder/Mystery ») ; inconnu → gardé en anglais.
const bggCle = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
let BGG_FR_TABLE = null;
function bggFr(label) {
  if (!BGG_FR_TABLE) BGG_FR_TABLE = new Map(Object.entries(BGG_FR).map(([k, v]) => [bggCle(k), v]));
  return BGG_FR_TABLE.get(bggCle(label)) || label;
}
// Classements BGG par famille (name de <rank type="family">).
const BGG_RANG_FR = { strategygames: 'stratégie', familygames: 'famille', partygames: 'ambiance', thematic: 'thématique', abstracts: 'abstrait', wargames: 'wargame', childrensgames: 'enfants', cgs: 'cartes à collectionner' };

function bggRange(a, b) { return a == null ? null : (b == null || a === b ? String(a) : `${a}–${b}`); }

function pickBgg(things) {
  const t = [...(things || [])].sort((x, y) => (x.type === 'boardgame' ? 0 : 1) - (y.type === 'boardgame' ? 0 : 1) || (y.votes || 0) - (x.votes || 0))[0];
  if (!t) return null;
  const r1 = v => (v == null ? null : Math.round(v * 10) / 10);
  // Style de jeu en français : toutes les mécaniques (10 max, avec leur id BGG pour le top de la mécanique),
  // complétées par les catégories pour en avoir au moins 7.
  const mecaniques = [];
  for (const m of t.mecaniques || []) {
    const nom = bggFr(m.nom);
    if (mecaniques.length < 10 && !mecaniques.some(x => x.nom === nom)) mecaniques.push({ id: m.id, nom });
  }
  const themes = [...new Set((t.categories || []).map(c => bggFr(c.nom)))].filter(x => !mecaniques.some(m => m.nom === x))
    .slice(0, Math.max(3, 7 - mecaniques.length));
  // Catégorie principale = la famille où le jeu est le mieux classé.
  const fam = [...(t.rangsFamille || [])].sort((a, b) => a.rang - b.rang)[0];
  return {
    id: t.id, note: r1(t.average), votes: t.votes, duree: bggRange(t.mint, t.maxt),
    poids: t.poids == null ? null : Math.round(t.poids * 100) / 100, titre: t.titre,
    annee: t.annee, joueurs: bggRange(t.minp, t.maxp), age: t.age == null ? null : `${t.age}+`,
    image: t.image, url: `https://boardgamegeek.com/boardgame/${t.id}`, mecaniques, themes,
    rang: t.rang || null, rangCat: fam ? { rang: fam.rang, nom: BGG_RANG_FR[fam.nom] || fam.nom } : null,
    ideal: t.ideal || null, extensions: t.extensions || 0,
  };
}

// Jeux similaires = recommandations des joueurs BGG (« si tu aimes X, essaie Y ») : api.geekdo.com/api/geekitem/recs,
// sans token, point d'accès interne (non officiel). Exclus : le jeu et sa gamme (même nom de base, avant « : »), doublons
// (« Ticket to Ride » y figure deux fois). La note, le nombre de votes et le rang sont fournis : aucune fiche à lire.
function pickBggRecs(json, titre, n = 5) {
  const nomBase = t => normalize(String(t || '').split(/:| - /)[0]);
  const base = nomBase(titre);
  const vus = new Set();
  const out = [];
  for (const r of (json && json.recs) || []) {
    const it = r && r.item;
    if (!it || !it.id || !it.name) continue;
    const k = nomBase(it.name);
    if (!k || vus.has(k) || (base && (k === base || k.startsWith(base + ' ') || base.startsWith(k + ' ')))) continue;
    vus.add(k);
    out.push({
      id: String(it.id), titre: it.name, annee: Number(r.yearpublished) || null,
      url: 'https://boardgamegeek.com' + (it.href || '/boardgame/' + it.id),
      note: r.rating ? Math.round(r.rating * 10) / 10 : null, avis: r.numvoters ?? null, rang: r.rank || null,
    });
    if (out.length >= n) break;
  }
  return out;
}

// Version duo (2 joueurs) d'un jeu, d'après les fiches geekitems de BGG (point d'accès interne, sans token) :
// candidats = jeux « Integrates with » et « Reimplemented by » du jeu ; duo = famille « Two-Player Versions of More-Player Games »
// (Res Arcana Duo, Wingspan Asia : le nombre de joueurs ne suffit pas, Asia est noté 1-7 car combinable).
// integrable = le duo est dans « Integrates with » : ses cartes s'ajoutent au jeu de base.
function duoCandidats(base) {
  const l = (base && base.links) || {};
  const integ = (l.boardgameintegration || []).map(x => String(x.objectid));
  return { integ, ids: [...new Set([...integ, ...(l.reimplementation || []).map(x => String(x.objectid))])].slice(0, 6) };
}
function pickDuo(base, fiches) {
  if (!base || Number(base.maxplayers) <= 2) return null; // jeu déjà à 2 : pas de duo
  const { integ } = duoCandidats(base);
  const duos = (fiches || []).filter(f => f && ((f.links && f.links.boardgamefamily) || []).some(x => /two-player versions of more-player games/i.test(x.name)));
  const d = duos.find(f => integ.includes(String(f.objectid))) || duos[0];
  return d ? { titre: d.name, url: 'https://boardgamegeek.com' + (d.href || '/boardgame/' + d.objectid), integrable: integ.includes(String(d.objectid)) } : null;
}

// Rejouabilité : aucun site ne la note (BGG, MyLudo, boutiques : vérifié le 2026-11-11). Indicateur = parties enregistrées
// sur BGG par propriétaire (api.geekdo.com/api/dynamicinfo → stats.numplays / numowned). Calibré sur 32 jeux :
// Exit 0,6 · Detective 1,0 · Unlock 1,8 · Clank 3,0 · 7 Wonders Duel 3,6 · Azul 5,0 · The Crew 6,9.
// Escape game (famille « Escape Room Games ») = usage unique ; Legacy (mécanique « Legacy Game ») = une campagne.
// Biais : un jeu ancien (avant 2008) est sous-noté (propriétaires d'avant l'enregistrement des parties : Catan 1,8).
function pickRejouabilite(base, stats) {
  const l = (base && base.links) || {};
  const a = (k, re) => (l[k] || []).some(x => re.test(x.name));
  const proprietaires = Number(stats && stats.numowned), plays = Number(stats && stats.numplays);
  const parties = proprietaires > 0 && Number.isFinite(plays) ? Math.round((plays / proprietaires) * 10) / 10 : null;
  const type = a('boardgamefamily', /escape room/i) ? 'escape' : a('boardgamemechanic', /^legacy game$/i) ? 'legacy' : null;
  if (parties == null && !type) return null;
  const niveau = type === 'escape' ? 'unique' : parties == null ? null : parties >= 4.5 ? 'forte' : parties >= 3 ? 'bonne' : parties >= 2 ? 'moyenne' : 'faible';
  const annee = Number(base && base.yearpublished);
  return { niveau, parties, type, proprietaires: proprietaires || 0, ancien: annee > 0 && annee < 2008 };
}

if (typeof module !== 'undefined' && module.exports) {
  if (typeof normalize === 'undefined') global.normalize = require('./match.js').normalize;
  if (typeof BGG_FR === 'undefined') global.BGG_FR = require('./bgg-fr.js');
  module.exports = { parseBggSearch, bggCandidates, parseBggThings, pickBgg, pickBggRecs, bggFr, duoCandidats, pickDuo, pickRejouabilite };
}
