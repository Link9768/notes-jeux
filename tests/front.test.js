// Teste le JavaScript de index.html tel quel (script extrait, exécuté avec un DOM minimal simulé).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(`${__dirname}/../index.html`, 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const el = () => ({ addEventListener() {}, value: '', innerHTML: '' });
const front = vm.runInNewContext(`${script}; ({ okk, tile, fr })`, {
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
test('texte venant des sites échappé (pas d\'injection HTML)', () => {
  const h = front.okk(okkazeo([annonce(`${year}-01-02`, { ville: '<img src=x onerror=alert(1)>' })]), '#');
  assert.ok(!h.includes('<img src=x'));
});
