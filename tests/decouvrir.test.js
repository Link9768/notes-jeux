// Découvrir : listes MyLudo réelles (enregistrées le 2026-11-18) et tri « Pour toi » sur les mécaniques MyLudo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parseDecouvrir, mecaniquesMl, procheDe, scoreDecouvrir, pourToiDecouvrir } = require('../lib/decouvrir.js');
const fx = f => JSON.parse(fs.readFileSync(`${__dirname}/fixtures/${f}`, 'utf8'));

test('liste MyLudo → jeux de base seulement, date, durée, tendance', () => {
  const tr = fx('myludo-trending.json');
  const jeux = parseDecouvrir(tr);
  assert.ok(tr.list.some(g => g.type === 'extension'), 'la fixture contient des extensions');
  assert.equal(jeux.length, tr.list.filter(g => g.type === 'basegame').length);
  assert.ok(!jeux.some(j => j.titre.startsWith('Bomb Busters - Le Kit Pro')));
  const tag = jeux.find(j => j.titre === 'Tag Team');
  assert.equal(tag.url, 'https://www.myludo.fr/#!/game/tag-team-85065');
  assert.equal(tag.duree, '15');
  assert.equal(tag.dureeMax, 15);
  assert.ok(tag.tendance > 90 && typeof tag.evolution === 'number' && tag.date);
  const up = parseDecouvrir(fx('myludo-upcoming.json'));
  const fl = up.find(j => j.titre.startsWith('Flamme Rouge'));
  assert.equal(fl.titre, 'Flamme Rouge – Édition Champion');
  assert.ok(fl.futur && fl.date === '20 nov 2026');
  assert.equal(parseDecouvrir(null).length, 0);
});

test('mécaniques MyLudo lues dans la fiche info', () => {
  const infos = fx('myludo-info-upcoming.json');
  assert.deepEqual(mecaniquesMl(infos['100816']), ['Placement De Tuiles']);
  assert.ok(mecaniquesMl(infos['99059']).includes('Combinaison'));
  assert.deepEqual(mecaniquesMl(null), []);
});

test('score Pour toi : verdicts sur des cas réels et construits', () => {
  const j = d => ({ id: 'x', dureeMax: d });
  // Terrasses de Kanoa (vraie fiche) : combinaison + tuiles, 25–40 min
  const kanoa = scoreDecouvrir(j(40), mecaniquesMl(fx('myludo-info-upcoming.json')['99059']));
  assert.ok(kanoa.oui.includes('combos et draft') && kanoa.oui.includes('pose de tuiles') && kanoa.oui.includes('partie courte'), JSON.stringify(kanoa));
  assert.equal(kanoa.verdict, 'Très ton style');
  // Orloj : placement d'ouvriers, 60–120 min → loin
  const orloj = scoreDecouvrir(j(120), mecaniquesMl(fx('myludo-info-upcoming.json')['96816']));
  assert.ok(orloj.non.includes('long (120 min)'));
  assert.equal(orloj.verdict, 'Loin de tes habitudes');
  // stop ou encore court
  assert.equal(scoreDecouvrir(j(20), ['Prise de risque', 'Collection']).verdict, 'Très ton style');
  // coopératif
  const coop = scoreDecouvrir(j(30), ['Coopération', 'Combinaison']);
  assert.ok(coop.non.includes('coopératif') && coop.verdict !== 'Très ton style');
  // rien de commun
  assert.equal(scoreDecouvrir(j(50), ['Enquête', 'Déduction']).verdict, 'Peu de points communs');
  // pas de mécanique
  const vide = scoreDecouvrir(j(20), []);
  assert.equal(vide.score, null);
  assert.equal(vide.verdict, 'Infos insuffisantes');
});

test('proche de : favori le plus ressemblant, mécaniques génériques ignorées', () => {
  const p = procheDe(['Construction De Tableau', 'Placement De Cartes', 'Gestion de main', 'Collection']);
  assert.equal(p.titre, 'Faraway');
  assert.ok(p.communes.includes('Construction De Tableau'));
  assert.equal(procheDe(['Gestion de main', 'Chance & Hasard', 'Combinaison']), null, 'que des mécaniques génériques');
  assert.equal(procheDe(['Placement De Tuiles']), null, 'une seule commune');
  assert.equal(procheDe(['Plis', 'Pari']).titre, 'Skull King');
  // pas proche de lui-même ni de sa gamme
  assert.equal(procheDe(['Prise de risque', 'Stop ou encore'], 'Flip 7 - Vengeance'), null);
  assert.equal(procheDe(['Plis', 'Pari'], 'Skull King'), null);
});

test('sélection Pour toi : meilleurs scores, ordre MyLudo à égalité, 5 max', () => {
  const jeux = [
    { id: 'a', score: 4, verdict: 'Dans tes goûts' }, { id: 'b', score: 8, verdict: 'Très ton style' },
    { id: 'c', score: 1, verdict: 'Peu de points communs' }, { id: 'd', score: 4, verdict: 'Dans tes goûts' },
    { id: 'e', score: null, verdict: 'Infos insuffisantes' },
  ];
  assert.deepEqual(pourToiDecouvrir(jeux), ['b', 'a', 'd']);
  assert.deepEqual(pourToiDecouvrir(jeux, 1), ['b']);
});
