// node scripts/sauvegarde-cle.mjs <workflowId> : génère la clé, la met dans le node Contrôle, active le workflow.
// La clé n'est jamais affichée : elle est écrite dans ../sauvegarde-cle.txt (gitignoré).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const [id] = process.argv.slice(2);
const root = process.cwd();
const env = JSON.parse(readFileSync(root + '/../.mcp.json', 'utf8')).mcpServers['n8n-mcp'].env;
const base = env.N8N_API_URL.replace(/\/+$/, ''), h = { 'X-N8N-API-KEY': env.N8N_API_KEY, 'Content-Type': 'application/json' };
const fichier = root + '/../sauvegarde-cle.txt';
const cle = existsSync(fichier) ? readFileSync(fichier, 'utf8').trim() : randomBytes(24).toString('hex');
const wf = await (await fetch(`${base}/api/v1/workflows/${id}`, { headers: h })).json();
const n = wf.nodes.find(x => x.name === 'Contrôle');
n.parameters.jsCode = n.parameters.jsCode.replace(/const CLE = '[^']*';/, `const CLE = '${cle}';`);
wf.nodes.find(x => x.name === 'Webhook').onError = 'continueRegularOutput';
const r = await fetch(`${base}/api/v1/workflows/${id}`, { method: 'PUT', headers: h, body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: { executionOrder: wf.settings?.executionOrder || 'v1' } }) });
console.log('PUT', r.status, r.ok ? '' : await r.text());
if (r.ok) {
  writeFileSync(fichier, cle + '\n');
  const a = await fetch(`${base}/api/v1/workflows/${id}/activate`, { method: 'POST', headers: h });
  console.log('activate', a.status, a.ok ? '' : await a.text());
}
