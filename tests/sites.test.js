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
test('Okkazeo recherche : URL absolue /jeux/16977/', () => {
  const c = parseOkkazeoSearch(fx('okkazeo-search-clank.html'));
  assert.equal(pickProduct('clank', c).url, 'https://www.okkazeo.com/jeux/16977/clank');
});
test('pages sans résultat → []', () => {
  assert.deepEqual(parsePhilibertSearch('<html></html>'), []);
  assert.deepEqual(parseEspritJeuSearch('<html></html>'), []);
  assert.deepEqual(parseOkkazeoSearch('<html></html>'), []);
});
