// Teste le JavaScript de index.html tel quel (script extrait, exécuté avec un DOM minimal simulé).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(`${__dirname}/../index.html`, 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const el = () => ({ addEventListener() {}, value: '', innerHTML: '' });
const front = vm.runInNewContext(`${script}; ({ okk, tile, fr, myludo, liens, findBga, bgaBadge, auteur, retour, pile, panierHtml })`, {
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
test('semblables : bouton 🔍 portant le titre (échappé) pour relancer la recherche', () => {
  const h = front.myludo(ml({ similaires: [{ titre: "L'Île \"X\"", annee: 2019, url: 'u', note: 8 }] }), '#');
  assert.ok(h.includes('class="go"') && h.includes('data-q="L&#39;Île &quot;X&quot;"'), h);
});

const games = require('../lib/bga-games.json');
const lien = over => ({ query: 'abyss', myludo: { titre: 'Abyss' }, bggUrl: 'https://boardgamegeek.com/boardgame/361214/order-overload-cafe', liens: { bgg: 'https://boardgamegeek.com/geeksearch.php?q=x' }, ...over });
test('BGA : Abyss jouable, lien de la partie ; casse et accents ignorés', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(front.findBga(['abyss'], games))), { nom: 'Abyss', url: 'https://boardgamearena.com/gamepanel?game=abyss', bggId: 155987 });
  assert.ok(front.findBga(['7 Wonders DUEL'], games).url.endsWith('game=sevenwondersduel'));
  assert.ok(front.findBga(['Terraforming Mars'], games).url.endsWith('game=terraformingmars')); // pas la variante « dice game »
});
test('BGA : à une lettre près (« catane »), alias long, titre MyLudo en second recours', () => {
  assert.ok(front.findBga(['catane'], games).url.endsWith('game=catan'));
  assert.ok(front.findBga(['Les Colons de Catane'], games).url.endsWith('game=catan'));
  assert.ok(front.findBga(['clic', 'Abyss'], games).url.endsWith('game=abyss'));
});
test('BGA : Clank! absent, pas de correspondance « contient », alias court ignoré, liste absente → null', () => {
  assert.equal(front.findBga(['clank', 'Clank!'], games), null);
  assert.equal(front.findBga(['dune'], games), null);
  assert.equal(front.findBga(['TTR'], games), null);
  assert.equal(front.findBga(['abyss'], null), null);
  assert.equal(front.findBga([], games), null);
});
test('liens : page BGG directe', () => {
  const h = front.liens(lien(), games);
  assert.ok(h.includes('href="https://boardgamegeek.com/boardgame/361214/order-overload-cafe"') && h.includes('BoardGameGeek ↗'));
  assert.ok(!h.includes('Board Game Arena')); // la pastille BGA est à côté du nombre de joueurs, plus dans cette bande
});
test('liens : sans lien Okkazeo, repli par l’identifiant BGA ; sinon recherche BGG', () => {
  assert.ok(front.liens(lien({ bggUrl: null }), games).includes('href="https://boardgamegeek.com/boardgame/155987"'));
  const h = front.liens(lien({ bggUrl: null, query: 'clank', myludo: { titre: 'Clank!' } }), games);
  assert.ok(h.includes('geeksearch.php?q=x') && h.includes('Chercher sur BoardGameGeek'));
});
test('pastille BGA : jeu jouable → « BGA ✓ » cliquable vers la page du jeu sur BGA', () => {
  const h = front.bgaBadge(lien(), games);
  assert.ok(h.includes('<a class="bga oui"') && h.includes('href="https://boardgamearena.com/gamepanel?game=abyss"') && h.includes('BGA ✓'));
});
test('pastille BGA : jeu absent → coche barrée sans lien ; liste injoignable → rien', () => {
  const h = front.bgaBadge(lien({ query: 'clank', myludo: { titre: 'Clank!' } }), games);
  assert.ok(h.includes('bga non') && h.includes('<s>✓</s>') && !h.includes('href') && !h.includes('boardgamearena.com'));
  assert.equal(front.bgaBadge(lien(), null), '');
});
const jeuxAuteur = { nom: 'Paul Dennen', jeux: [{ titre: 'Dune Imperium', annee: 2021, url: 'https://www.myludo.fr/#!/game/dune-1' }, { titre: 'Eternal', annee: 2019, url: 'https://www.myludo.fr/#!/game/eternal-2' }] };
test('même auteur : encart à part (plus dans l’encart MyLudo), nom de l’auteur, jeux et bouton 🔍', () => {
  const h = front.auteur(ml({ memeAuteur: jeuxAuteur }));
  assert.ok(h.includes('class="aut"') && h.includes('Du même auteur · Paul Dennen') && h.includes('Dune Imperium') && h.includes('data-q="Eternal"'));
  assert.ok(!front.myludo(ml({ memeAuteur: jeuxAuteur }), '#').includes('Du même auteur'));
});
test('même auteur : absent ou vide → pas d’encart', () => {
  assert.equal(front.auteur(ml({ memeAuteur: null })), '');
  assert.equal(front.auteur(ml({ memeAuteur: { nom: 'X', jeux: [] } })), '');
  assert.equal(front.auteur(null), '');
});
test('bouton retour : absent sans historique, sinon « Retour à <jeu précédent> » (titre échappé)', () => {
  front.pile.length = 0;
  assert.equal(front.retour(), '');
  front.pile.push({ query: 'clank', myludo: { titre: '<b>Clank!</b>' } });
  const h = front.retour();
  assert.ok(h.includes('class="back"') && h.includes('Retour à &lt;b&gt;Clank!&lt;/b&gt;') && !h.includes('<b>Clank'));
  front.pile.length = 0;
  front.pile.push({ query: 'abyss', myludo: null });
  assert.ok(front.retour().includes('Retour à abyss'));
  front.pile.length = 0;
});

