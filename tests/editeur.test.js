// Éditeurs : comparaison tolérante (« Yellow » ~ « Yellow Mountain Editions »), marque Philibert / Esprit Jeu, découpage « Loop Yellow ».
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parEditeur, memeEditeur, marquePhilibert, marqueEspritJeu, decoupagesEditeur } = require('../lib/editeur.js');
const fx = n => fs.readFileSync(`${__dirname}/fixtures/${n}`, 'utf8');

test('memeEditeur : mots communs, termes génériques et accents ignorés', () => {
  assert.ok(memeEditeur('Yellow', 'Yellow Mountain Editions'));
  assert.ok(memeEditeur('yellow mountain', 'Yellow Mountain'));
  assert.ok(memeEditeur('Iello', 'iello'));
  assert.ok(memeEditeur('Renegade', 'Renegade Game Studios'));
  assert.ok(memeEditeur('Éditions Bombyx', 'bombyx'));
  assert.ok(memeEditeur('Yellow', 'Iello'), 'prononciation : Yellow ~ Iello');
  assert.ok(!memeEditeur('Yellow', 'Bombyx') && !memeEditeur('Iello', 'Hasbro'));
  assert.ok(memeEditeur('Asmodee', 'Asmodie Games Ltd'), 'une lettre d’écart');
  assert.ok(!memeEditeur('Brainbraingames', 'Blackbody Lab'));
  assert.ok(!memeEditeur('Games', 'Renegade Games'), 'un terme générique seul ne compte pas');
  assert.ok(!memeEditeur('', 'Iello') && !memeEditeur('Iello', null));
});

test('plusieurs éditeurs (A|B) et choix parmi les candidats d’une boutique', () => {
  assert.ok(memeEditeur('Dire Wolf|Renegade Game Studios', 'Renegade'));
  const c = [{ title: 'Loop', url: 'https://www.philibertnet.com/fr/brainbraingames/1-loop-1.html' }, { title: 'Loop', url: 'https://www.philibertnet.com/fr/yellow-mountain/2-loop-2.html' }, { title: 'Loop Extension', url: 'https://www.philibertnet.com/fr/brainbraingames/3-x-3.html' }];
  const marque = x => (marquePhilibert(x.url) || '').replace(/-/g, ' ');
  assert.equal(parEditeur(c, c[0], 'Yellow', marque).url, c[1].url);
  assert.equal(parEditeur(c, c[0], 'Zzz', marque), null, 'aucun éditeur ne correspond');
  assert.equal(parEditeur([c[0], c[2]], c[0], 'Yellow', marque), null, 'seul à ce titre : pas de choix à faire');
});

test('marque Philibert : slug de l’URL produit', () => {
  assert.equal(marquePhilibert('https://www.philibertnet.com/fr/iello/178998-loop-3701551706775.html'), 'iello');
  assert.equal(marquePhilibert('https://www.philibertnet.com/fr/renegade-game-studios/143836-clank-3760243850066.html'), 'renegade-game-studios');
  assert.equal(marquePhilibert('https://www.philibertnet.com/fr/recherche?search_query=loop'), null);
  assert.ok(memeEditeur('Renegade Game Studios', marquePhilibert('https://www.philibertnet.com/fr/renegade-game-studios/143836-clank-3760243850066.html').replace(/-/g, ' ')));
});

test('marque Esprit Jeu : page produit réelle (Clank → OriGames)', () => {
  assert.equal(marqueEspritJeu(fx('espritjeu-product-clank.html')), 'OriGames');
  assert.equal(marqueEspritJeu('<html></html>'), null);
});

test('découpage « Loop Yellow » → nom + éditeur, du plus long nom au plus court', () => {
  assert.deepEqual(decoupagesEditeur('Loop Yellow'), [{ nom: 'Loop', editeur: 'Yellow' }]);
  assert.deepEqual(decoupagesEditeur('Terraforming Mars Intrafin'), [{ nom: 'Terraforming Mars', editeur: 'Intrafin' }, { nom: 'Terraforming', editeur: 'Mars Intrafin' }]);
  assert.deepEqual(decoupagesEditeur('Loop'), []);
  assert.equal(decoupagesEditeur('a b c d e f').length, 3, 'au plus 3 essais');
});
