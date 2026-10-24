const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize, isAccessory, pickProduct, variantesRecherche } = require('../lib/match.js');

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
test('titre quasi identique (une lettre d\'écart) : « catane » → Catan, pas « Princes de Catane »', () => {
  const c = [{ title: 'Catan Duel (Princes de Catane)' }, { title: 'Catan Junior' }, { title: 'Catan' }];
  assert.equal(pickProduct('catane', c).title, 'Catan');
});
test('faute de frappe d\'une lettre tolérée (≥ 5 lettres), pas sur les titres courts', () => {
  assert.equal(pickProduct('clanck', clank).url, 'clank-fr');
  assert.equal(pickProduct('azu', [{ title: 'Azul' }]), null);
});
test('sans titre exact : le jeu de base du site (1er résultat), pas l\'extension ni le plus court', () => {
  const c = [
    { title: 'Pays-Bas (Ext. Les Aventuriers du Rail)' },
    { title: 'Les Aventuriers du Rail - USA (Éd. 2025)' },
    { title: 'Les Aventuriers du Rail - Europe' },
  ];
  assert.equal(pickProduct('les aventuriers du rail', c).title, 'Les Aventuriers du Rail - USA (Éd. 2025)');
});
test('extension : acceptée quand elle est la seule à correspondre ou demandée', () => {
  const c = [{ title: 'Pays-Bas (Ext. Les Aventuriers du Rail)' }, { title: 'Les Aventuriers du Rail - Europe' }];
  assert.equal(pickProduct('pays bas', c).title, 'Pays-Bas (Ext. Les Aventuriers du Rail)');
  assert.equal(pickProduct('ext aventuriers rail', c).title, 'Pays-Bas (Ext. Les Aventuriers du Rail)');
});
test('requête absurde → null', () => assert.equal(pickProduct('azertyuiop', clank), null));
test('liste vide / requête vide → null', () => {
  assert.equal(pickProduct('clank', []), null);
  assert.equal(pickProduct('', clank), null);
});
test('pluriels ignorés mot par mot : « mots malins » → « Mot Malin »', () => {
  const c = [{ title: 'Mot Malin - Extension' }, { title: 'Mot Malin' }, { title: 'Malin Mot de passe' }];
  assert.equal(pickProduct('mots malins', c).title, 'Mot Malin');
});
test('faute de 2 lettres tolérée sur un titre long, pas sur un titre court', () => {
  assert.equal(pickProduct('carcasonne duell', [{ title: 'Carcassonne Duel' }]).title, 'Carcassonne Duel');
  assert.equal(pickProduct('azal', [{ title: 'Azul' }, { title: 'Azulx' }]), null);
  assert.equal(pickProduct('dixxi', [{ title: 'Dixit' }]), null);
});
test('variantes de recherche : au singulier en second essai, rien si déjà au singulier', () => {
  assert.deepEqual(variantesRecherche('Mots Malins'), ['Mots Malins', 'mot malin']);
  assert.deepEqual(variantesRecherche('Clank'), ['Clank']);
  assert.deepEqual(variantesRecherche('7 Wonders Duel'), ['7 Wonders Duel', '7 wonder duel']);
});
