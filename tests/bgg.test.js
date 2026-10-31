const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parseBggSearch, bggCandidates, parseBggThings, pickBgg, pickBggRecs } = require('../lib/bgg.js');

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
test('candidats : nom exact (alternate inclus), puis jeu dont le nom de base est la recherche', () => assert.deepEqual(bggCandidates('clank', parseBggSearch(search)), ['201809', '201808']));
test('candidats : sinon tous les mots', () => assert.deepEqual(bggCandidates('clank sunken', parseBggSearch(search)), ['231000']));
test('candidats : rien → []', () => assert.deepEqual(bggCandidates('azertyuiop', parseBggSearch(search)), []));
test('fiche', () => {
  assert.deepEqual(pickBgg(parseBggThings(thing)), {
    note: 7.7, votes: 45678, duree: '30–60', poids: 2.24, titre: 'Clank!: A Deck-Building Adventure',
    annee: 2016, joueurs: '2–4', age: '12+', image: 'https://cf.geekdo-images.com/x.jpg',
    url: 'https://boardgamegeek.com/boardgame/201808', mecaniques: [], themes: [],
    id: '201808', rang: null, rangCat: null, ideal: null, extensions: 0,
  });
});
test('fiche Abyss réelle : rang général + catégorie principale, idéal à 4, 7 extensions, mécaniques avec id', () => {
  const b = pickBgg(parseBggThings(fs.readFileSync(__dirname + '/fixtures/bgg-thing-abyss.xml', 'utf8')));
  assert.deepEqual([b.rang, b.rangCat, b.ideal, b.extensions], [453, { rang: 341, nom: 'stratégie' }, '4', 7]);
  assert.deepEqual(b.mecaniques[0], { id: '2012', nom: 'Enchères' });
});
test('meilleur nombre de joueurs : fourchette décodée, sondage absent → null', () => {
  const x = v => `<items><item type="boardgame" id="1"><name type="primary" value="X"/><poll-summary name="suggested_numplayers"><result name="bestwith" value="${v}" /></poll-summary></item></items>`;
  assert.equal(pickBgg(parseBggThings(x('Best with 3–4 players'))).ideal, '3–4');
  assert.equal(pickBgg(parseBggThings(x('Best with 2 players'))).ideal, '2');
  assert.equal(pickBgg(parseBggThings('<items><item type="boardgame" id="1"><name type="primary" value="X"/></item></items>')).ideal, null);
});
// Vraie réponse BGG Thing (exécution n8n du 2026-10-31, recherche « abyss », 8 fiches).
test('style de jeu BGG en français : toutes les mécaniques, complétées par les catégories (≥ 7 au total)', () => {
  const b = pickBgg(parseBggThings(fs.readFileSync(__dirname + '/fixtures/bgg-thing-abyss.xml', 'utf8')));
  assert.equal(b.titre, 'Abyss');
  assert.deepEqual(b.mecaniques.map(m => m.nom), ['Enchères', 'Gestion de main', 'Mémoire', 'Draft ouvert', 'Stop ou encore', 'Collection']);
  assert.deepEqual(b.themes, ['Jeu de cartes', 'Fantastique', 'Mythologie']);
});
test('style de jeu : libellé inconnu gardé en anglais, au moins 3 catégories, 10 mécaniques max', () => {
  const lk = (type, v) => `<link type="${type}" id="1" value="${v}"/>`;
  const meca = Array.from({ length: 12 }, (_, i) => lk('boardgamemechanic', 'Nouveau ' + i)).join('');
  assert.deepEqual(pickBgg(parseBggThings(`<items><item type="boardgame" id="1"><name type="primary" value="X"/>${lk('boardgamecategory', 'Spies / Secret Agents')}</item></items>`)).themes, ['Espionnage']); // vu sur Codenames
  const cats = ['Fantasy', 'Horror', 'Pirates', 'Zombies'].map(c => lk('boardgamecategory', c)).join('');
  const b = pickBgg(parseBggThings(`<items><item type="boardgame" id="1"><name type="primary" value="X"/>${meca}${cats}${lk('boardgamemechanic', 'Race')}</item></items>`));
  assert.equal(b.mecaniques.length, 10);
  assert.equal(b.mecaniques[0].nom, 'Nouveau 0');
  assert.deepEqual(b.themes, ['Fantastique', 'Horreur', 'Pirates']);
  const peu = pickBgg(parseBggThings(`<items><item type="boardgame" id="1"><name type="primary" value="X"/>${lk('boardgamemechanic', 'Race')}${cats}${lk('boardgamecategory', 'Racing')}</item></items>`));
  assert.deepEqual([peu.mecaniques.map(m => m.nom), peu.themes], [['Course'], ['Fantastique', 'Horreur', 'Pirates', 'Zombies']]); // « Course » pas en double
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
test('valeurs 0 de BGG (= inconnu pour un jeu récent) → null, jamais « 0/10 » ni « difficulté 0 »', () => {
  const xml = '<items><item type="boardgame" id="3"><name type="primary" value="Récent"/><yearpublished value="0"/><minplayers value="0"/><maxplayers value="0"/><minplaytime value="0"/><maxplaytime value="0"/><minage value="0"/><statistics><ratings><usersrated value="0"/><average value="0"/><averageweight value="0"/></ratings></statistics></item></items>';
  const b = pickBgg(parseBggThings(xml));
  assert.deepEqual([b.note, b.poids, b.duree, b.joueurs, b.age, b.annee], [null, null, null, null, null, null]);
  assert.equal(b.votes, 0);
});
test('entités XML décodées dans le titre', () => {
  const xml = '<items><item type="boardgame" id="2"><name type="primary" value="Dungeons &amp; Dragons"/></item></items>';
  assert.equal(pickBgg(parseBggThings(xml)).titre, 'Dungeons & Dragons');
});

// Vraie réponse de BGG (2026-10-31, 120 résultats pour « clank » dans le désordre) : le jeu de base doit être candidat.
test('candidats sur la vraie recherche « clank » : Clank! (201808) en premier, pas noyé parmi 120 résultats', () => {
  const items = parseBggSearch(fs.readFileSync(__dirname + '/fixtures/bgg-search-clank.xml', 'utf8'));
  assert.ok(items.length >= 100);
  const ids = bggCandidates('clank', items);
  assert.ok(ids.length <= 20);
  assert.equal(ids[0], '201808');
});
test('candidats : sans nom de base ni nom exact, les titres les plus courts passent devant', () => {
  const items = [{ id: '1', type: 'boardgame', name: 'Chose Rouge Et Verte Et Bleue' }, { id: '2', type: 'boardgame', name: 'Une Chose Rouge' }];
  assert.deepEqual(bggCandidates('chose rouge', items), ['2', '1']);
});

// Vraie réponse de geekitem/recs pour Clank! (2026-10-31), allégée aux champs lus.
const recs = () => JSON.parse(fs.readFileSync(__dirname + '/fixtures/bgg-recs-clank.json', 'utf8'));
test('recommandations BGG : 5 jeux, sans la gamme du jeu (Clank! In! Space!, Clank! Legacy), avec note et lien', () => {
  const s = pickBggRecs(recs(), 'Clank!: A Deck-Building Adventure');
  assert.deepEqual(s.map(x => x.titre), ['Terraforming Mars: Ares Expedition', 'Everdell', 'Scythe', 'Small World', 'Sheriff of Nottingham']);
  assert.deepEqual([s[1].note, s[1].annee, s[1].url], [8, 2018, 'https://boardgamegeek.com/boardgame/199792/everdell']);
  assert.ok(s.every(x => x.avis > 0 && x.rang > 0));
  assert.ok(pickBggRecs(recs(), 'Clank!', 30).every(x => !/^clank/i.test(x.titre)));
});
test('recommandations BGG : doublons de nom de base retirés, réponse vide ou absente → []', () => {
  const r = { recs: [{ item: { id: 1, name: 'Ticket to Ride', href: '/boardgame/1/a' }, rating: 7.4 }, { item: { id: 2, name: 'Ticket to Ride: Europe', href: '/boardgame/2/b' }, rating: 7.5 }] };
  assert.deepEqual(pickBggRecs(r, 'Catan').map(x => x.titre), ['Ticket to Ride']);
  assert.deepEqual(pickBggRecs({}, 'X'), []);
  assert.deepEqual(pickBggRecs(null, 'X'), []);
});
