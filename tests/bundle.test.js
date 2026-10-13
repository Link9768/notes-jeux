// Teste le code EXACT déployé dans n8n (libs + corps du node, via scripts/bundle.mjs),
// exécuté hors n8n avec $, $input et this.helpers.httpRequest simulés par les pages enregistrées.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const fx = n => fs.readFileSync(`${__dirname}/fixtures/${n}`, 'utf8');
const bundle = name => execFileSync(process.execPath, [`${__dirname}/../scripts/bundle.mjs`, name], { encoding: 'utf8' });

const EJ_SEARCH = 'https://www.espritjeu.com/dhtml/resultat_recherche.php?keywords=clank';
const EJ_PRODUCT = 'https://www.espritjeu.com/jeux-de-strategie/clank-les-aventuriers-du-deckbuilding.html';
const PH_SEARCH = 'https://www.philibertnet.com/fr/recherche?search_query=clank';
const PH_PRODUCT = 'https://www.philibertnet.com/fr/renegade-game-studios/143836-clank-3760243850066.html';
const OK_SEARCH = 'https://www.okkazeo.com/jeux/resultats?rech_nom=clank';
const OK_PRODUCT = 'https://www.okkazeo.com/jeux/16977/clank';
const ROUTES = {
  [EJ_SEARCH]: 'espritjeu-search-clank.html', [EJ_PRODUCT]: 'espritjeu-product-clank.html',
  [PH_SEARCH]: 'philibert-search-clank.html', [PH_PRODUCT]: 'philibert-product-clank.html',
  [OK_SEARCH]: 'okkazeo-search-clank.html', [OK_PRODUCT]: 'okkazeo-clank.html',
};

function run(name, { nodes, input = {}, http }) {
  const calls = [];
  const $ = n => ({ first: () => ({ json: nodes[n] }) });
  const $input = { first: () => ({ json: input }) };
  const ctx = { helpers: { httpRequest: async o => { calls.push(o); return http(o); } } };
  // Le bac à sable des nodes Code n8n n'a NI URL NI URLSearchParams (vérifié le 2026-10-13) : on les masque.
  return new AsyncFunction('$', '$input', 'URL', 'URLSearchParams', bundle(name))
    .call(ctx, $, $input, undefined, undefined).then(r => ({ out: r[0].json, calls }));
}
const serve = (overrides = {}, routes = ROUTES) => o => {
  if (o.url in overrides) return overrides[o.url];
  if (o.url in routes) {
    const text = fx(routes[o.url]);
    // Esprit Jeu sert ses pages en ISO-8859-1 : n8n ne les lit correctement qu'en arraybuffer + décodage latin1.
    const latin1 = o.url.includes('espritjeu.com');
    return { statusCode: 200, body: latin1 ? (o.encoding === 'arraybuffer' ? Buffer.from(text, 'latin1') : Buffer.from(text, 'latin1').toString('utf8')) : text };
  }
  return { statusCode: 404, body: '' };
};
const sourcesNodes = (q = 'clank') => ({ Webhook: { query: { q } }, 'BGG Fiche': { bgg: { note: 7.7, titre: 'Clank!' } } });

