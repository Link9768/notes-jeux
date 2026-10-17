const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parseMyludoSearch, pickMyludo, parseMyludoGame } = require('../lib/myludo.js');
const fx = n => JSON.parse(fs.readFileSync(`${__dirname}/fixtures/${n}`, 'utf8'));

test('recherche : candidats avec titre, id, type et lien', () => {
  const c = parseMyludoSearch(fx('myludo-search-clank.json'));
  assert.ok(c.length >= 10);
  assert.ok(c.every(x => x.title && x.id && x.type));
  assert.deepEqual([c[0].title, c[0].id, c[0].type, c[0].url], ['Clank!', '19410', 'basegame', 'https://www.myludo.fr/#!/game/clank-19410']);
});
test('« clank » → le jeu de base Clank! (19410), pas une extension', () => {
  assert.equal(pickMyludo('clank', parseMyludoSearch(fx('myludo-search-clank.json'))).id, '19410');
});
test('« clank catacombs » → un jeu de base ; une extension demandée par son nom reste trouvable', () => {
  const c = parseMyludoSearch(fx('myludo-search-clank.json'));
  assert.equal(pickMyludo('clank catacombs', c).type, 'basegame');
  assert.equal(pickMyludo('clank sunken treasures', c).type, 'extension');
});
test('jeu inconnu / liste vide → null', () => {
  assert.equal(pickMyludo('azertyuiop', parseMyludoSearch(fx('myludo-search-clank.json'))), null);
  assert.deepEqual(parseMyludoSearch({ success: false, message: 'Illegal action' }), []);
});
test('fiche : note de la communauté 8,3 sur 1500 notes', () => {
  assert.deepEqual(parseMyludoGame(fx('myludo-game-clank.json')), { note: 8.3, avis: 1500, titre: 'Clank!', url: 'https://www.myludo.fr/#!/game/clank-19410' });
});
test('fiche sans note communautaire → note null, pas de crash', () => {
  const g = parseMyludoGame({ id: '1', code: 'x', title: 'X', rating: { game: { audience: 0 } } });
  assert.deepEqual([g.note, g.avis], [null, null]);
  assert.equal(parseMyludoGame({ id: '1', code: 'x', title: 'X' }).note, null);
});
