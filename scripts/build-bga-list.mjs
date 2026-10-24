// Usage : node scripts/build-bga-list.mjs  → régénère lib/bga-games.json (jeux publics de Board Game Arena).
// Source : la page https://boardgamearena.com/gamelist embarque `game_list` (nom technique, titre anglais, alias, bgg_id).
// Format : [[slug, titre, bggId (0 si inconnu), alias...], ...]. À relancer de temps en temps (BGA ajoute des jeux).
import { writeFileSync } from 'node:fs';

const res = await fetch('https://boardgamearena.com/gamelist?section=all', { headers: { 'User-Agent': 'Mozilla/5.0' } });
if (!res.ok) throw new Error('BGA : HTTP ' + res.status);
const html = await res.text();
const start = html.indexOf('[', html.indexOf('"game_list":['));
let depth = 0, end = start;
for (; end < html.length; end++) {
  const c = html[end];
  if (c === '[') depth++;
  else if (c === ']') { if (--depth === 0) break; }
  else if (c === '"') { end++; while (html[end] !== '"') { if (html[end] === '\\') end++; end++; } }
}
const games = JSON.parse(html.slice(start, end + 1)).filter(g => g.status === 'public');
const list = games.map(g => [g.name, g.display_name_en, Number(g.bgg_id) || 0, ...(g.aliases || [])]).sort((a, b) => a[0].localeCompare(b[0]));
writeFileSync(new URL('../lib/bga-games.json', import.meta.url), JSON.stringify(list));
console.log(`${list.length} jeux BGA écrits dans lib/bga-games.json`);