test('sources : les 3 boutiques + annonces Okkazeo filtrées à ≤ 10 km, triées par prix', async () => {
  const { out } = await run('sources', { nodes: sourcesNodes(), http: serve() });
  assert.deepEqual([out.espritjeu.note, out.espritjeu.avis, out.espritjeu.titre], [4.9, 34, 'Clank!']);
  assert.equal(out.philibert.titre, 'Clank!');
  assert.equal(out.philibert.note, null); // Clank! VF : aucun avis
  assert.equal(out.okkazeo.total, 14);
  assert.deepEqual(out.okkazeo.annonces.map(a => a.cp), ['93300', '94220', '75019', '94100']);
  assert.deepEqual(out.okkazeo.annonces.map(a => a.prix), [35, 49, 70, 190]);
  assert.equal(out.bgg.note, 7.7);
  assert.deepEqual(out.erreurs, []);
  assert.ok(out.liens.okkazeo.includes('rech_nom=clank') && out.liens.espritjeu.includes('keywords=clank'));
});
test('sources : « château combo » → titre Esprit Jeu à accents lu via arraybuffer + latin1', async () => {
  const ejSearch = 'https://www.espritjeu.com/dhtml/resultat_recherche.php?keywords=ch%C3%A2teau%20combo';
  const expected = require('../lib/match.js').pickProduct('château combo', require('../lib/sites.js').parseEspritJeuSearch(fx('espritjeu-search-chateau-combo.html')));
  assert.equal(expected.title, 'Château Combo');
  const { calls } = await run('sources', { nodes: sourcesNodes('château combo'), http: serve({}, { [ejSearch]: 'espritjeu-search-chateau-combo.html' }) });
  assert.equal(calls.find(c => c.url === ejSearch).encoding, 'arraybuffer');
  assert.ok(calls.some(c => c.url === expected.url), `la page produit ${expected.url} a été demandée`);
});
test('sources : Okkazeo reçoit les en-têtes navigateur, chaque requête a un timeout', async () => {
  const { calls } = await run('sources', { nodes: sourcesNodes(), http: serve() });
  assert.ok(calls.filter(c => c.url.includes('okkazeo.com')).every(c => c.headers['Sec-Fetch-Dest'] === 'document'));
  assert.ok(calls.every(c => c.timeout === 10000));
});
test('sources : une boutique en 403 → null + erreur, le reste est servi', async () => {
  const { out } = await run('sources', { nodes: sourcesNodes(), http: serve({ [PH_SEARCH]: { statusCode: 403, body: '' } }) });
  assert.equal(out.philibert, null);
  assert.equal(out.espritjeu.note, 4.9);
  assert.equal(out.okkazeo.total, 14);
  assert.equal(out.erreurs.length, 1);
  assert.ok(out.erreurs[0].startsWith('philibert:'));
});
test('sources : erreur non-Error (chaîne) → message lisible, pas « undefined »', async () => {
  const { out } = await run('sources', { nodes: sourcesNodes(), http: o => { if (o.url === PH_SEARCH) throw 'boom'; return serve()(o); } });
  assert.deepEqual(out.erreurs, ['philibert: boom']);
});
test('sources : jeu absent d’Okkazeo → total 0, aucune annonce, pas de crash', async () => {
  const { out } = await run('sources', { nodes: sourcesNodes(), http: serve({ [OK_SEARCH]: { statusCode: 200, body: '<html><p>Aucun résultat</p></html>' } }) });
  assert.deepEqual([out.okkazeo.total, out.okkazeo.annonces], [0, []]);
});
test('sources : requête vide → tout null, aucune requête HTTP', async () => {
  const { out, calls } = await run('sources', { nodes: sourcesNodes(''), http: serve() });
  assert.deepEqual([out.espritjeu, out.philibert, out.okkazeo, out.bgg], [null, null, null, null]);
  assert.deepEqual(out.erreurs, ['q manquant']);
  assert.equal(calls.length, 0);
});
test('sources : requête tronquée à 100 caractères', async () => {
  const { out } = await run('sources', { nodes: sourcesNodes('a'.repeat(300)), http: serve() });
  assert.equal(out.query.length, 100);
});
test('bgg-candidats : ids depuis le XML de recherche, toujours 1 item', async () => {
  const xml = '<items><item type="boardgame" id="201808"><name type="primary" value="Clank!"/></item></items>';
  const { out } = await run('bgg-candidats', { nodes: { Webhook: { query: { q: 'clank' } } }, input: { data: xml } });
  assert.equal(out.ids, '201808');
  const vide = await run('bgg-candidats', { nodes: { Webhook: { query: { q: 'clank' } } }, input: { data: '' } });
  assert.equal(vide.out.ids, '');
});
test('bgg-fiche : fiche si ids, sinon null', async () => {
  const xml = '<items><item type="boardgame" id="201808"><name type="primary" value="Clank!"/><statistics><ratings><usersrated value="10"/><average value="7.75"/></ratings></statistics></item></items>';
  const ok = await run('bgg-fiche', { nodes: { 'BGG Candidats': { ids: '201808' } }, input: { data: xml } });
  assert.equal(ok.out.bgg.note, 7.8);
  const none = await run('bgg-fiche', { nodes: { 'BGG Candidats': { ids: '' } }, input: { data: '' } });
  assert.equal(none.out.bgg, null);
});
