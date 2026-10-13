// Usage : node scripts/bundle.mjs <bgg-candidats|bgg-fiche|sources>  → affiche le code complet du node Code n8n
// (libs testées + corps du node) : le code testé est le code déployé.
import { readFileSync } from 'node:fs';

const LIBS = {
  'bgg-candidats': ['lib/match.js', 'lib/bgg.js'],
  'bgg-fiche': ['lib/match.js', 'lib/bgg.js'],
  sources: ['lib/match.js', 'lib/jsonld.js', 'lib/okkazeo.js', 'lib/sites.js'],
};
const name = process.argv[2];
if (!LIBS[name]) { console.error('Nodes : ' + Object.keys(LIBS).join(', ')); process.exit(1); }
const root = new URL('..', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const parts = LIBS[name].map(p => `// ---- ${p}\n${read(p)}`);
if (name === 'sources') parts.push(`const CP_PARIS = ${JSON.stringify(JSON.parse(read('lib/cp-paris-10km.json')).cps)};`);
parts.push(`// ---- n8n/code/${name}.body.js\n${read(`n8n/code/${name}.body.js`)}`);
process.stdout.write(parts.join('\n\n'));
