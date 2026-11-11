// node scripts/deploy-node.mjs <workflowId> <nodeName> <bundleName> : remplace seulement parameters.jsCode de ce node.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const [id, nodeName, bundleName] = process.argv.slice(2);
const root = process.cwd();
const env = JSON.parse(readFileSync(root + '/../.mcp.json', 'utf8')).mcpServers['n8n-mcp'].env;
const base = env.N8N_API_URL.replace(/\/+$/, ''), h = { 'X-N8N-API-KEY': env.N8N_API_KEY, 'Content-Type': 'application/json' };
const wf = await (await fetch(`${base}/api/v1/workflows/${id}`, { headers: h })).json();
const node = wf.nodes.find(n => n.name === nodeName);
if (!node) throw new Error('node introuvable');
node.parameters.jsCode = execFileSync(process.execPath, [root + '/scripts/bundle.mjs', bundleName], { encoding: 'utf8' });
const settings = { executionOrder: wf.settings?.executionOrder || 'v1' };
const r = await fetch(`${base}/api/v1/workflows/${id}`, { method: 'PUT', headers: h, body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings }) });
console.log('PUT', r.status, r.ok ? '' : await r.text());
