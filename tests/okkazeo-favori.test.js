const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { hashOkk, okkFetcher, bilanOkk, panneauOkkHtml } = require('../lib/okkazeo-favori.js');
const { annoncesOkkazeo, nbAnnoncesVendeur } = require('../lib/panier.js');
const fx = n => fs.readFileSync(`${__dirname}/fixtures/${n}`, 'utf8');
const CPS = JSON.parse(fs.readFileSync(`${__dirname}/../lib/cp-paris-10km.json`, 'utf8')).cps;

test('hashOkk : liste (#nj) et jeux à sécuriser (&ns, 3 au plus) ; vide ou mal formé → []', () => {
  assert.deepEqual(hashOkk('#nj=Azul%7CClank&ns=Azul'), { liste: ['Azul', 'Clank'], secu: ['Azul'] });
  assert.deepEqual(hashOkk(''), { liste: [], secu: [] });
  assert.deepEqual(hashOkk('#nj=%E0'), { liste: [], secu: [] });
  assert.equal(hashOkk('#nj=A&ns=' + encodeURIComponent('a|b|c|d|e')).secu.length, 3);
  assert.deepEqual(hashOkk('#nj=Tic%26Tac%7CAzul').liste, ['Tic&Tac', 'Azul']);
});

const OK_SEARCH = 'https://www.okkazeo.com/jeux/resultats?rech_nom=clank';
const OK_PRODUCT = 'https://www.okkazeo.com/jeux/16977/clank';
const pages = { [OK_SEARCH]: fx('okkazeo-search-clank.html'), [OK_PRODUCT]: fx('okkazeo-clank.html') };
const fauxFetch = (statut = 200, corps = null, appels = []) => async (u, o) => {
  appels.push({ u, o, t: Date.now() });
  const html = corps ?? pages[u];
  return { status: html === undefined ? 404 : statut, text: async () => html ?? '' };
};

test('okkFetcher : annoncesOkkazeo (clank) → 14 annonces, requêtes espacées et envoyées avec les cookies', async () => {
  const appels = [];
  const { get, estBloque } = okkFetcher(fauxFetch(200, null, appels), 50, 0);
  const r = await annoncesOkkazeo('clank', get);
  assert.equal(r.annonces.length, 14);
  assert.equal(estBloque(), false);
  assert.equal(appels.length, 2);
  assert.ok(appels.every(a => a.o.credentials === 'include'));
  assert.ok(appels[1].t - appels[0].t >= 45, `${appels[1].t - appels[0].t} ms`);
});
test('okkFetcher : 403 → « okkazeo bloque », puis les appels suivants échouent SANS requête', async () => {
  const appels = [];
  const { get, estBloque } = okkFetcher(fauxFetch(403, '', appels), 10, 0);
  await assert.rejects(get(OK_SEARCH), /okkazeo bloque/);
  assert.equal(estBloque(), true);
  await assert.rejects(get(OK_PRODUCT), /okkazeo bloque/);
  assert.equal(appels.length, 1);
});
test('okkFetcher : page de challenge en 200 → bloqué ; HTTP 404 → simple erreur', async () => {
  const a = okkFetcher(fauxFetch(200, '<title>Just a moment...</title>'), 0, 0);
  await assert.rejects(a.get(OK_SEARCH), /okkazeo bloque/);
  const b = okkFetcher(fauxFetch(404, ''), 0, 0);
  await assert.rejects(b.get(OK_SEARCH), /HTTP 404/);
  assert.equal(b.estBloque(), false);
});
test('okkFetcher : une vraie page Okkazeo (cloudflareinsights, __CF) n’est pas prise pour un blocage', async () => {
  const { get, estBloque } = okkFetcher(fauxFetch(200, null), 0, 0);
  assert.ok((await get(OK_SEARCH)).includes('Nous avons trouvé'));
  assert.equal(estBloque(), false);
});

