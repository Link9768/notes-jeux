const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { mediane } = require('../lib/okkazeo.js');
const V = require('../lib/veille.js');
const CPS = JSON.parse(fs.readFileSync(`${__dirname}/../lib/cp-paris-10km.json`, 'utf8')).cps;
const bundle = name => execFileSync(process.execPath, [`${__dirname}/../scripts/bundle.mjs`, name], { encoding: 'utf8' });

const ann = (id, prix, extra = {}) => ({ vendeur: 'v' + id, prix, url: `https://www.okkazeo.com/annonces/${id}/jeu`, ville: 'Lyon', cp: '69003', etat: 'correct', envoi: true, ...extra });

test('médiane : milieu, moyenne des deux du milieu, null si vide', () => {
  assert.equal(mediane([30, 10, 20]), 20);
  assert.equal(mediane([10, 20, 30, 40]), 25);
  assert.equal(mediane([10, 21, 30, 41]), 25.5);
  assert.equal(mediane([]), null);
});

test('lireSuivis : nettoie, dédoublonne, plafonne ; null si la sauvegarde est illisible', () => {
  const r = V.lireSuivis({ suivis: [{ titre: 'Clank!', max: 25 }, { titre: 'clank! ' }, { titre: '' }, { titre: 'Abyss', max: -1 }] });
  assert.deepEqual(r, [{ titre: 'Clank!', max: 25 }, { titre: 'Abyss', max: null }]);
  assert.deepEqual(V.lireSuivis({ listes: [] }), []);
  assert.equal(V.lireSuivis(null), null);
  assert.equal(V.lireSuivis({ error: {} }), null);
  assert.equal(V.lireSuivis({ suivis: 'x' }), null);
  assert.equal(V.lireSuivis({ suivis: Array.from({ length: 60 }, (_, i) => ({ titre: 'Jeu ' + i })) }).length, 50);
});

test('alertesJeu : prix max perso (≤ max), annonce déjà signalée exclue', () => {
  const jeu = { titre: 'Abyss', annonces: [ann(1, 20), ann(2, 25), ann(3, 30)] };
  const a = V.alertesJeu(jeu, { titre: 'Abyss', max: 25 }, {}, CPS);
  assert.deepEqual(a.map(x => [x.id, x.prix, x.raison]), [['1', 20, 'max'], ['2', 25, 'max']]);
  assert.deepEqual(V.alertesJeu(jeu, { titre: 'Abyss', max: 25 }, { 1: '2026-11-27' }, CPS).map(x => x.id), ['2']);
});

test('alertesJeu : seuil automatique = 75 % de la médiane, au moins 3 annonces', () => {
  const jeu = { titre: 'Clank!', annonces: [10, 26, 26, 30, 40].map((p, i) => ann(i + 1, p)) };
  const a = V.alertesJeu(jeu, { titre: 'Clank!', max: null }, {}, CPS);
  assert.deepEqual(a.map(x => [x.prix, x.raison, x.mediane, x.ecart]), [[10, 'mediane', 26, -62]]);
  assert.deepEqual(V.alertesJeu({ titre: 'X', annonces: [ann(1, 5), ann(2, 50)] }, { max: null }, {}, CPS), []);
  assert.deepEqual(V.alertesJeu({ titre: 'X', annonces: [{ ...ann(1, 5), url: null }, ann(2, 50), ann(3, 50)] }, { max: null }, {}, CPS), []); // sans id : ignorée
});

test('alertesJeu : le prix max prime sur le seuil automatique', () => {
  const jeu = { titre: 'Clank!', annonces: [ann(1, 18), ann(2, 30), ann(3, 30)] }; // médiane 30 : 18 passerait le seuil auto
  assert.deepEqual(V.alertesJeu(jeu, { max: 15 }, {}, CPS), []);
  assert.equal(V.alertesJeu(jeu, { max: null }, {}, CPS).length, 1);
});

test('alertesJeu : près de Paris (75013 oui, 69003 non)', () => {
  const jeu = { titre: 'Abyss', annonces: [ann(1, 10, { ville: 'Paris', cp: '75013' }), ann(2, 10)] };
  const a = V.alertesJeu(jeu, { max: 20 }, {}, CPS);
  assert.deepEqual(a.map(x => x.procheParis), [true, false]);
});

