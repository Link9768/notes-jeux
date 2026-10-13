const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize, isAccessory, pickProduct } = require('../lib/match.js');

const clank = [
  { title: 'Clank! Catacombes', url: 'catacombes', lang: 'fr' },
  { title: 'Clank!', url: 'clank-en', lang: 'en' },
  { title: 'Clank!', url: 'clank-fr', lang: 'fr' },
  { title: 'Clank! - Pack de Stickers', url: 'stickers', lang: 'fr' },
  { title: 'Kit de pochettes pour Clank!', url: 'pochettes' },
  { title: 'Clank! Catacombes - Les Enfers', url: 'enfers', lang: 'fr' },
];

test('normalize', () => {
  assert.equal(normalize('Clank! : Catacombes'), 'clank catacombes');
  assert.equal(normalize('Château Combo'), 'chateau combo');
  assert.equal(normalize('Dixit: Odyssey'), 'dixit odyssey');
  assert.equal(normalize('Clank! (VF)'), 'clank');
  assert.equal(normalize('7 Wonders Duel'), '7 wonders duel');
});
test('jeu de base, VF prioritaire', () => assert.equal(pickProduct('clank', clank).url, 'clank-fr'));
test('extension demandée explicitement', () => assert.equal(pickProduct('Clank catacombes', clank).url, 'catacombes'));
test('tous les mots présents → le plus court', () => assert.equal(pickProduct('catacombes enfers', clank).url, 'enfers'));
test('accessoires exclus', () => {
  assert.ok(isAccessory('Kit de pochettes pour Clank!'));
  assert.ok(isAccessory('Clank! - Pack de Stickers'));
  assert.ok(!isAccessory('Clank! Catacombes'));
  assert.equal(pickProduct('clank', [{ title: 'Clank! - Pack de Stickers', url: 'x' }]), null);
});
test('requête absurde → null', () => assert.equal(pickProduct('azertyuiop', clank), null));
test('liste vide / requête vide → null', () => {
  assert.equal(pickProduct('clank', []), null);
  assert.equal(pickProduct('', clank), null);
});
