const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parsePhilibertSearch, parseEspritJeuSearch, parseOkkazeoSearch } = require('../lib/sites.js');
const { pickProduct } = require('../lib/match.js');
const fx = n => fs.readFileSync(`${__dirname}/fixtures/${n}`, 'utf8');

test('Philibert : candidats avec titre, url absolue, langue', () => {
  const c = parsePhilibertSearch(fx('philibert-search-clank.html'));
  assert.ok(c.length >= 10, `${c.length} candidats`);
  assert.ok(c.every(x => x.title && /^https:\/\/www\.philibertnet\.com\//.test(x.url)));
  assert.ok(c.some(x => x.title === 'Clank!' && x.lang === 'fr'));
  assert.ok(c.some(x => x.title === 'Clank!' && x.lang === 'en'));
});
test('Philibert : choix de « clank » = Clank! VF (143836)', () => {
  const p = pickProduct('clank', parsePhilibertSearch(fx('philibert-search-clank.html')));
  assert.equal(p.lang, 'fr');
  assert.ok(p.url.includes('143836'), p.url);
});
test('Philibert : note de la liste lue quand elle existe', () => {
  const c = parsePhilibertSearch(fx('philibert-search-clank.html'));
  assert.equal(c.find(x => x.title === 'Clank! Catacombes').note, 5);
  assert.equal(c.find(x => x.title === 'Clank!' && x.lang === 'fr').note, null);
});
test('Esprit Jeu : candidats et choix de Clank!', () => {
  const c = parseEspritJeuSearch(fx('espritjeu-search-clank.html'));
  assert.ok(c.length >= 1);
  assert.ok(c.every(x => x.title && /^https:\/\/www\.espritjeu\.com\//.test(x.url)));
  assert.equal(pickProduct('clank', c).url, 'https://www.espritjeu.com/jeux-de-strategie/clank-les-aventuriers-du-deckbuilding.html');
});
test('Esprit Jeu réel : « les aventuriers du rail » → édition USA (jeu de base), pas Europe ni l\'extension', () => {
  const p = pickProduct('les aventuriers du rail', parseEspritJeuSearch(fx('espritjeu-search-rail.html')));
  assert.equal(p.title, 'Les Aventuriers du Rail - USA (Éd. 2025)');
});
test('réel : « catane » → Catan chez Esprit Jeu et chez Philibert (VF)', () => {
  assert.equal(pickProduct('catane', parseEspritJeuSearch(fx('espritjeu-search-catane.html'))).title, 'Catan');
  const ph = pickProduct('catane', parsePhilibertSearch(fx('philibert-search-catane.html')));
  assert.equal(ph.title, 'Catan');
  assert.equal(ph.lang, 'fr');
});
test('Esprit Jeu réel : accents conservés une fois la page décodée en latin1', () => {
  const p = pickProduct('château combo', parseEspritJeuSearch(fx('espritjeu-search-chateau-combo.html')));
  assert.equal(p.title, 'Château Combo');
});
test('Okkazeo recherche : URL absolue /jeux/16977/', () => {
  const c = parseOkkazeoSearch(fx('okkazeo-search-clank.html'));
  assert.equal(pickProduct('clank', c).url, 'https://www.okkazeo.com/jeux/16977/clank');
});
test('Okkazeo recherche : plusieurs éditions au même titre, avec leur nombre d\'annonces (Dixit Odyssey)', () => {
  const c = parseOkkazeoSearch(fx('okkazeo-search-dixit-odyssey.html'));
  assert.deepEqual(c.map(x => [x.url.split('/')[4], x.annonces]), [['7028', 0], ['85748', 2], ['90287', 2]]);
});
test('Okkazeo recherche : Clank → 14 annonces', () => {
  assert.equal(parseOkkazeoSearch(fx('okkazeo-search-clank.html'))[0].annonces, 14);
});
test('pages sans résultat → []', () => {
  assert.deepEqual(parsePhilibertSearch('<html></html>'), []);
  assert.deepEqual(parseEspritJeuSearch('<html></html>'), []);
  assert.deepEqual(parseOkkazeoSearch('<html></html>'), []);
});

test('Ludifolie : cartes de la recherche → titre, prix du jour et prix de base (page réelle du 2026-11-21)', () => {
  const { parseLudifolieSearch } = require('../lib/sites.js');
  const r = parseLudifolieSearch(require('node:fs').readFileSync(`${__dirname}/fixtures/ludifolie-search-clank.html`, 'utf8'));
  assert.ok(r.length >= 5);
  const e = r.find(x => /Espace/.test(x.title));
  assert.deepEqual([e.title, e.url, e.prix], ["Clank! Dans l'Espace", 'https://www.ludifolie.com/6573-clank-dans-l-espace.html', 51.9]);
  assert.ok(r.every(x => x.prix > 0));
  assert.ok(r.some(x => x.prixBase > x.prix), 'une carte remisée a un prix de base plus haut');
});
