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
test('sources : MyLudo → 5 mécaniques, 3 semblables avec leur note', async () => {
  const { out } = await run('sources', { nodes: sourcesNodes(), http: myludoHttp() });
  assert.equal(out.myludo.mecaniques.length, 5);
  assert.ok(out.myludo.mecaniques.includes('Deck building'));
  assert.deepEqual(out.myludo.themes, ['Dragons', 'Exploration', 'Médiéval Fantastique']);
  assert.equal(out.myludo.similaires.length, 3);
  assert.ok(out.myludo.similaires.every(s => s.note === 7.5 && s.avis === 100 && s.url.includes('myludo.fr')));
  assert.deepEqual(out.erreurs, []);
});
test('sources : liste d’un tag en panne → les autres mécaniques servent, la note reste', async () => {
  const { out } = await run('sources', { nodes: sourcesNodes(), http: o => (o.url.includes('theme/datas.php') && o.url.includes('id=22&') ? { statusCode: 500, body: '' } : myludoHttp()(o)) });
  assert.equal(out.myludo.note, 8.3);
  assert.equal(out.myludo.mecaniques.length, 5);
  assert.ok(!out.myludo.mecaniques.includes('Deck building'));
});
test('sources : fiche détaillée MyLudo en panne → note conservée, mécaniques et semblables null', async () => {
  const { out } = await run('sources', { nodes: sourcesNodes(), http: o => (o.url.includes('type=info') ? { statusCode: 500, body: '' } : myludoHttp()(o)) });
  assert.equal(out.myludo.note, 8.3);
  assert.deepEqual([out.myludo.mecaniques, out.myludo.similaires], [null, null]);
});
test('sources : jeux du même auteur (Paul Dennen), les plus réédités d’abord, sans lire leurs fiches', async () => {
  const { out, calls } = await run('sources', { nodes: sourcesNodes(), http: myludoHttp() });
  assert.equal(out.myludo.memeAuteur.nom, 'Paul Dennen');
  const titres = out.myludo.memeAuteur.jeux.map(j => j.titre);
  assert.deepEqual(titres.slice(0, 2).sort(), ['Dune Imperium', 'Wild Tiled West']);
  assert.equal(titres.length, 4);
  assert.ok(out.myludo.memeAuteur.jeux.every(j => j.url.includes('myludo.fr')));
  assert.equal(calls.filter(c => c.url.includes('game/datas.php?type=game&')).length, 4); // le jeu + ses 3 semblables : aucune fiche lue pour l’auteur (≈ 1 s chacune)
});
test('sources : liste des jeux de l’auteur en panne → memeAuteur null, les semblables restent', async () => {
  const { out } = await run('sources', { nodes: sourcesNodes(), http: o => (o.url.includes('/people/datas.php') ? { statusCode: 500, body: '' } : myludoHttp()(o)) });
  assert.equal(out.myludo.memeAuteur, null);
  assert.equal(out.myludo.similaires.length, 3);
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
  assert.deepEqual(out.erreurs, []);
  assert.ok(calls.every(c => c.headers['Sec-Fetch-Dest'] === 'document' && c.timeout === 10000));
});
test('panier : un jeu en panne (403) → erreur pour ce jeu, les autres servent', async () => {
  const { out } = await run('panier', { nodes: panierNodes('clank|dixit: odyssey'), http: o => (o.url === OK_DIXIT ? { statusCode: 403, body: '' } : panierHttp(o)) });
  assert.equal(out.jeux[0].annonces, 14);
  assert.equal(out.jeux[1].titre, null);
  assert.ok(out.erreurs[0].startsWith('dixit: odyssey:'), JSON.stringify(out.erreurs));
  assert.deepEqual(out.vendeurs, []);
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
  const ok = await run('bgg-fiche', { nodes: { 'BGG Candidats': { ids: '201808' } }, input: { data: xml } });
  assert.equal(ok.out.bgg.note, 7.8);
  const none = await run('bgg-fiche', { nodes: { 'BGG Candidats': { ids: '' } }, input: { data: '' } });
  assert.equal(none.out.bgg, null);
});
