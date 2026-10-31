// Usage : node scripts/outils-live.mjs <op> <id|q|code> [--save fixture.json]
// Exécute le code EXACT du node Outils (bundle) hors n8n avec de vraies requêtes HTTP ;
// --save enregistre les réponses (url → corps) pour les tests hors ligne.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [op, val, flag, fichier] = process.argv.slice(2);
const code = execFileSync(process.execPath, [fileURLToPath(new URL('./bundle.mjs', import.meta.url)), 'outils'], { encoding: 'utf8' });
const query = { op, ...(op === 'suggest' ? { q: val } : op === 'ean' ? { code: val } : { id: val }) };
const enregistre = {};
const httpRequest = async o => {
  const r = await fetch(o.url, { headers: o.headers });
  const buf = Buffer.from(await r.arrayBuffer());
  const texte = buf.toString('utf8');
  if (o.url.includes('api.geekdo.com')) enregistre[o.url] = texte;
  const body = o.encoding === 'arraybuffer' ? buf : texte;
  if (o.returnFullResponse) return { statusCode: r.status, headers: { 'set-cookie': r.headers.getSetCookie() }, body };
  return body;
};
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const $ = () => ({ first: () => ({ json: { query } }) });
const t0 = Date.now();
const out = await new AsyncFunction('$', 'URL', 'URLSearchParams', 'module', code).call({ helpers: { httpRequest } }, $, undefined, undefined, { exports: {} });
console.log(`${op} ${val} : ${Date.now() - t0} ms, ${Object.keys(enregistre).length} requêtes geekdo`);
console.log(JSON.stringify(out[0].json, null, 1).slice(0, 2500));
if (flag === '--save') { writeFileSync(fichier, JSON.stringify(enregistre)); console.log('fixture :', fichier); }
