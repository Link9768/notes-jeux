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
  const $ = n => ({ first: () => ({ json: nodes[n] }), isExecuted: n in nodes });
  const $input = { first: () => ({ json: input }) };
  const ctx = { helpers: { httpRequest: async o => { calls.push(o); return http(o); } } };
  // Le bac à sable des nodes Code n8n n'a NI URL NI URLSearchParams (vérifié le 2026-10-13) : on les masque.
  // Il a en revanche un `module` : les blocs « module.exports » des libs s'y exécutent.
  return new AsyncFunction('$', '$input', 'URL', 'URLSearchParams', 'module', bundle(name))
    .call(ctx, $, $input, undefined, undefined, { exports: {} }).then(r => ({ out: r[0] ? r[0].json : null, calls }));
}
// MyLudo : l'API exige le jeton CSRF de la page d'accueil ET le cookie de session (sinon « Illegal action »).
const MYL = 'https://www.myludo.fr';
const myludoResp = o => {
  if (o.url === MYL + '/') return { statusCode: 200, headers: { 'set-cookie': ['MYLUDO_SESSID=abc123; path=/; HttpOnly'] }, body: '<meta name="csrf-token" content="TOK123">' };
  const ok = o.headers['X-Csrf-Token'] === 'TOK123' && /MYLUDO_SESSID=abc123/.test(o.headers.Cookie || '');
  if (!ok) return { statusCode: 401, body: '{"success":false,"message":"Illegal action"}' };
  const json = n => JSON.parse(fs.readFileSync(`${__dirname}/fixtures/${n}`, 'utf8'));
  if (o.url.includes('/search/')) return { statusCode: 200, body: fs.readFileSync(`${__dirname}/fixtures/myludo-search-clank.json`, 'utf8') };
  if (o.url.includes('/people/datas.php')) { const d = json('myludo-auteur-dennen.json'); return { statusCode: 200, body: { count: d.count, list: d.list } }; }
  if (o.url.includes('type=info')) return { statusCode: 200, body: json('myludo-info-clank.json') };
  if (o.url.includes('/theme/datas.php')) { const t = json('myludo-tags-clank.json')[/id=(\d+)/.exec(o.url)[1]]; return { statusCode: 200, body: { count: t.count, list: t.list } }; }
  const id = /id=(\d+)/.exec(o.url)[1];
  if (id !== '19410') return { statusCode: 200, body: { id, code: 'jeu-' + id, title: 'Jeu ' + id, rating: { game: { audience: 100, note: '7,5' } } } }; // fiche d'un jeu semblable : factice (seule la note est lue)
  return { statusCode: 200, body: json('myludo-game-clank.json') }; // objet déjà parsé : n8n le fait selon le content-type
};
const serve = (overrides = {}, routes = ROUTES) => o => {
  if (o.url in overrides) return overrides[o.url];
  if (o.url.startsWith(MYL)) return myludoResp(o);
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
  assert.deepEqual([out.espritjeu.prix, out.philibert.prix], [54, 57.9]); // prix neuf (JSON-LD offers.price)
  assert.equal(out.okkazeo.total, 14);
  assert.deepEqual(out.okkazeo.annonces.map(a => a.cp), ['93300', '94220', '75019', '94100']);
  assert.deepEqual(out.okkazeo.annonces.map(a => a.prix), [35, 49, 70, 190]);
  assert.equal(out.bgg.note, 7.7);
  assert.deepEqual(out.erreurs, []);
  assert.ok(out.liens.okkazeo.includes('rech_nom=clank') && out.liens.espritjeu.includes('keywords=clank'));
});
const myludoHttp = (extra = {}) => o => (o.url in extra ? extra[o.url] : serve()(o));
test('sources : note de la communauté MyLudo (jeton CSRF + cookie transmis)', async () => {
  const { out, calls } = await run('sources', { nodes: sourcesNodes(), http: myludoHttp() });
  assert.deepEqual([out.myludo.note, out.myludo.avis, out.myludo.titre, out.myludo.url], [8.3, 1500, 'Clank!', 'https://www.myludo.fr/#!/game/clank-19410']);
  assert.deepEqual([out.myludo.joueurs, out.myludo.duree, out.myludo.complexite, out.myludo.annee], ['2 — 4', 60, 2.5, 2017]);
  assert.ok(out.liens.myludo.includes('myludo.fr') && out.liens.myludo.includes('clank'));
  assert.ok(calls.filter(c => c.url.includes('/views/')).every(c => c.headers['X-Requested-With'] === 'XMLHttpRequest'));
});
test('sources : MyLudo → 5 mécaniques et thèmes', async () => {
  const { out } = await run('sources', { nodes: sourcesNodes(), http: myludoHttp() });
  assert.equal(out.myludo.mecaniques.length, 5);
  assert.ok(out.myludo.mecaniques.includes('Deck building'));
  assert.deepEqual(out.myludo.themes, ['Dragons', 'Exploration', 'Médiéval Fantastique']);
  assert.deepEqual(out.erreurs, []);
});
test('sources : liste d’un tag en panne → les autres mécaniques servent, la note reste', async () => {
  const { out } = await run('sources', { nodes: sourcesNodes(), http: o => (o.url.includes('theme/datas.php') && o.url.includes('id=22&') ? { statusCode: 500, body: '' } : myludoHttp()(o)) });
  assert.equal(out.myludo.note, 8.3);
  assert.equal(out.myludo.mecaniques.length, 5);
  assert.ok(!out.myludo.mecaniques.includes('Deck building'));
});
test('sources : fiche détaillée MyLudo en panne → note conservée, mécaniques et auteur null', async () => {
  const { out } = await run('sources', { nodes: sourcesNodes(), http: o => (o.url.includes('type=info') ? { statusCode: 500, body: '' } : myludoHttp()(o)) });
  assert.equal(out.myludo.note, 8.3);
  assert.deepEqual([out.myludo.mecaniques, out.myludo.memeAuteur], [null, null]);
});
test('sources : jeux du même auteur (Paul Dennen), les plus réédités d’abord, sans lire leurs fiches', async () => {
  const { out, calls } = await run('sources', { nodes: sourcesNodes(), http: myludoHttp() });
  assert.equal(out.myludo.memeAuteur.nom, 'Paul Dennen');
  const titres = out.myludo.memeAuteur.jeux.map(j => j.titre);
  assert.deepEqual(titres.slice(0, 2).sort(), ['Dune Imperium', 'Wild Tiled West']);
  assert.equal(titres.length, 4);
  assert.ok(out.myludo.memeAuteur.jeux.every(j => j.url.includes('myludo.fr')));
  assert.equal(calls.filter(c => c.url.includes('game/datas.php?type=game&')).length, 1); // seulement la fiche du jeu : aucune fiche lue pour l’auteur ni les semblables (≈ 1 s chacune)
});
test('sources : liste des jeux de l’auteur en panne → memeAuteur null, les mécaniques restent', async () => {
  const { out } = await run('sources', { nodes: sourcesNodes(), http: o => (o.url.includes('/people/datas.php') ? { statusCode: 500, body: '' } : myludoHttp()(o)) });
  assert.equal(out.myludo.memeAuteur, null);
  assert.equal(out.myludo.mecaniques.length, 5);
});
test('sources : lien BGG direct lu dans la fiche Okkazeo', async () => {
  const { out } = await run('sources', { nodes: sourcesNodes(), http: serve() });
  assert.equal(out.bggUrl, 'https://boardgamegeek.com/boardgame/201808/clank-deck-building-adventure');
});
test('sources : jeu sans annonce Okkazeo → la fiche est quand même lue pour le lien BGG', async () => {
  const sansAnnonce = fx('okkazeo-search-clank.html').replace(/<b>\s*\d+\s+annonces?\s*<\/b>/g, '<b>0 annonce</b>');
  const { out, calls } = await run('sources', { nodes: sourcesNodes(), http: serve({ [OK_SEARCH]: { statusCode: 200, body: sansAnnonce } }) });
  assert.equal(out.okkazeo.total, 0);
  assert.equal(out.bggUrl, 'https://boardgamegeek.com/boardgame/201808/clank-deck-building-adventure');
  assert.ok(calls.some(c => c.url === OK_PRODUCT));
});
const RECS = 'https://api.geekdo.com/api/geekitem/recs?objectid=201808&objecttype=thing';
const avecBgg = (q = 'clank') => ({ ...sourcesNodes(q), 'BGG Fiche': { bgg: { note: 7.8, titre: 'Clank!: A Deck-Building Adventure', url: 'https://boardgamegeek.com/boardgame/201808' } } });
test('sources : jeux similaires = recommandations BGG du jeu retenu par BGG', async () => {
  // Corps déjà décodé en objet : c'est ce que fait n8n pour une réponse application/json (vu en production le 2026-10-31).
  const { out, calls } = await run('sources', { nodes: avecBgg(), http: o => (o.url === RECS ? { statusCode: 200, body: JSON.parse(fs.readFileSync(`${__dirname}/fixtures/bgg-recs-clank.json`, 'utf8')) } : myludoHttp()(o)) });
  assert.deepEqual(out.similaires.map(s => s.titre), ['Terraforming Mars: Ares Expedition', 'Everdell', 'Scythe', 'Small World', 'Sheriff of Nottingham']);
  assert.ok(out.similaires.every(s => s.url.startsWith('https://boardgamegeek.com/boardgame/') && s.note > 6));
  assert.ok(calls.find(c => c.url === RECS).headers.Authorization === undefined); // sans token
  assert.deepEqual(out.erreurs, []);
  const texte = await run('sources', { nodes: avecBgg(), http: o => (o.url === RECS ? { statusCode: 200, body: fs.readFileSync(`${__dirname}/fixtures/bgg-recs-clank.json`, 'utf8') } : myludoHttp()(o)) });
  assert.equal(texte.out.similaires.length, 5); // corps en texte : accepté aussi
});
test('sources : recommandations BGG en panne → similaires null + erreur, le reste est servi ; sans fiche BGG → null sans appel', async () => {
  const { out } = await run('sources', { nodes: avecBgg(), http: o => (o.url === RECS ? { statusCode: 500, body: '' } : myludoHttp()(o)) });
  assert.equal(out.similaires, null);
  assert.ok(out.erreurs.some(e => e.startsWith('bgg-recs:')), JSON.stringify(out.erreurs));
  assert.equal(out.myludo.note, 8.3);
  const sans = await run('sources', { nodes: sourcesNodes(), http: myludoHttp() });
  assert.equal(sans.out.similaires, null);
  assert.ok(!sans.calls.some(c => c.url.includes('geekitem/recs')));
});
test('sources : MyLudo en panne → null + erreur, le reste est servi', async () => {
  const { out } = await run('sources', { nodes: sourcesNodes(), http: myludoHttp({ [MYL + '/']: { statusCode: 403, body: '' } }) });
  assert.equal(out.myludo, null);
  assert.ok(out.erreurs.some(e => e.startsWith('myludo:')), JSON.stringify(out.erreurs));
  assert.equal(out.espritjeu.note, 4.9);
});
test('sources : MyLudo sans jeton CSRF dans la page → erreur claire, pas de crash', async () => {
  const { out } = await run('sources', { nodes: sourcesNodes(), http: myludoHttp({ [MYL + '/']: { statusCode: 200, headers: {}, body: '<html></html>' } }) });
  assert.equal(out.myludo, null);
  assert.ok(out.erreurs.some(e => /myludo: .*(jeton|csrf)/i.test(e)), JSON.stringify(out.erreurs));
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
test('sources : jeu absent d’Okkazeo (vraie page « Aucun jeu ne correspond ») → total 0, aucune annonce, pas de crash', async () => {
  const { out } = await run('sources', { nodes: sourcesNodes(), http: serve({ [OK_SEARCH]: { statusCode: 200, body: fx('okkazeo-search-vide.html') } }) });
  assert.deepEqual([out.okkazeo.total, out.okkazeo.annonces], [0, []]);
});
test('sources : page Okkazeo inattendue (200 sans résultat ni « aucun jeu ») → indisponible, pas « 0 annonce »', async () => {
  const { out } = await run('sources', { nodes: sourcesNodes(), http: serve({ [OK_SEARCH]: { statusCode: 200, body: '<html><title>Verification</title><p>Please wait</p></html>' } }) });
  assert.equal(out.okkazeo, null);
  assert.ok(out.erreurs.some(e => e.startsWith('okkazeo:')), JSON.stringify(out.erreurs));
});
test('sources : plusieurs éditions Okkazeo au même titre → annonces additionnées, édition vide ignorée, bouton vers la recherche', async () => {
  const search = 'https://www.okkazeo.com/jeux/resultats?rech_nom=dixit%3A%20odyssey';
  const routes = {
    [search]: 'okkazeo-search-dixit-odyssey.html',
    'https://www.okkazeo.com/jeux/85748/dixit-odyssey': 'okkazeo-dixit-85748.html',
    'https://www.okkazeo.com/jeux/90287/dixit-odyssey': 'okkazeo-dixit-90287.html',
  };
  const { out, calls } = await run('sources', { nodes: sourcesNodes('dixit: odyssey'), http: serve({}, routes) });
  const { extractJsonLd, findProduct, offersOf } = require('../lib/jsonld.js');
  const attendu = ['okkazeo-dixit-85748.html', 'okkazeo-dixit-90287.html'].map(f => offersOf(findProduct(extractJsonLd(fx(f)))));
  assert.equal(out.okkazeo.total, attendu[0].total + attendu[1].total);
  assert.equal(out.okkazeo.min, Math.min(attendu[0].min, attendu[1].min));
  assert.equal(out.okkazeo.max, Math.max(attendu[0].max, attendu[1].max));
  assert.equal(out.okkazeo.url, search);
  assert.ok(!calls.some(c => c.url.includes('/jeux/7028/')), 'l\'édition sans annonce n\'est pas demandée');
  assert.ok(out.okkazeo.total > 0);
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
// Matchmaking : pages Okkazeo enregistrées, pseudos (anonymisés en « vendeur ») remplacés dans l'ordre par des noms choisis.
const renomme = (html, noms) => { let i = 0; return html.replace(/<b>vendeur<\/b>/g, () => `<b>${noms[i++] || 'autre-' + i + '-' + Math.random()}</b>`); };
const OK_DIXIT = 'https://www.okkazeo.com/jeux/resultats?rech_nom=dixit%3A%20odyssey';
const panierHttp = o => {
  const pages = {
    [OK_SEARCH]: fx('okkazeo-search-clank.html'),
    [OK_PRODUCT]: renomme(fx('okkazeo-clank.html'), ['Alice', 'Bob']),
    [OK_DIXIT]: fx('okkazeo-search-dixit-odyssey.html'),
    'https://www.okkazeo.com/jeux/85748/dixit-odyssey': renomme(fx('okkazeo-dixit-85748.html'), ['Alice']),
    'https://www.okkazeo.com/jeux/90287/dixit-odyssey': renomme(fx('okkazeo-dixit-90287.html'), ['Bob']),
    'https://www.okkazeo.com/jeux/resultats?rech_nom=azertyuiop': fx('okkazeo-search-vide.html'),
  };
  if (o.url.includes('/annonces/')) return { statusCode: 200, body: '<a href="/membres/X/annonces"><span class="nb_annonces"><i class="fas fa-tags"></i> 35</span> annonces en ligne</a>' }; // page d'annonce : total du vendeur
  return o.url in pages ? { statusCode: 200, body: pages[o.url] } : { statusCode: 404, body: '' };
};
const panierNodes = jeux => ({ Webhook: { query: { jeux } } });
test('panier : vendeurs qui ont plusieurs jeux de la liste (Alice et Bob ont Clank! et Dixit Odyssey)', async () => {
  const { out, calls } = await run('panier', { nodes: panierNodes('clank|dixit: odyssey|azertyuiop'), http: panierHttp });
  assert.deepEqual(out.vendeurs.map(v => v.vendeur).sort(), ['Alice', 'Bob']);
  assert.ok(out.vendeurs.every(v => v.nbJeux === 2 && v.annonces.every(a => a.url.startsWith('https://www.okkazeo.com/annonces/'))));
  assert.deepEqual(out.vendeurs[0].annonces.map(a => a.jeu).sort(), ['Clank!', 'Dixit Odyssey']);
  assert.deepEqual(out.jeux.map(j => [j.demande, j.titre, j.annonces]), [['clank', 'Clank!', 14], ['dixit: odyssey', 'Dixit Odyssey', out.jeux[1].annonces], ['azertyuiop', null, 0]]);
  assert.ok(out.jeux[1].annonces > 0);
  assert.ok(out.vendeurs.every(v => v.nbAnnonces === 35), "total d'annonces du vendeur");
  assert.deepEqual(out.erreurs, []);
  assert.ok(calls.every(c => c.headers['Sec-Fetch-Dest'] === 'document' && c.timeout === 10000));
});
test('panier : jeux à sécuriser (secu) → encart des vendeurs qui ont tous ces jeux ; introuvable signalé', async () => {
  const q = secu => ({ Webhook: { query: { jeux: 'azertyuiop', secu } } });
  const a = await run('panier', { nodes: q('clank|dixit: odyssey'), http: panierHttp });
  assert.deepEqual(a.out.securises.jeux.sort(), ['Clank!', 'Dixit Odyssey']);
  assert.deepEqual(a.out.securises.vendeurs.map(v => v.vendeur).sort(), ['Alice', 'Bob']);
  assert.ok(a.out.securises.vendeurs.every(v => v.nbAnnonces === 35));
  const z = await run('panier', { nodes: q('clank|azertyuiop'), http: panierHttp });
  assert.deepEqual(z.out.securises.introuvables, ['azertyuiop']);
  assert.deepEqual(z.out.securises.vendeurs, []);
  const sans = await run('panier', { nodes: panierNodes('clank|dixit: odyssey'), http: panierHttp });
  assert.equal(sans.out.securises, undefined);
});
test('panier : un jeu en panne (404) → erreur pour ce jeu, les autres servent', async () => {
  const { out } = await run('panier', { nodes: panierNodes('clank|dixit: odyssey'), http: o => (o.url === OK_DIXIT ? { statusCode: 404, body: '' } : panierHttp(o)) });
  assert.equal(out.jeux[0].annonces, 14);
  assert.equal(out.jeux[1].titre, null);
  assert.ok(out.erreurs[0].startsWith('dixit: odyssey:'), JSON.stringify(out.erreurs));
  assert.deepEqual(out.vendeurs, []);
  assert.equal(out.bloque, undefined);
});
// Coupe-circuit : au 1er blocage Okkazeo (403/429/503, challenge, page inattendue), plus aucune requête ; les jeux restants sont « non vérifiés ».
const avecStatique = async (statique, f) => { globalThis.$getWorkflowStaticData = () => statique; try { return await f(); } finally { delete globalThis.$getWorkflowStaticData; } };
test('panier : 403 sur la 1re recherche → coupe-circuit, 1 seule requête, jeux non vérifiés, pas d’erreur', async () => {
  const { out, calls } = await run('panier', { nodes: { Webhook: { query: { jeux: 'dixit: odyssey|clank|azertyuiop', total: '100' } } }, http: () => ({ statusCode: 403, body: '' }) });
  assert.equal(calls.length, 1);
  assert.equal(out.bloque, true);
  assert.equal(out.jeux.length, 3);
  assert.ok(out.jeux.every(j => j.titre === null && j.nonVerifie === true));
  assert.deepEqual(out.erreurs, []);
  assert.deepEqual(out.vendeurs, []);
});
test('panier : page de challenge servie en 200 (« Just a moment ») → bloqué, aucune requête de fiche', async () => {
  const { out, calls } = await run('panier', { nodes: panierNodes('clank|dixit: odyssey'), http: () => ({ statusCode: 200, body: '<html><head><title>Just a moment...</title></head></html>' }) });
  assert.equal(out.bloque, true);
  assert.ok(calls.every(c => c.url.includes('/jeux/resultats')));
});
test('panier : page de recherche inattendue (200 sans résultat) → bloqué', async () => {
  const { out, calls } = await run('panier', { nodes: { Webhook: { query: { jeux: 'clank|dixit: odyssey', total: '100' } } }, http: () => ({ statusCode: 200, body: '<html>maintenance</html>' }) });
  assert.equal(out.bloque, true);
  assert.equal(calls.length, 1);
  assert.ok(out.jeux.every(j => j.nonVerifie));
});
test('panier : blocage après des jeux en mémoire → jeux mémorisés servis, le reste non vérifié, rien mémorisé pour lui', async () => {
  const statique = {};
  await avecStatique(statique, async () => {
    const a = await run('panier', { nodes: panierNodes('clank|dixit: odyssey'), http: panierHttp });
    assert.equal(a.out.bloque, undefined);
    const b = await run('panier', { nodes: panierNodes('clank|dixit: odyssey|azertyuiop'), http: () => ({ statusCode: 403, body: '' }) });
    assert.equal(b.calls.length, 1);
    assert.equal(b.out.bloque, true);
    assert.deepEqual(b.out.jeux.map(j => [j.demande, j.titre, !!j.nonVerifie]), [['clank', 'Clank!', false], ['dixit: odyssey', 'Dixit Odyssey', false], ['azertyuiop', null, true]]);
    assert.ok(!('azertyuiop' in statique.panier));
  });
});
test('panier : plus de 64 jeux (total) → 1 requête par seconde, un seul jeu à la fois', async () => {
  const t = [];
  const { out } = await run('panier', { nodes: { Webhook: { query: { jeux: 'clank|azertyuiop', total: '100' } } }, http: o => { t.push(Date.now()); return panierHttp(o); } });
  assert.equal(t.length, 3); // 2 recherches + la fiche de Clank!
  for (let i = 1; i < t.length; i++) assert.ok(t[i] - t[i - 1] >= 950, `écart ${t[i] - t[i - 1]} ms`);
  assert.equal(out.bloque, undefined);
});
test('panier : appel intermédiaire (total > jeux de ce paquet) → pas de lecture du total d’annonces des vendeurs', async () => {
  const q = total => ({ Webhook: { query: { jeux: 'clank|dixit: odyssey', total } } });
  const inter = await run('panier', { nodes: q('5'), http: panierHttp });
  assert.ok(!inter.calls.some(c => c.url.includes('/annonces/')));
  assert.ok(inter.out.vendeurs.length > 0 && inter.out.vendeurs.every(v => v.nbAnnonces === undefined));
  const fin = await run('panier', { nodes: q('2'), http: panierHttp });
  assert.ok(fin.out.vendeurs.every(v => v.nbAnnonces === 35));
});
test('panier et encart Okkazeo : rien au pluriel → nouvel essai au singulier (« clanks » → « clank »)', async () => {
  const pluriel = 'https://www.okkazeo.com/jeux/resultats?rech_nom=clanks';
  const vide = { statusCode: 200, body: fx('okkazeo-search-vide.html') };
  const p = await run('panier', { nodes: panierNodes('clanks|dixit: odyssey'), http: o => (o.url === pluriel ? vide : panierHttp(o)) });
  assert.equal(p.out.jeux[0].titre, 'Clank!');
  assert.ok(p.calls.some(c => c.url === pluriel) && p.calls.some(c => c.url === OK_SEARCH));
  const s = await run('sources', { nodes: sourcesNodes('clanks'), http: serve({ [pluriel]: vide }) });
  assert.equal(s.out.okkazeo.total, 14);
});
test('panier : moins de 2 jeux → aucune requête', async () => {
  const { out, calls } = await run('panier', { nodes: panierNodes('clank'), http: panierHttp });
  assert.deepEqual(out.erreurs, ['au moins 2 jeux']);
  assert.equal(calls.length, 0);
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
  const ok = await run('bgg-fiche', { nodes: { 'BGG Candidats': { ids: '201808' }, Webhook: { query: { q: 'clank' } } }, input: { data: xml } });
  assert.equal(ok.out.bgg.note, 7.8);
  const none = await run('bgg-fiche', { nodes: { 'BGG Candidats': { ids: '' }, Webhook: { query: { q: 'clank' } } }, input: { data: '' } });
  assert.equal(none.out.bgg, null);
  const abyss = await run('bgg-fiche', { nodes: { 'BGG Candidats': { ids: '155987' }, Webhook: { query: { q: 'abyss' } } }, input: { data: fx('bgg-thing-abyss.xml') } });
  assert.deepEqual([abyss.out.bgg.mecaniques.length + abyss.out.bgg.themes.length, abyss.out.bgg.mecaniques[0].nom], [9, 'Enchères']);
  assert.deepEqual([abyss.out.bgg.rang, abyss.out.bgg.ideal, abyss.out.bgg.extensions], [453, '4', 7]);
});
test('BGG saturé (« Rate limit exceeded », réponse réelle du 2026-11-28) : signalé jusqu’à la sortie de Sources', async () => {
  const rl = '<error>\n    <message>Rate limit exceeded.</message>\n</error>';
  const c = await run('bgg-candidats', { nodes: { Webhook: { query: { q: 'stew' } } }, input: { data: rl } });
  assert.deepEqual([c.out.ids, c.out.sature], ['', true]);
  const f1 = await run('bgg-fiche', { nodes: { 'BGG Candidats': { ids: '', sature: true }, Webhook: { query: { q: 'stew' } } }, input: { data: '' } });
  assert.deepEqual([f1.out.bgg, f1.out.sature], [null, true]);
  const f2 = await run('bgg-fiche', { nodes: { 'BGG Candidats': { ids: '242324' }, Webhook: { query: { q: 'stew' } } }, input: { data: rl } });
  assert.deepEqual([f2.out.bgg, f2.out.sature], [null, true]);
  const ok = await run('bgg-fiche', { nodes: { 'BGG Candidats': { ids: '' }, Webhook: { query: { q: 'zzz' } } }, input: { data: '' } });
  assert.equal(ok.out.sature, false);
  const s = await run('sources', { nodes: { Webhook: { query: { q: 'clank' } }, 'BGG Fiche': { bgg: null, sature: true } }, http: serve() });
  assert.equal(s.out.bggSature, true);
  assert.ok(s.out.erreurs.some(e => e.startsWith('bgg: saturé')));
  const n = await run('sources', { nodes: sourcesNodes(), http: serve() });
  assert.equal(n.out.bggSature, false);
});
test('panier : 15 jeux ou moins → pas de pause entre les requêtes', async () => {
  const t = [];
  await run('panier', { nodes: panierNodes('clank|dixit: odyssey'), http: o => { t.push(Date.now()); return panierHttp(o); } });
  assert.ok(t[t.length - 1] - t[0] < 300, `${t[t.length - 1] - t[0]} ms`);
});
test('panier : plus de 15 jeux → requêtes Okkazeo espacées d’au moins 0,4 s ; jeu déjà cherché dans l’heure → aucune requête (mémoire du workflow)', async () => {
  const statique = {};
  globalThis.$getWorkflowStaticData = () => statique;
  try {
    const t = [];
    const autres = Array.from({ length: 14 }, (_, i) => 'azertyuiop' + i).join('|'); // 16 jeux au total : mode prudent
    const a = await run('panier', { nodes: panierNodes('clank|dixit: odyssey|' + autres), http: o => { t.push(Date.now()); return panierHttp(o); } });
    assert.ok(t.length >= 16);
    const moyenne = (t[t.length - 1] - t[0]) / (t.length - 1); // créneaux fixes de 0,4 s : un écart isolé peut être un peu plus court si le précédent est parti en retard
    assert.ok(moyenne >= 395, `écart moyen ${moyenne} ms`);
    for (let i = 1; i < t.length; i++) assert.ok(t[i] - t[i - 1] >= 300, `écart ${t[i] - t[i - 1]} ms`);
    const b = await run('panier', { nodes: panierNodes('Clank|dixit: odyssey'), http: panierHttp });
    assert.equal(b.calls.length, 0);
    assert.deepEqual(b.out.vendeurs, a.out.vendeurs);
    assert.equal(b.out.jeux[0].demande, 'Clank');
    statique.panier[Object.keys(statique.panier)[0]].t -= 61 * 60 * 1000; // plus d'une heure → recherché à nouveau
    const c = await run('panier', { nodes: panierNodes('clank|dixit: odyssey'), http: panierHttp });
    assert.ok(c.calls.length > 0);
  } finally { delete globalThis.$getWorkflowStaticData; }
});
test('sources : médiane France des annonces lues (14 annonces → 40,55 €), null si moins de 3', async () => {
  const { out } = await run('sources', { nodes: sourcesNodes(), http: serve() });
  assert.equal(out.okkazeo.mediane, 40.55);
  const vide = await run('sources', { nodes: sourcesNodes('azertyuiop'), http: serve({ 'https://www.okkazeo.com/jeux/resultats?rech_nom=azertyuiop': { statusCode: 200, body: fx('okkazeo-search-vide.html') } }) });
  assert.equal(vide.out.okkazeo.mediane, null);
});
// Veille : mêmes pages Okkazeo que le Panier ; les titres suivis (« Clank! », « Dixit Odyssey ») sont routés vers les pages enregistrées.
const veilleHttp = o => {
  if (o.url.includes('rech_nom=Clank')) return panierHttp({ ...o, url: OK_SEARCH });
  if (o.url.includes('rech_nom=Dixit')) return panierHttp({ ...o, url: OK_DIXIT });
  return panierHttp(o);
};
const veilleSuivis = [{ titre: 'Clank!' }, { titre: 'Dixit Odyssey' }];
async function runVeille(nodes, http, statique) {
  globalThis.$getWorkflowStaticData = () => statique;
  try { return await run('veille', { nodes, http }); } finally { delete globalThis.$getWorkflowStaticData; }
}
test('veille : jeux suivis → message Telegram (vendeurs communs), historique, annonces signalées une seule fois', async () => {
  const statique = { veille: { chatId: 42 } };
  const t = [];
  const a = await runVeille({ 'Lire sauvegarde': { suivis: veilleSuivis } }, o => { t.push(Date.now()); return veilleHttp(o); }, statique);
  assert.equal(a.out.chatId, 42);
  assert.ok(a.out.texte.includes('Vendeurs qui ont plusieurs de tes jeux suivis'), a.out.texte);
  assert.ok(a.out.texte.includes('Alice') && a.out.texte.includes('Bob'));
  assert.equal(statique.veille.histo['clank!'].pts[0][3], 14);
  assert.ok(statique.veille.histo['dixit odyssey'].pts[0][3] > 0);
  assert.ok(a.calls.every(c => c.headers['Sec-Fetch-Dest'] === 'document'));
  for (let i = 1; i < t.length; i++) assert.ok(t[i] - t[i - 1] >= 300, `écart ${t[i] - t[i - 1]} ms`);
  assert.ok(Object.keys(statique.veille.signalees).some(k => k.startsWith('v:alice:')));
  assert.equal(statique.veille.derniere.jeux, 2);
  const b = await runVeille({ 'Lire sauvegarde': { suivis: veilleSuivis } }, veilleHttp, statique); // tout est déjà signalé
  assert.equal(b.out, null);
  assert.equal(statique.veille.histo['clank!'].pts.length, 1); // même jour : remplacé
});
test('veille : Okkazeo bloque (403 partout) → message de panne après 3 échecs, rien enregistré', async () => {
  const statique = { veille: { chatId: 42 } };
  const suivis = ['A', 'B', 'C', 'D'].map(titre => ({ titre }));
  const r = await runVeille({ 'Lire sauvegarde': { suivis } }, () => ({ statusCode: 403, body: '' }), statique);
  assert.ok(r.out.texte.includes('Okkazeo ne répond pas') && r.out.texte.includes('HTTP 403'), r.out.texte);
  assert.equal(r.calls.length, 3);
  assert.deepEqual([statique.veille.histo, statique.veille.signalees, statique.veille.derniere], [{}, {}, undefined]);
});
test('veille : sans chat inscrit → rien envoyé, historique enregistré, rien de signalé', async () => {
  const statique = {};
  const r = await runVeille({ 'Lire sauvegarde': { suivis: veilleSuivis } }, veilleHttp, statique);
  assert.equal(r.out, null);
  assert.equal(statique.veille.histo['clank!'].pts[0][3], 14);
  assert.deepEqual(statique.veille.signalees, {});
});
test('veille : lancée par /veille sans nouveauté → « Rien de nouveau » ; sans jeu suivi → message ; Drive en erreur → message', async () => {
  const statique = { veille: { chatId: 42, signalees: {} } };
  const un = { 'Lire sauvegarde': { suivis: [{ titre: 'Clank!', max: 1 }] }, Inscription: { lancer: true } };
  const a = await runVeille(un, veilleHttp, statique);
  assert.equal(a.out.texte, 'Rien de nouveau · 1 jeux vérifiés.');
  const b = await runVeille({ 'Lire sauvegarde': { listes: [] }, Inscription: { lancer: true } }, veilleHttp, statique);
  assert.ok(b.out.texte.startsWith('Aucun jeu suivi'));
  const c = await runVeille({ 'Lire sauvegarde': { listes: [] } }, veilleHttp, statique);
  assert.equal(c.out, null); // planifié, rien à suivre : silence
  const d = await runVeille({ 'Lire sauvegarde': { error: { message: 'HTTP 500' } } }, veilleHttp, statique);
  assert.ok(d.out.texte.includes('sauvegarde Drive illisible') && d.out.texte.includes('HTTP 500'));
});
test('veille-inscription : /start verrouille le premier chat, /veille et /stop réservés à ce chat', async () => {
  const statique = {};
  const cmd = async (id, text) => { globalThis.$getWorkflowStaticData = () => statique; try { return (await run('veille-inscription', { nodes: {}, input: { message: { chat: { id }, text } }, http: () => null })).out; } finally { delete globalThis.$getWorkflowStaticData; } };
  assert.match((await cmd(42, '/start')).texte, /Alertes Notes Jeux activées/);
  assert.equal(statique.veille.chatId, 42);
  assert.equal(await cmd(99, '/start'), null);
  assert.equal(statique.veille.chatId, 42);
  assert.deepEqual(await cmd(42, '/veille'), { lancer: true });
  assert.equal(await cmd(99, '/veille'), null);
  assert.match((await cmd(42, 'salut')).texte, /Commandes/);
  assert.match((await cmd(42, '/stop')).texte, /désactivées/);
  assert.equal(statique.veille.chatId, undefined);
  assert.equal((await cmd(99, '/start')).chatId, 99); // chat libéré : un autre peut s'inscrire
});
test('veille-histo : historique du jeu (casse et espaces ignorés), inconnu → pts vide', async () => {
  const statique = { veille: { histo: { 'clank!': { titre: 'Clank!', okk: 'Clank!', pts: [['2026-11-28', 26, 15, 12]] } }, derniere: { jeux: 1 } } };
  const h = async jeu => { globalThis.$getWorkflowStaticData = () => statique; try { return (await run('veille-histo', { nodes: { Webhook: { query: { jeu } } }, http: () => null })).out; } finally { delete globalThis.$getWorkflowStaticData; } };
  assert.deepEqual(await h(' CLANK! '), { titre: 'Clank!', okk: 'Clank!', pts: [['2026-11-28', 26, 15, 12]], maj: { jeux: 1 } });
  assert.deepEqual(await h('inconnu'), { pts: [], maj: { jeux: 1 } });
});
test('sources : version duo intégrable (Res Arcana → Res Arcana Duo) ; geekitems en panne → duo null sans erreur', async () => {
  const DUO = JSON.parse(fx('bgg-geekitems-duo.json'));
  const gi = id => `https://api.geekdo.com/api/geekitems?objectid=${id}&objecttype=thing&nosession=1`;
  const nodes = { Webhook: { query: { q: 'clank' } }, 'BGG Fiche': { bgg: { note: 7.6, titre: 'Res Arcana', url: 'https://boardgamegeek.com/boardgame/262712' } } };
  const over = Object.fromEntries(Object.keys(DUO).map(id => [gi(id), { statusCode: 200, body: DUO[id] }]));
  // Stats réelles de Res Arcana relevées le 2026-11-11 (dynamicinfo).
  over['https://api.geekdo.com/api/dynamicinfo?objectid=262712&objecttype=thing'] = { statusCode: 200, body: JSON.stringify({ item: { stats: { numplays: '168060', numowned: '35687' } } }) };
  const { out } = await run('sources', { nodes, http: serve(over) });
  assert.deepEqual(out.duo, { titre: 'Res Arcana Duo', url: 'https://boardgamegeek.com/boardgame/427345/res-arcana-duo', integrable: true });
  assert.equal(out.rejouabilite.parties, 4.7);
  assert.equal(out.rejouabilite.niveau, 'forte');
  const panne = await run('sources', { nodes, http: serve() });
  assert.equal(panne.out.duo, null);
  assert.equal(panne.out.rejouabilite, null);
  assert.ok(!panne.out.erreurs.some(e => /duo|geekitems/.test(e)), JSON.stringify(panne.out.erreurs));
});

test('sources : homonymes MyLudo (aucun pour Clank), jeu choisi par id (ml) → sa fiche est lue', async () => {
  const sans = await run('sources', { nodes: sourcesNodes(), http: myludoHttp() });
  assert.equal(sans.out.myludo.id, '19410');
  assert.equal(sans.out.myludo.homonymes, null, 'un seul Clank! de base : pas de ligne');
  const autre = JSON.parse(fx('myludo-search-clank.json')).list.find(g => g.type === 'basegame' && String(g.id) !== '19410');
  const { out, calls } = await run('sources', { nodes: { Webhook: { query: { q: 'clank', ml: ' ' + autre.id + 'x' } }, 'BGG Fiche': { bgg: null } }, http: myludoHttp() });
  assert.equal(out.myludo.id, String(autre.id), 'le jeu choisi remplace le choix automatique');
  assert.ok(calls.some(c => c.url.includes('type=game&id=' + autre.id)));
  const faux = await run('sources', { nodes: { Webhook: { query: { q: 'clank', ml: '999999' } }, 'BGG Fiche': { bgg: null } }, http: myludoHttp() });
  assert.equal(faux.out.myludo.id, '19410', 'id inconnu : choix normal');
});

test('bgg-fiche : année choisie (homonymes) → le jeu de cette année, sans année → le plus voté', async () => {
  const th = (id, an, votes) => '<item type="boardgame" id="' + id + '"><name type="primary" value="Loop"/><yearpublished value="' + an + '"/><statistics><ratings><usersrated value="' + votes + '"/></ratings></statistics></item>';
  const data = '<items>' + th(407173, 2023, 123) + th(500001, 2025, 4) + '</items>';
  const run1 = an => run('bgg-fiche', { nodes: { 'BGG Candidats': { ids: '407173,500001' }, Webhook: { query: { q: 'loop', ...(an ? { an } : {}) } } }, input: { data } });
  assert.equal((await run1()).out.bgg.id, '407173');
  assert.equal((await run1('2025')).out.bgg.id, '500001');
  assert.equal((await run1('abc')).out.bgg.id, '407173', 'année illisible : choix normal');
});

// Trois jeux « Loop » de base chez trois éditeurs (ids 11, 22, 33) : l'éditeur tapé choisit le jeu, les éditeurs sont affichés.
const LOOPS = [{ id: 11, an: 2023, ed: 'Brainbraingames' }, { id: 22, an: 2026, ed: 'Yellow Mountain Editions' }, { id: 33, an: 2021, ed: 'Autre Éditeur' }];
const loopHttp = o => {
  if (o.url === MYL + '/') return myludoResp(o);
  if (o.url.includes('/search/')) return { statusCode: 200, body: { list: LOOPS.map(l => ({ id: l.id, code: 'loop-' + l.id, title: 'Loop', edition: l.an, type: 'basegame' })) } };
  const id = Number(/id=(\d+)/.exec(o.url)[1]), l = LOOPS.find(x => x.id === id);
  if (o.url.includes('type=info')) return { statusCode: 200, body: { themes: { mecanisme: {}, theme: {} }, people: { p1: { id: 9, title: l.ed, roles: ['Éditeur'] } } } };
  if (o.url.includes('type=game')) return { statusCode: 200, body: { id, code: 'loop-' + id, title: 'Loop', edition: l.an, rating: { game: { audience: 10, note: '7,0' } } } };
  return { statusCode: 404, body: '' };
};
const runLoop = query => run('sources', { nodes: { Webhook: { query: { q: 'loop', ...query } }, 'BGG Fiche': { bgg: null } }, http: loopHttp });

test('sources : éditeurs des jeux au même titre, éditeur tapé → le jeu de cet éditeur, choix explicite prioritaire', async () => {
  const base = await runLoop({});
  assert.equal(base.out.myludo.id, '11', 'sans éditeur : le premier du site');
  assert.deepEqual(base.out.myludo.homonymes.map(h => [h.annee, h.editeurs[0]]), [[2026, 'Yellow Mountain Editions'], [2023, 'Brainbraingames'], [2021, 'Autre Éditeur']]);
  assert.equal((await runLoop({ ed: 'Yellow' })).out.myludo.id, '22');
  assert.equal((await runLoop({ ed: 'Yellow' })).out.editeurOk, true, 'l’éditeur tapé correspond à un jeu');
  assert.equal((await runLoop({ ed: 'Zzz' })).out.editeurOk, false);
  assert.equal((await runLoop({})).out.editeurOk, false);
  assert.equal((await runLoop({ ed: 'autre editeur' })).out.myludo.id, '33');
  assert.equal((await runLoop({ ed: 'Zzz' })).out.myludo.id, '11', 'éditeur inconnu : choix normal');
  assert.equal((await runLoop({ ed: 'Yellow', ml: '33' })).out.myludo.id, '33', 'le jeu cliqué dans la ligne l\u2019emporte');
  const sansDoublon = await run('sources', { nodes: sourcesNodes(), http: myludoHttp() });
  assert.equal(sansDoublon.out.myludo.homonymes, null);
});

test('bgg-fiche : éditeur tapé → jeu de cet éditeur, editeurOk', async () => {
  const th = (id, an, votes, ed) => '<item type="boardgame" id="' + id + '"><name type="primary" value="Loop"/><yearpublished value="' + an + '"/><link type="boardgamepublisher" id="9" value="' + ed + '"/><statistics><ratings><usersrated value="' + votes + '"/></ratings></statistics></item>';
  const data = '<items>' + th(407173, 2023, 123, 'Brainbraingames') + th(475385, 2026, 35, 'Yellow Mountain Editions') + '</items>';
  const run1 = ed => run('bgg-fiche', { nodes: { 'BGG Candidats': { ids: '407173,475385' }, Webhook: { query: { q: 'loop', ...(ed ? { ed } : {}) } } }, input: { data } });
  const a = (await run1('Yellow')).out.bgg;
  assert.deepEqual([a.id, a.editeurOk], ['475385', true]);
  const b = (await run1()).out.bgg;
  assert.deepEqual([b.id, b.editeurOk], ['407173', undefined]);
  assert.equal((await run1('Zzz')).out.bgg.id, '407173', 'éditeur inconnu : choix normal');
});