const ann = (vendeur, prix, cp = '75016') => ({ vendeur, prix, cp, ville: 'Paris 16e', etat: 'bon', envoi: false, url: 'https://www.okkazeo.com/annonces/' + vendeur + prix });
const J = (demande, titre, annonces) => ({ demande, titre, url: titre ? 'https://www.okkazeo.com/jeux/1/x' : null, annonces });
test('bilanOkk : vendeurs de 2 jeux ou plus ; pas de sécurisés sans jeu à sécuriser', () => {
  const b = bilanOkk([J('a', 'A', [ann('X', 5), ann('Y', 6)]), J('b', 'B', [ann('X', 7)]), J('c', null, [])], [], CPS);
  assert.deepEqual(b.vendeurs.map(v => [v.vendeur, v.nbJeux, v.total]), [['X', 2, 12]]);
  assert.equal(b.securises, null);
});
test('bilanOkk : sécurisés null tant que les jeux à sécuriser ne sont pas tous cherchés', () => {
  const jeux = [J('a', 'A', [ann('X', 5)])];
  assert.equal(bilanOkk(jeux, ['a', 'b'], CPS).securises, null);
  const b = bilanOkk(jeux.concat(J('b', 'B', [ann('X', 7), ann('Y', 8)])), ['a', 'b'], CPS);
  assert.deepEqual(b.securises.jeux.sort(), ['A', 'B']);
  assert.deepEqual(b.securises.vendeurs.map(v => v.vendeur), ['X']);
});
test('bilanOkk : jeu à sécuriser introuvable → introuvables, aucun vendeur ; total d’annonces du vendeur ajouté si connu', () => {
  const x = bilanOkk([J('a', 'A', [ann('X', 5)]), J('b', null, [])], ['a', 'b'], CPS);
  assert.deepEqual(x.securises, { jeux: ['A'], introuvables: ['b'], vendeurs: [] });
  const jeux = [J('a', 'A', [ann('X', 5)]), J('b', 'B', [ann('X', 7)])];
  const b = bilanOkk(jeux, [], CPS, { [ann('X', 5).url]: 35 });
  assert.equal(b.vendeurs[0].nbAnnonces, 35);
});

test('panneauOkkHtml : compteur, puces triées, vendeurs, sécurisés, échappement, liens Okkazeo seulement', () => {
  const jeux = [J('rare', 'Rare', [ann('X', 5)]), J('zzz', null, []), J('panne', null, null), J('beaucoup', 'Beaucoup', [ann('X', 5), ann('Y', 6), ann('Z', 7)])]
    .map(j => ({ ...j, annonces: j.annonces ? j.annonces.length : null }));
  const b = bilanOkk([J('rare', 'Rare', [ann('X', 5)]), J('beaucoup', 'Beaucoup', [ann('X', 5), ann('Y', 6)])], ['rare', 'beaucoup'], CPS, { [ann('X', 5).url]: 35 });
  const h = panneauOkkHtml({ fait: 3, total: 10, jeux, ...b, message: '<img src=x>' });
  assert.ok(h.includes('3/10 jeux'));
  assert.ok(h.indexOf('Beaucoup') < h.indexOf('Rare') && h.indexOf('Rare') < h.indexOf('zzz : introuvable sur Okkazeo'));
  assert.ok(h.includes('panne : indisponible'));
  assert.ok(h.includes('data-copie') && h.includes('(75016)') && h.includes('35 annonces en tout') && h.includes('près de Paris'));
  assert.ok(h.includes('target="_blank" rel="noopener"') && h.includes('🔒'));
  assert.ok(!h.includes('<img') && h.includes('&lt;img'));
  const mal = panneauOkkHtml({ fait: 2, total: 2, jeux: [], vendeurs: [{ ...b.vendeurs[0], annonces: [{ jeu: 'A', prix: 1, url: 'https://evil.example/x' }] }] });
  assert.ok(!mal.includes('evil.example'));
  assert.ok(panneauOkkHtml({ fait: 2, total: 2, jeux: [], vendeurs: [] }).toLowerCase().includes('aucun vendeur'));
});

test('okk.js : compile ; hors www.okkazeo.com → alerte, aucun fetch', () => {
  const src = fs.readFileSync(`${__dirname}/../okk.js`, 'utf8');
  new vm.Script(src);
  const calls = { alert: 0, fetch: 0 };
  vm.runInNewContext(src, { location: { hostname: 'www.leboncoin.fr', hash: '' }, alert: () => calls.alert++, fetch: async () => { calls.fetch++; } });
  assert.deepEqual(calls, { alert: 1, fetch: 0 });
});
test('nbAnnoncesVendeur reste exporté pour le favori', () => assert.equal(typeof nbAnnoncesVendeur, 'function'));
