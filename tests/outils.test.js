// Node « Outils » : code EXACT déployé (bundle), n8n simulé ; réponses BGG réelles enregistrées le 2026-10-31 (allégées).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { classerSuggestions, estEan, pickTopMeca } = require('../lib/outils.js');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const code = execFileSync(process.execPath, [`${__dirname}/../scripts/bundle.mjs`, 'outils'], { encoding: 'utf8' });
const fx = n => JSON.parse(fs.readFileSync(`${__dirname}/fixtures/${n}`, 'utf8'));

// Corps renvoyés en objet : n8n décode lui-même le JSON (vu en production).
function run(query, http) {
  const calls = [];
  const helpers = { httpRequest: async o => { calls.push(o); return http(o); } };
  const $ = () => ({ first: () => ({ json: { query } }) });
  return new AsyncFunction('$', 'URL', 'URLSearchParams', 'module', code)
    .call({ helpers }, $, undefined, undefined, { exports: {} }).then(r => ({ out: r[0].json, calls }));
}
const depuis = rep => o => (rep[o.url] ? { statusCode: 200, body: JSON.parse(rep[o.url]) } : { statusCode: 404, body: '' });

test('jumeaux de Skull King : Skull Queen et Wizard (absent des recommandations BGG), avec la raison en français', async () => {
  const { out, calls } = await run({ op: 'jumeaux', id: '150145' }, depuis(fx('outils-jumeaux-skullking.json')));
  assert.deepEqual(out.jumeaux.map(j => j.titre), ['Skull Queen', 'Wizard']);
  assert.deepEqual(out.jumeaux[1].raison, ['Pari sur ses résultats', 'Plis', 'Gestion de main']);
  assert.ok(out.jumeaux.every(j => j.url.startsWith('https://boardgamegeek.com/boardgame/') && j.score >= 0.2));
  assert.ok(calls.length <= 30 && calls.every(c => c.timeout));
});
test('jumeaux : une liste en panne est ignorée ; fiche du jeu introuvable → erreur lisible', async () => {
  const rep = fx('outils-jumeaux-skullking.json');
  const panne = Object.fromEntries(Object.entries(rep).filter(([u]) => !u.includes('objectid=3006&')));
  const { out } = await run({ op: 'jumeaux', id: '150145' }, depuis(panne));
  assert.ok(Array.isArray(out.jumeaux));
  const ko = await run({ op: 'jumeaux', id: '1' }, depuis({}));
  assert.match(ko.out.erreur, /HTTP 404/);
});
test('extensions d’Abyss : 7, les plus jouées d’abord, avec note', async () => {
  const { out } = await run({ op: 'ext', id: '155987' }, depuis(fx('outils-ext-abyss.json')));
  assert.equal(out.extensions.length, 7);
  assert.deepEqual([out.extensions[0].titre, out.extensions[0].note], ['Abyss: Kraken', 7.7]);
  assert.ok(out.extensions.every((e, i, a) => i === 0 || a[i - 1].votes >= e.votes));
});
test('top de la mécanique Stop ou encore : 20 jeux classés, ordre du classement BGG', async () => {
  const { out } = await run({ op: 'meca', id: '2661' }, depuis(fx('outils-meca-2661.json')));
  assert.equal(out.jeux.length, 20);
  assert.equal(out.jeux[0].titre, 'A Feast for Odin');
  assert.ok(out.jeux.every((j, i, a) => i === 0 || a[i - 1].rang < j.rang));
  assert.deepEqual(pickTopMeca({ items: [{ objectid: 1, name: 'X', rank: null }] }), []);
});
test('paramètres invalides (op inconnu, id vide, code non numérique) → erreur, aucune requête', async () => {
  for (const q of [{ op: 'x' }, { op: 'ext', id: 'abc' }, { op: 'ean', code: '12ab' }]) {
    const { out, calls } = await run(q, () => { throw new Error('pas de réseau'); });
    assert.equal(out.erreur, 'paramètres invalides');
    assert.equal(calls.length, 0);
  }
});
test('code-barres : Philibert d’abord, sinon Esprit Jeu (latin1), sinon null', async () => {
  const ph = fs.readFileSync(`${__dirname}/fixtures/philibert-search-clank.html`, 'utf8');
  const ej = fs.readFileSync(`${__dirname}/fixtures/espritjeu-search-clank.html`);
  const a = await run({ op: 'ean', code: '3760243850066' }, o => ({ statusCode: 200, body: ph }));
  assert.equal(a.out.titre, 'Clank! Catacombes'); // 1er produit de la page (une vraie recherche par EAN n'en renvoie qu'un)
  const b = await run({ op: 'ean', code: '3760243850066' }, o => (o.url.includes('philibert') ? { statusCode: 200, body: '<html></html>' } : ej));
  assert.ok(b.out.titre && /clank/i.test(b.out.titre), b.out.titre);
  const c = await run({ op: 'ean', code: '3760243850066' }, o => (o.url.includes('philibert') ? { statusCode: 200, body: '' } : Buffer.from('')));
  assert.equal(c.out.titre, null);
});
test('suggestions : titres qui commencent par la saisie d’abord, jeux de base avant extensions, 8 max', () => {
  const c = [{ title: 'Skull & Roses', type: 'basegame' }, { title: 'Black Skull Island', type: 'basegame' }, { title: 'Skull King - Extension', type: 'extension' }, { title: 'Skull King', type: 'basegame' }];
  assert.deepEqual(classerSuggestions('skull k', c), ['Skull King', 'Skull King - Extension', 'Skull & Roses', 'Black Skull Island']);
  assert.ok(estEan('3760243850066') && !estEan('123') && !estEan('37602438500a6'));
});
