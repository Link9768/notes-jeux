// Usage : node scripts/verify-deployed.mjs [--export]
// Compare le code des nodes Code déployés dans n8n au bundle local (le code testé est-il le code déployé ?).
// Avec --export : écrit n8n/Notes Jeux API.json. La clé d'API est lue dans ../.mcp.json et jamais affichée.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WORKFLOW_ID = 'wA0aeGJ9Uh0FqKnW';
const NODES = { 'BGG Candidats': 'bgg-candidats', 'BGG Fiche': 'bgg-fiche', Sources: 'sources' };

const mcp = JSON.parse(readFileSync(new URL('../../.mcp.json', import.meta.url), 'utf8')).mcpServers['n8n-mcp'].env;
const base = mcp.N8N_API_URL.replace(/\/+$/, '');
const res = await fetch(`${base}/api/v1/workflows/${WORKFLOW_ID}`, { headers: { 'X-N8N-API-KEY': mcp.N8N_API_KEY } });
if (!res.ok) throw new Error(`n8n API : HTTP ${res.status}`);
const wf = await res.json();

let ko = 0;
for (const [node, bundleName] of Object.entries(NODES)) {
  const deployed = wf.nodes.find(n => n.name === node)?.parameters?.jsCode;
  const local = execFileSync(process.execPath, [fileURLToPath(new URL('./bundle.mjs', import.meta.url)), bundleName], { encoding: 'utf8' });
  const same = deployed === local;
  if (!same) ko++;
  console.log(`${same ? 'IDENTIQUE' : 'DIFFÉRENT '} ${node} (déployé ${deployed?.length} car., local ${local.length} car.)`);
}
if (process.argv.includes('--export')) {
  const out = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings };
  writeFileSync(new URL('../n8n/Notes Jeux API.json', import.meta.url), JSON.stringify(out, null, 2));
  console.log('Export écrit : n8n/Notes Jeux API.json');
}
process.exit(ko ? 1 : 0);