const panier = { jeux: [{ demande: '7 wonders duel', titre: '7 Wonders Duel', url: 'https://www.okkazeo.com/jeux/1/x', annonces: 22 }, { demande: 'zzz', titre: null, url: null, annonces: 0 }],
  vendeurs: [{ vendeur: 'gegeor', ville: 'Paris', cp: '75016', procheParis: true, envoi: false, nbJeux: 2, total: 38,
    annonces: [{ jeu: '7 Wonders Duel', prix: 18, etat: 'neuf', url: 'https://www.okkazeo.com/annonces/1/a' }, { jeu: 'Carcassonne', prix: 20, etat: 'neuf', url: 'https://www.okkazeo.com/annonces/2/b' }] }], erreurs: [] };
test('matchmaking : jeux trouvés ou non, vendeur avec ses annonces cliquables, près de Paris', () => {
  const h = front.panierHtml(panier);
  for (const x of ['7 Wonders Duel', '22 annonces', 'zzz : introuvable sur Okkazeo', 'gegeor', 'Paris', '(75016)', 'près de Paris', '2 jeux', '38 €', 'Carcassonne', 'href="https://www.okkazeo.com/annonces/2/b"']) assert.ok(h.includes(x), x);
});
test('matchmaking : aucun vendeur commun → message ; erreurs affichées ; texte échappé', () => {
  assert.ok(front.panierHtml({ ...panier, vendeurs: [] }).includes('Aucun vendeur ne propose au moins 2 de ces jeux'));
  assert.ok(front.panierHtml({ ...panier, erreurs: ['azul: HTTP 403'] }).includes('azul: HTTP 403'));
  assert.ok(!front.panierHtml({ ...panier, vendeurs: [{ ...panier.vendeurs[0], vendeur: '<img src=x>' }] }).includes('<img src=x>'));
});
test('cache : un jeu déjà chargé se réaffiche sans nouvel appel au webhook', async () => {
  let appels = 0;
  const out = { innerHTML: '', addEventListener() {} };
  const ctx = {
    document: { querySelector: s => (s === '#out' ? out : el()) }, location: { search: '' }, history: { replaceState() {} }, URLSearchParams,
    fetch: async u => { if (String(u).includes('/webhook/notes-jeux?')) { appels++; return { ok: true, json: async () => ({ query: 'abyss', myludo: null, liens: { bgg: '#' }, okkazeo: null }) }; } return { ok: false }; },
  };
  const f = vm.runInNewContext(`${script}; ({ search })`, ctx);
  await f.search('abyss');
  await f.search('Abyss ');
  assert.equal(appels, 1);
  assert.ok(out.innerHTML.includes('abyss'));
});
