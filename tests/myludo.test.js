const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parseMyludoSearch, pickMyludo, parseMyludoGame, parseMyludoInfo, topMecaniques, pickSimilaires } = require('../lib/myludo.js');
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
test('fiche : note de la communauté 8,3 sur 1500 notes + infos pratiques', () => {
  assert.deepEqual(parseMyludoGame(fx('myludo-game-clank.json')), {
    note: 8.3, avis: 1500, titre: 'Clank!', url: 'https://www.myludo.fr/#!/game/clank-19410',
    image: 'https://www.myludo.fr/img/jeux/1747310002/160/at/19410.png', annee: 2017, joueurs: '2 — 4', age: '12+', duree: 60, complexite: 2.5,
  });
});
test('fiche sans note communautaire → note null, pas de crash', () => {
  const g = parseMyludoGame({ id: '1', code: 'x', title: 'X', rating: { game: { audience: 0 } } });
  assert.deepEqual([g.note, g.avis], [null, null]);
  assert.equal(parseMyludoGame({ id: '1', code: 'x', title: 'X' }).note, null);
});
test('fiche : durée en fourchette quand min ≠ max', () => {
  assert.equal(parseMyludoGame({ id: '1', code: 'x', title: 'X', time_min: '30', time_max: '120' }).duree, '30–120');
});
test('info : mécaniques (id du tag en fin de clé) et thèmes', () => {
  const i = parseMyludoInfo(fx('myludo-info-clank.json'));
  assert.equal(i.mecaniques.length, 7);
  assert.deepEqual(i.mecaniques.find(m => m.nom === 'Deck building'), { id: '22', nom: 'Deck building' });
  assert.deepEqual(i.themes, ['Dragons', 'Exploration', 'Médiéval Fantastique']);
});
test('info : Abyss → Enchères, Gestion de main, Stop ou encore…', () => {
  const noms = parseMyludoInfo(fx('myludo-info-abyss.json')).mecaniques.map(m => m.nom);
  for (const n of ['Enchères', 'Gestion de main', 'Stop ou encore']) assert.ok(noms.includes(n), n);
});
test('info vide ou absente → listes vides, pas de crash', () => {
  assert.deepEqual(parseMyludoInfo({}), { mecaniques: [], themes: [] });
  assert.deepEqual(parseMyludoInfo(null), { mecaniques: [], themes: [] });
});
const clankTags = () => {
  const tags = fx('myludo-tags-clank.json');
  return parseMyludoInfo(fx('myludo-info-clank.json')).mecaniques.map(m => ({ ...m, count: Number(tags[m.id].count), list: tags[m.id].list }));
};
test('mécaniques principales : les 5 plus rares, pas les plus répandues', () => {
  const m = topMecaniques(clankTags());
  assert.equal(m.length, 5);
  assert.ok(m.includes('Deck building') && m.includes('Card-driven'));
  assert.ok(!m.includes('Prise de risque') && !m.includes('Parcours')); // 1 851 et 1 739 jeux : trop courantes
});
test('semblables : 3 jeux de base, ni le jeu ni sa gamme ni doublon d\'édition', () => {
  const s = pickSimilaires('Clank!', clankTags());
  assert.equal(s.length, 3);
  assert.ok(s.every(x => x.titre && x.url.startsWith('https://www.myludo.fr/#!/game/')));
  assert.ok(s.every(x => !/^clank/i.test(x.titre)), JSON.stringify(s.map(x => x.titre)));
  assert.equal(new Set(s.map(x => x.titre)).size, 3);
});
test('semblables : ne garde que les jeux partageant au moins 2 mécaniques', () => {
  const t = (id, count, titres) => ({ id, nom: id, count, list: titres.map((titre, i) => ({ id: String(i), code: 'c', title: titre, type: 'basegame' })) });
  const s = pickSimilaires('Mon jeu', [t('a', 10, ['Seul A', 'Double']), t('b', 20, ['Double', 'Seul B'])]);
  assert.deepEqual(s.map(x => x.titre), ['Double']);
});
test('semblables : listes vides → tableau vide', () => {
  assert.deepEqual(pickSimilaires('X', []), []);
});