test('alertesVendeurs : 2 jeux suivis chez le même vendeur ; déjà signalé exclu ; un 3e jeu = nouvelle alerte', () => {
  const alice = (id, prix) => ({ vendeur: 'Alice', ville: 'Paris', cp: '75011', envoi: true, url: `https://www.okkazeo.com/annonces/${id}/x`, prix });
  const jeux = [{ titre: 'Clank!', annonces: [alice(123, 20), ann(9, 30)] }, { titre: 'Abyss', annonces: [alice(456, 25)] }];
  const a = V.alertesVendeurs(jeux, {}, CPS);
  assert.equal(a.length, 1);
  assert.equal(a[0].cle, 'v:alice:123,456');
  assert.deepEqual([a[0].vendeur, a[0].procheParis, a[0].total], ['Alice', true, 45]);
  assert.deepEqual(V.alertesVendeurs(jeux, { 'v:alice:123,456': '2026-11-28' }, CPS), []);
  const jeux3 = jeux.concat([{ titre: 'Azul', annonces: [alice(789, 15)] }]);
  assert.equal(V.alertesVendeurs(jeux3, { 'v:alice:123,456': '2026-11-28' }, CPS)[0].cle, 'v:alice:123,456,789');
});

test('historique : même jour remplacé, 365 points au plus ; purge des annonces signalées il y a plus de 180 jours', () => {
  const histo = {};
  V.ajouterPoint(histo, 'Clank!', 'Clank!', '2026-11-28', { med: 26, min: 15, n: 12 });
  V.ajouterPoint(histo, ' clank!', 'Clank!', '2026-11-28', { med: 27, min: 15, n: 13 });
  assert.deepEqual(histo['clank!'].pts, [['2026-11-28', 27, 15, 13]]);
  for (let i = 0; i < 400; i++) V.ajouterPoint(histo, 'Clank!', 'Clank!', new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10), { med: 1, min: 1, n: 1 });
  assert.equal(histo['clank!'].pts.length, 365);
  assert.equal(V.ajouterPoint(histo, 'Azul', null, '2026-11-28', null).pts.length, 0); // introuvable : pas de point
  const s = { 1: '2026-11-28', 2: '2026-06-01', 3: '2026-05-01', 'v:a:1,2': '2025-01-01' };
  V.purger(s, '2026-11-28');
  assert.deepEqual(Object.keys(s).sort(), ['1', '2']);
});

test('messageVeille : alertes, vendeurs, Paris en tête, URL, erreurs, panne, rien', () => {
  const al = (o) => ({ id: '1', jeu: 'Clank!', prix: 18, url: 'https://www.okkazeo.com/annonces/1/clank', ville: 'Paris', cp: '75013', etat: 'correct', envoi: true, procheParis: true, raison: 'mediane', max: null, mediane: 26, ecart: -31, ...o });
  const lyon = al({ jeu: 'Abyss', prix: 20, ville: 'Lyon', cp: '69003', procheParis: false, raison: 'max', max: 25, mediane: null, ecart: null, url: 'https://www.okkazeo.com/annonces/2/abyss' });
  const vend = [{ cle: 'v:alice:1,2', vendeur: 'alice', ville: 'Paris', cp: '75011', procheParis: true, total: 45, annonces: [{ jeu: 'Clank!', prix: 20, url: 'https://x/1' }, { jeu: 'Abyss', prix: 25, url: 'https://x/2' }] }];
  const m = V.messageVeille({ jour: '2026-11-28', alertes: [lyon, al({})], vendeurs: vend, erreurs: ['Azul (HTTP 403)'], nbJeux: 3 });
  assert.ok(m.startsWith('🔔 Notes Jeux · veille du 28/11'));
  assert.ok(m.includes('📍 près de Paris') && m.includes('≤ ton max 25 €') && m.includes('sous la médiane 26 €') && m.includes('−31 %'));
  assert.ok(m.includes('https://www.okkazeo.com/annonces/1/clank') && m.includes('2 jeux pour 45 €') && m.includes('envoi possible'));
  assert.ok(m.indexOf('Paris (75013)') < m.indexOf('Lyon (69003)'));
  assert.ok(m.includes('⚠ Non vérifiés : Azul (HTTP 403)'));
  assert.equal(V.messageVeille({ jour: '2026-11-28', nbJeux: 3 }), null);
  assert.equal(V.messageVeille({ jour: '2026-11-28', nbJeux: 12, manuel: true }), 'Rien de nouveau · 12 jeux vérifiés.');
  const p = V.messageVeille({ jour: '2026-11-28', panne: 'HTTP 403 https://www.okkazeo.com/x', nbJeux: 3 });
  assert.ok(p.includes('Okkazeo ne répond pas (HTTP 403, 3 jeux d\'affilée)') && p.includes('/veille') && !p.includes('https://'));
  const beaucoup = V.messageVeille({ jour: '2026-11-28', alertes: Array.from({ length: 200 }, (_, i) => al({ id: String(i), jeu: 'Jeu ' + i })), erreurs: ['Azul (HTTP 403)'], nbJeux: 200 });
  assert.ok(beaucoup.length <= 3800, String(beaucoup.length));
  assert.match(beaucoup, /… et \d+ autres/);
});

test('pas de séquence \\uXXXX dans les bundles Veille', () => {
  for (const n of ['veille', 'veille-inscription', 'veille-histo']) assert.ok(!/\\u[0-9a-fA-F]{4}/.test(bundle(n)), n);
});
