const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parseAnnoncesArticles, matchVendeurs, parseListeJeux } = require('../lib/panier.js');
const fx = n => fs.readFileSync(`${__dirname}/fixtures/${n}`, 'utf8');
const CPS = JSON.parse(fx('../../lib/cp-paris-10km.json')).cps;

test('annonces de la fiche Okkazeo : vendeur, prix, lien, ville, état, envoi', () => {
  const a = parseAnnoncesArticles(fx('okkazeo-clank.html'));
  assert.equal(a.length, 14);
  assert.deepEqual(a[0], { vendeur: 'vendeur', prix: 40, url: 'https://www.okkazeo.com/annonces/1458423/clank', ville: 'Calais', cp: '62100', etat: 'correct', envoi: false });
  assert.ok(a.every(x => x.etat), JSON.stringify(a.map(x => x.etat))); // « juste déballé », « neuf », « + extensions (état …) » compris
  assert.ok(a.some(x => x.etat === 'juste déballé' && x.envoi)); // pastille « Envoi France et Europe »
  assert.deepEqual(parseAnnoncesArticles('<html></html>'), []);
});

const ann = (vendeur, prix, cp = '62100', envoi = false) => ({ vendeur, prix, cp, ville: 'V' + cp, etat: 'bon', envoi, url: 'https://www.okkazeo.com/annonces/' + prix });
test('vendeurs : au moins 2 jeux différents, annonce la moins chère par jeu, total', () => {
  const v = matchVendeurs([
    { titre: 'Clank!', annonces: [ann('Alice', 30), ann('Alice', 25), ann('Bob', 20)] },
    { titre: 'Abyss', annonces: [ann('alice', 15)] }, // même vendeur, casse différente
  ], CPS);
  assert.equal(v.length, 1);
  assert.deepEqual([v[0].vendeur, v[0].nbJeux, v[0].total], ['Alice', 2, 40]);
  assert.deepEqual(v[0].annonces.map(a => [a.jeu, a.prix]), [['Abyss', 15], ['Clank!', 25]]);
});
test('vendeurs : tri par nombre de jeux, puis près de Paris, puis total', () => {
  const v = matchVendeurs([
    { titre: 'A', annonces: [ann('Loin', 5), ann('Paris', 50, '75013'), ann('Trois', 40)] },
    { titre: 'B', annonces: [ann('Loin', 5), ann('Paris', 50, '75013'), ann('Trois', 40)] },
    { titre: 'C', annonces: [ann('Trois', 40)] },
  ], CPS);
  assert.deepEqual(v.map(x => x.vendeur), ['Trois', 'Paris', 'Loin']);
  assert.equal(v[1].procheParis, true);
  assert.equal(v[2].procheParis, false);
});
test('vendeurs : aucun vendeur commun → liste vide ; envoi seulement si toutes ses annonces expédient', () => {
  assert.deepEqual(matchVendeurs([{ titre: 'A', annonces: [ann('X', 1)] }, { titre: 'B', annonces: [ann('Y', 1)] }], CPS), []);
  const v = matchVendeurs([{ titre: 'A', annonces: [ann('X', 1, '62100', true)] }, { titre: 'B', annonces: [ann('X', 2, '62100', false)] }], CPS);
  assert.equal(v[0].envoi, false);
  assert.deepEqual(matchVendeurs([], CPS), []);
});
test('liste de jeux : virgules, retours à la ligne ou |, doublons et vides retirés, 8 au plus', () => {
  assert.deepEqual(parseListeJeux('Clank, Abyss\n\nclank|7 Wonders Duel ; '), ['Clank', 'Abyss', '7 Wonders Duel']);
  assert.equal(parseListeJeux(Array.from({ length: 12 }, (_, i) => 'j' + i).join(',')).length, 8);
  assert.deepEqual(parseListeJeux(undefined), []);
});
