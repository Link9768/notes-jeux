const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { htmlToLines, parseAnnonces, filterParis, parseBggLink } = require('../lib/okkazeo.js');
const { extractJsonLd, findProduct, offersOf } = require('../lib/jsonld.js');
const lines = fs.readFileSync(__dirname + '/fixtures/okkazeo-listing.txt', 'utf8').split('\n').map(s => s.trim()).filter(Boolean);

test('parse les 5 annonces', () => {
  const a = parseAnnonces(lines);
  assert.equal(a.length, 5);
  assert.deepEqual(a[0], { prix: 40, etat: 'correct', ville: 'Calais', cp: '62100', date: '2026-08-30', bonneAffaire: false, extensions: false, envoi: false });
  assert.equal(a[2].bonneAffaire, true);
  assert.equal(a[3].envoi, true);
  assert.equal(a[3].ville, 'Perpignan');
});
test('filtre Paris + tri prix', () => {
  const a = filterParis(parseAnnonces(lines), ['94200', '75013']);
  assert.deepEqual(a.map(x => x.ville), ['Ivry-sur-Seine']);
});
test('tri par prix croissant', () => {
  const a = filterParis(parseAnnonces(lines), ['62100', '31400', '25000', '66000', '94200']);
  assert.deepEqual(a.map(x => x.prix), [20, 20, 30, 40, 65]);
});
test('page sans annonce → []', () => assert.deepEqual(parseAnnonces(['0 annonce', 'Vendre le vôtre']), []));
test('htmlToLines garde prix et ville sur leurs lignes', () => {
  const l = htmlToLines('<div>Jeu d\'occasion (état correct)</div><div>40€ <span>00</span> <span>bonne affaire</span></div><p>Vendu par x</p><div>Paris (75011)</div><script>var a="1€00"</script>');
  assert.deepEqual(l, ["Jeu d'occasion (état correct)", '40€ 00 bonne affaire', 'Vendu par x', 'Paris (75011)']);
});
test('fixture HTML réelle : annonces parsées cohérentes avec le JSON-LD', () => {
  const html = fs.readFileSync(__dirname + '/fixtures/okkazeo-clank.html', 'utf8');
  const total = offersOf(findProduct(extractJsonLd(html))).total;
  const a = parseAnnonces(htmlToLines(html));
  assert.ok(a.length > 0 && a.length <= total, `${a.length} parsées / ${total}`);
  assert.ok(a.every(x => x.prix > 0 && x.etat && x.etat.length < 30 && x.cp && /^\d{4,5}$/.test(x.cp)), 'chaque annonce a prix, état court et code postal (FR ou étranger)');
});
test('états atypiques et annonce étrangère (cas vus sur la vraie page)', () => {
  const l = ["Jeu (vo) d'occasion (état correct)", '150€ 00', 'Vendu par x', 'Envoi France et Europe', 'Liege (4020)', '16/09/2026',
    "Jeu d'occasion (juste déballé)", '35€ 00', 'Vendu par y', 'Aubervilliers (93300)', '07/12/2025'];
  const a = parseAnnonces(l);
  assert.equal(a.length, 2);
  assert.deepEqual([a[0].etat, a[0].ville, a[0].cp], ['correct', 'Liege', '4020']);
  assert.equal(a[1].etat, 'juste déballé');
  assert.deepEqual(filterParis(a, ['93300']).map(x => x.ville), ['Aubervilliers']);
});
test('jeu neuf : état « neuf »', () => {
  const a = parseAnnonces(['Jeu neuf (sous cello.)', '41€ 10', 'Vendu par x', 'Maisons-laffitte (78600)', '12/06/2026']);
  assert.deepEqual([a[0].etat, a[0].prix], ['neuf', 41.1]);
});

test('lien BGG lu dans la fiche Okkazeo', () => {
  assert.equal(parseBggLink(fs.readFileSync(__dirname + '/fixtures/okkazeo-clank.html', 'utf8')), 'https://boardgamegeek.com/boardgame/201808/clank-deck-building-adventure');
  assert.equal(parseBggLink('<html>rien</html>'), null);
  assert.equal(parseBggLink(null), null);
});
