const test = require('node:test');
const assert = require('node:assert/strict');
const { parseBggSearch, bggCandidates, parseBggThings, pickBgg } = require('../lib/bgg.js');

// XML au format officiel xmlapi2 (déduit : fixtures réelles à ajouter quand le token BGG existe)
const search = `<items total="3">
<item type="boardgame" id="201808"><name type="primary" value="Clank!: A Deck-Building Adventure"/><yearpublished value="2016"/></item>
<item type="boardgame" id="201809"><name type="alternate" value="Clank!"/><yearpublished value="2016"/></item>
<item type="boardgameexpansion" id="231000"><name type="primary" value="Clank!: Sunken Treasures"/></item>
</items>`;
const thing = `<items>
<item type="boardgame" id="201808"><thumbnail>t</thumbnail><image>https://cf.geekdo-images.com/x.jpg</image>
<name type="primary" sortindex="1" value="Clank!: A Deck-Building Adventure"/><name type="alternate" sortindex="1" value="Clank!"/>
<yearpublished value="2016"/><minplayers value="2"/><maxplayers value="4"/><minplaytime value="30"/><maxplaytime value="60"/><minage value="12"/>
<statistics page="1"><ratings><usersrated value="45678"/><average value="7.68"/><bayesaverage value="7.4"/><averageweight value="2.2367"/></ratings></statistics></item>
</items>`;

test('search', () => assert.deepEqual(parseBggSearch(search)[1], { id: '201809', type: 'boardgame', name: 'Clank!' }));
test('candidats : nom exact (alternate inclus)', () => assert.deepEqual(bggCandidates('clank', parseBggSearch(search)), ['201809']));
test('candidats : sinon tous les mots', () => assert.deepEqual(bggCandidates('clank sunken', parseBggSearch(search)), ['231000']));
test('candidats : rien → []', () => assert.deepEqual(bggCandidates('azertyuiop', parseBggSearch(search)), []));
test('fiche', () => {
  assert.deepEqual(pickBgg(parseBggThings(thing)), {
    note: 7.7, votes: 45678, duree: '30–60', poids: 2.24, titre: 'Clank!: A Deck-Building Adventure',
    annee: 2016, joueurs: '2–4', age: '12+', image: 'https://cf.geekdo-images.com/x.jpg',
    url: 'https://boardgamegeek.com/boardgame/201808',
  });
});
test('aucune fiche → null', () => assert.equal(pickBgg([]), null));
test('jeu de base préféré à l’extension, puis le plus voté', () => {
  const t = (id, type, votes) => ({ id, type, titre: id, votes, average: 7, poids: 2, annee: 2020, minp: 1, maxp: 2, mint: 10, maxt: 10, age: 8, image: null });
  assert.equal(pickBgg([t('ext', 'boardgameexpansion', 9000), t('petit', 'boardgame', 10), t('gros', 'boardgame', 500)]).titre, 'gros');
});
test('durée fixe et champs absents → pas de crash', () => {
  const xml = '<items><item type="boardgame" id="1"><name type="primary" value="X"/><minplaytime value="45"/><maxplaytime value="45"/></item></items>';
  const b = pickBgg(parseBggThings(xml));
  assert.equal(b.duree, '45');
  assert.equal(b.note, null);
  assert.equal(b.poids, null);
  assert.equal(b.joueurs, null);
});
test('entités XML décodées dans le titre', () => {
  const xml = '<items><item type="boardgame" id="2"><name type="primary" value="Dungeons &amp; Dragons"/></item></items>';
  assert.equal(pickBgg(parseBggThings(xml)).titre, 'Dungeons & Dragons');
});
