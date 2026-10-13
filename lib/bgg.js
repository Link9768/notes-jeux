// BGG xmlapi2 (recherche + fiche). Dépend de normalize() (lib/match.js, chargé avant dans les nodes n8n).
function bggDecode(s) { return String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }
function bggAttr(tag, name) { const m = String(tag).match(new RegExp(`\\b${name}="([^"]*)"`)); return m ? bggDecode(m[1]) : null; }
function bggVal(body, tag) { const m = String(body).match(new RegExp(`<${tag}\\b[^>]*\\bvalue="([^"]*)"`)); return m ? m[1] : null; }

function parseBggSearch(xml) {
  return [...String(xml || '').matchAll(/<item\b([^>]*)>([\s\S]*?)<\/item>/g)].map(([, a, body]) => ({
    id: bggAttr(a, 'id'), type: bggAttr(a, 'type'), name: bggAttr((body.match(/<name\b[^>]*>/) || [''])[0], 'value'),
  }));
}

function bggCandidates(query, items) {
  const q = normalize(query);
  if (!q) return [];
  let hit = items.filter(i => normalize(i.name) === q);
  if (!hit.length) {
    const words = q.split(' ');
    hit = items.filter(i => { const t = ` ${normalize(i.name)} `; return words.every(w => t.includes(` ${w} `)); });
  }
  return [...new Set(hit.map(i => i.id))].slice(0, 20);
}

function parseBggThings(xml) {
  return [...String(xml || '').matchAll(/<item\b([^>]*)>([\s\S]*?)<\/item>/g)].map(([, a, b]) => {
    const n = k => { const v = bggVal(b, k); return v == null || v === '' ? null : Number(v); };
    const primary = (b.match(/<name\b[^>]*type="primary"[^>]*>/) || [''])[0];
    return {
      id: bggAttr(a, 'id'), type: bggAttr(a, 'type'), titre: bggAttr(primary, 'value'),
      image: ((b.match(/<image>([^<]*)<\/image>/) || [])[1] || '').trim() || null,
      annee: n('yearpublished'), minp: n('minplayers'), maxp: n('maxplayers'),
      mint: n('minplaytime'), maxt: n('maxplaytime'), age: n('minage'),
      votes: n('usersrated'), average: n('average'), poids: n('averageweight'),
    };
  });
}

function bggRange(a, b) { return a == null ? null : (b == null || a === b ? String(a) : `${a}–${b}`); }

function pickBgg(things) {
  const t = [...(things || [])].sort((x, y) => (x.type === 'boardgame' ? 0 : 1) - (y.type === 'boardgame' ? 0 : 1) || (y.votes || 0) - (x.votes || 0))[0];
  if (!t) return null;
  const r1 = v => (v == null ? null : Math.round(v * 10) / 10);
  return {
    note: r1(t.average), votes: t.votes, duree: bggRange(t.mint, t.maxt),
    poids: t.poids == null ? null : Math.round(t.poids * 100) / 100, titre: t.titre,
    annee: t.annee, joueurs: bggRange(t.minp, t.maxp), age: t.age == null ? null : `${t.age}+`,
    image: t.image, url: `https://boardgamegeek.com/boardgame/${t.id}`,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  if (typeof normalize === 'undefined') global.normalize = require('./match.js').normalize;
  module.exports = { parseBggSearch, bggCandidates, parseBggThings, pickBgg };
}
