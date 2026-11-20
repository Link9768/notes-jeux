const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parseMyludoSearch, pickMyludo, parseMyludoGame, parseMyludoInfo, topMecaniques, pickAuteurJeux } = require('../lib/myludo.js');
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
  assert.deepEqual(parseMyludoInfo({}), { mecaniques: [], themes: [], auteurs: [], editeurs: [] });
  assert.deepEqual(parseMyludoInfo(null), { mecaniques: [], themes: [], auteurs: [], editeurs: [] });
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
test('info : auteurs (rôle « Auteur » seulement, dans l’ordre)', () => {
  assert.deepEqual(parseMyludoInfo(fx('myludo-info-clank.json')).auteurs, [{ id: '11451', nom: 'Paul Dennen' }]);
  assert.deepEqual(parseMyludoInfo(fx('myludo-info-abyss.json')).auteurs.map(a => a.nom), ['Bruno Cathala', 'Charles Chevallier']);
});
const dennen = () => fx('myludo-auteur-dennen.json').list;
test('même auteur : sans le jeu ni sa gamme (Clank! ne propose pas Clank! Legacy), jeux de base seulement', () => {
  const j = pickAuteurJeux('Clank!', dennen());
  assert.ok(j.length > 0 && j.every(x => !/^clank/i.test(x.titre)), JSON.stringify(j.map(x => x.titre)));
  assert.ok(j.every(x => x.id && x.url.startsWith('https://www.myludo.fr/#!/game/')));
});
test('même auteur : un titre une fois (édition la plus récente), les plus réédités d’abord', () => {
  const j = pickAuteurJeux('Clank!', dennen());
  assert.deepEqual(j.map(x => [x.titre, x.annee]).slice(0, 2).sort(), [['Dune Imperium', 2021], ['Wild Tiled West', 2024]]);
  assert.equal(new Set(j.map(x => x.titre)).size, j.length);
  assert.equal(j.length, 4);
});
test('même auteur : à éditions égales, ceux déjà populaires dans les mécaniques passent devant', () => {
  const j = pickAuteurJeux('Clank!', dennen(), new Set(['eternal']));
  assert.equal(j.find(x => x.titre === 'Eternal') && j.findIndex(x => x.titre === 'Eternal'), 2); // devant Lightning Train, après les 2 titres à 2 éditions
  assert.equal(j[3].titre, 'Lightning Train');
});
test('même auteur : au plus 7 jeux, liste vide acceptée', () => {
  const fake = Array.from({ length: 12 }, (_, i) => ({ id: String(i), code: 'c', title: 'Jeu ' + String.fromCharCode(65 + i), type: 'basegame', edition: 2000 + i }));
  assert.equal(pickAuteurJeux('X', fake).length, 7);
  assert.deepEqual(pickAuteurJeux('X', []), []);
  assert.deepEqual(pickAuteurJeux('X', null), []);
});

test('homonymes : jeux de base au titre identique, année, choix par id', () => {
  const { homonymesMyludo } = require('../lib/myludo.js');
  const json = { list: [
    { id: '1', code: 'loop', title: 'Loop', edition: 2023, type: 'basegame' },
    { id: '2', code: 'loop-2', title: 'Loop', edition: 2025, type: 'basegame' },
    { id: '3', code: 'loop-3', title: 'LOOP', edition: 2019, type: 'basegame' },
    { id: '4', code: 'loop-ext', title: 'Loop', edition: 2024, type: 'extension' },
    { id: '5', code: 'tales', title: 'Tales From The Loop', edition: 2020, type: 'basegame' },
    { id: '6', code: 'loop-bis', title: 'Loop', edition: 2023, type: 'basegame' },
  ] };
  const c = parseMyludoSearch(json);
  assert.equal(c[0].annee, 2023);
  const choisi = pickMyludo('Loop', c);
  assert.equal(choisi.id, '1', 'sans choix : le premier du site');
  assert.deepEqual(homonymesMyludo(choisi, c), [{ id: '2', annee: 2025 }, { id: '1', annee: 2023 }, { id: '3', annee: 2019 }], 'extension et titre différent écartés, une ligne par année, plus récent d\u2019abord');
  assert.deepEqual(homonymesMyludo(c[5], c).filter(h => h.annee === 2023), [{ id: '6', annee: 2023 }], 'le jeu choisi garde sa place à année égale');
  assert.equal(pickMyludo('Loop', c, '2').id, '2', 'choix par id');
  assert.equal(pickMyludo('Loop', c, '999').id, '1', 'id inconnu : choix normal');
  assert.equal(homonymesMyludo(pickMyludo('Tales From The Loop', c), c), null, 'un seul jeu : pas de ligne');
});

test('éditeurs MyLudo : rôle « Éditeur » de la fiche info (plusieurs possibles)', () => {
  assert.deepEqual(parseMyludoInfo(fx('myludo-info-clank.json')).editeurs, ['Dire Wolf', 'Renegade Game Studios']);
  assert.deepEqual(parseMyludoInfo(fx('myludo-info-abyss.json')).editeurs, ['Bombyx'], 'distributeur et auteurs écartés');
});
