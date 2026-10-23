// Teste le JavaScript de index.html tel quel (script extrait, exécuté avec un DOM minimal simulé).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(`${__dirname}/../index.html`, 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const el = () => ({ addEventListener() {}, value: '', innerHTML: '' });
const front = vm.runInNewContext(`${script}; ({ okk, tile, fr, myludo })`, {
  document: { querySelector: el }, location: { search: '' }, history: {}, fetch: async () => { throw new Error('pas de réseau'); }, URLSearchParams,
});

const annonce = (date, over = {}) => ({ prix: 20, etat: 'correct', ville: 'Ivry', cp: '94200', date, bonneAffaire: false, extensions: false, envoi: false, ...over });
const okkazeo = annonces => ({ total: 14, min: 20, max: 190, url: 'https://www.okkazeo.com/jeux/1/x', annonces });
const year = new Date().getFullYear();

test('date d\'une annonce de cette année : jour/mois', () => {
  assert.ok(front.okk(okkazeo([annonce(`${year}-10-10`)]), '#').includes('>10/10<'));
});
test('date d\'une annonce d\'une année précédente : l\'année est affichée (sinon elle paraît récente)', () => {
  assert.ok(front.okk(okkazeo([annonce(`${year - 1}-12-07`)]), '#').includes(`>07/12/${year - 1}<`));
});
test('aucune annonce près de Paris mais 14 en France → lien vers les annonces France', () => {
  const h = front.okk(okkazeo([]), '#');
  assert.ok(h.includes('0 près de Paris') && h.includes('Voir les 14 annonces France'));
});
test('note absente → « pas encore d\'avis », source nulle → « indisponible »', () => {
  assert.ok(front.tile('Philibert', 'red', { note: null, titre: 'Clank!', url: 'u' }, 5, 'avis', 's').includes('pas encore d\'avis'));
  assert.ok(front.tile('BGG', 'blue', null, 10, 'votes', 's').includes('indisponible'));
});
test('tuile MyLudo : note sur 10 et nombre de notes', () => {
  const h = front.tile('MyLudo', 'purple', { note: 8.3, avis: 1500, titre: 'Clank!', url: 'u' }, 10, 'notes', 's');
  assert.ok(h.includes('8,3') && h.includes('/10') && h.includes('1500 notes') && h.includes('MyLudo'));
});
test('texte venant des sites échappé (pas d\'injection HTML)', () => {
  const h = front.okk(okkazeo([annonce(`${year}-01-02`, { ville: '<img src=x onerror=alert(1)>' })]), '#');
  assert.ok(!h.includes('<img src=x'));
});

const ml = over => ({ note: 8.3, avis: 1500, titre: 'Clank!', url: 'https://www.myludo.fr/#!/game/clank-19410', annee: 2017, joueurs: '2 — 4', duree: 60, complexite: 2.5,
  mecaniques: ['Card-driven', 'Deck building'], themes: ['Dragons'], similaires: [{ titre: 'Tainted Grail', annee: 2019, url: 'https://www.myludo.fr/#!/game/tainted-grail-27766', note: 8.6 }], ...over });
test('encart MyLudo : note, infos, mécaniques, thèmes et semblables avec leur note', () => {
  const h = front.myludo(ml(), '#');
  for (const t of ['8,3', '/10', '1500 notes', '60 min', '2 — 4', '2,5/5', 'Deck building', 'Dragons', 'Semblable à', 'Tainted Grail', '8,6']) assert.ok(h.includes(t), t);
});
test('encart MyLudo : source nulle → indisponible ; mécaniques null → indisponible sans effacer la note', () => {
  assert.ok(front.myludo(null, 's').includes('indisponible'));
  const h = front.myludo(ml({ mecaniques: null, similaires: null }), '#');
  assert.ok(h.includes('indisponible') && h.includes('8,3') && !h.includes('Semblable à'));
});
test('encart MyLudo : texte venant du site échappé', () => {
  assert.ok(!front.myludo(ml({ mecaniques: ['<img src=x onerror=alert(1)>'] }), '#').includes('<img src=x'));
});
