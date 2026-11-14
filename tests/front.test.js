// Teste le JavaScript de index.html tel quel (script extrait, exécuté avec un DOM minimal simulé).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(`${__dirname}/../index.html`, 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const el = () => ({ addEventListener() {}, value: '', innerHTML: '' });
const front = vm.runInNewContext(`${script}; ({ okk, tile, fr, bggCard, liens, findBga, bgaBadge, auteur, retour, pile, panierHtml, semblables, lbcUrl })`, {
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

const ml = over => ({ note: 8.3, avis: 1500, titre: 'Clank!', url: 'https://www.myludo.fr/#!/game/clank-19410', annee: 2017, joueurs: '2 — 4', duree: 60, complexite: 2.5, ...over });
const bggD = over => ({ query: 'abyss', myludo: { titre: 'Abyss' }, liens: { bgg: 'https://boardgamegeek.com/geeksearch.php?q=x' },
  bgg: { note: 7.3, votes: 17096, duree: '30–60', joueurs: '2–4', poids: 2.31, annee: 2014, titre: 'Abyss', url: 'https://boardgamegeek.com/boardgame/155987',
    mecaniques: ['Enchères', 'Gestion de main', 'Stop ou encore'], themes: ['Fantastique'] }, ...over });
test('grand encart BGG : note, votes, infos, style de jeu en français, lien vers la page BGG', () => {
  const h = front.bggCard(bggD(), null);
  for (const t of ['BoardGameGeek', '7,3', '/10', '17096 votes', '30–60 min', '👥 2–4', '2,31/5', 'Enchères', 'Stop ou encore', 'chip th">Fantastique', 'href="https://boardgamegeek.com/boardgame/155987"']) assert.ok(h.includes(t), t);
});
test('grand encart BGG : fiche absente → indisponible + recherche BGG ; style vide → « non renseigné » sans effacer la note', () => {
  const h = front.bggCard(bggD({ bgg: null, bggUrl: null, query: 'clank', myludo: { titre: 'Clank!' } }), null);
  assert.ok(h.includes('indisponible') && h.includes('Chercher sur BoardGameGeek'));
  const v = front.bggCard(bggD({ bgg: { ...bggD().bgg, mecaniques: [], themes: [] } }), null);
  assert.ok(v.includes('non renseigné') && v.includes('7,3'));
});
test('grand encart BGG : texte échappé', () => {
  assert.ok(!front.bggCard(bggD({ bgg: { ...bggD().bgg, mecaniques: ['<img src=x onerror=alert(1)>'] } }), null).includes('<img src=x'));
});
test('tuile MyLudo dans la page : note, notes, titre, difficulté MyLudo, sans durée', async () => {
  const els = {};
  const elx = sel => (els[sel] = els[sel] || { innerHTML: '', value: '', addEventListener() {} });
  const ctx = { document: { querySelector: elx }, location: { search: '' }, history: { replaceState() {} }, URLSearchParams,
    fetch: async u => (String(u).includes('/webhook/') ? { ok: true, json: async () => ({ query: 'clank', myludo: ml(), bgg: null, liens: { bgg: '#' }, okkazeo: null }) } : { ok: false }) };
  const f = vm.runInNewContext(`${script}; ({ lancer })`, ctx);
  f.lancer('clank');
  await new Promise(r => setTimeout(r, 10));
  const tuiles = els['#out'].innerHTML.match(/<div class="tiles">[\s\S]*?<\/div><\/div><\/div>/)[0];
  for (const t of ['MyLudo', '8,3', '1500 notes', '« Clank! »']) assert.ok(tuiles.includes(t), t);
  assert.ok(!tuiles.includes('⏱'));
  assert.ok(tuiles.includes('⚖ 2,5/5'));
});
test('semblables : bouton 🔍 portant le titre (échappé) pour relancer la recherche', () => {
  const h = front.semblables({ similaires: [{ titre: "L'Île \"X\"", annee: 2019, url: 'u', note: 8 }] });
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
test('même auteur : encart à part, nom de l’auteur, jeux et bouton 🔍', () => {
  const h = front.auteur(ml({ memeAuteur: jeuxAuteur }));
  assert.ok(h.includes('class="aut"') && h.includes('Du même auteur · Paul Dennen') && h.includes('Dune Imperium') && h.includes('data-q="Eternal"'));
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

test('plusieurs jeux séparés par des virgules : un onglet par jeu, tous chargés en parallèle, navigation sans rechargement', async () => {
  const appels = [];
  const els = {};
  const elx = sel => (els[sel] = els[sel] || { innerHTML: '', value: '', handlers: {}, addEventListener(t, h) { this.handlers[t] = h; } });
  const ctx = {
    document: { querySelector: elx }, location: { search: '' }, history: { replaceState() {} }, scrollTo() {}, URLSearchParams,
    fetch: async u => {
      const m = String(u).match(/webhook\/notes-jeux\?q=(.*)$/);
      if (!m) return { ok: false };
      const q = decodeURIComponent(m[1]);
      appels.push(q);
      return { ok: true, json: async () => ({ query: q, myludo: { titre: 'Titre ' + q }, liens: { bgg: '#' }, okkazeo: null }) };
    },
  };
  const f = vm.runInNewContext(`${script}; ({ lancer })`, ctx);
  f.lancer('abyss, Clank ; abyss, azul, a, b, c, d, e');
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(appels.sort(), ['Clank', 'a', 'abyss', 'azul', 'b', 'c', 'd', 'e'].sort()); // doublon retiré
  const out = els['#out'];
  assert.ok(out.innerHTML.includes('class="onglets"') && out.innerHTML.includes('Titre abyss') && out.innerHTML.includes('onglet-g on'));
  const clic = i => out.handlers.click({ target: { closest: s => (s === '.onglet' ? { dataset: { i: String(i) } } : null) } });
  clic(2);
  await new Promise(r => setTimeout(r, 5));
  assert.ok(out.innerHTML.includes('<h1>Titre azul</h1>'), 'onglet 3 affiché');
  assert.equal(appels.length, 8); // aucun nouvel appel en changeant d'onglet
});
test('un seul jeu : pas de barre d’onglets', async () => {
  const els = {};
  const elx = sel => (els[sel] = els[sel] || { innerHTML: '', value: '', addEventListener() {} });
  const ctx = { document: { querySelector: elx }, location: { search: '' }, history: { replaceState() {} }, URLSearchParams,
    fetch: async u => (String(u).includes('/webhook/') ? { ok: true, json: async () => ({ query: 'abyss', myludo: null, liens: { bgg: '#' }, okkazeo: null }) } : { ok: false }) };
  const f = vm.runInNewContext(`${script}; ({ lancer })`, ctx);
  f.lancer('abyss');
  await new Promise(r => setTimeout(r, 10));
  assert.ok(!els['#out'].innerHTML.includes('class="onglets"'));
});

test('liens : la page BGG vient de la fiche BGG en priorité (token BGG), puis d’Okkazeo', () => {
  const h = front.liens(lien({ bgg: { url: 'https://boardgamegeek.com/boardgame/155987' }, bggUrl: 'https://boardgamegeek.com/boardgame/1/autre' }), games);
  assert.ok(h.includes('href="https://boardgamegeek.com/boardgame/155987"') && !h.includes('/autre'));
});

test('tuile BGG : durée et poids affichés sous la note', () => {
  const h = front.tile('BGG', 'blue', { note: 7.8, votes: 48292, duree: '30–60', poids: 2.23, titre: 'Clank!', url: 'u' }, 10, 'votes', 's');
  assert.ok(h.includes('7,8') && h.includes('48292 votes') && h.includes('⏱ 30–60 min') && h.includes('⚖ 2,23/5'));
  const sans = front.tile('Philibert', 'red', { note: 4.5, avis: 3, titre: 'X', url: 'u' }, 5, 'avis', 's');
  assert.ok(!sans.includes('⏱') && !sans.includes('⚖')); // les autres sources n'ont ni durée ni poids
});

test('encart « Les joueurs aiment aussi » : recommandations BGG avec note et bouton 🔍 ; rien si absentes', () => {
  const h = front.semblables({ similaires: [{ titre: 'Everdell', annee: 2018, url: 'https://boardgamegeek.com/boardgame/199792/everdell', note: 8 }] });
  assert.ok(h.includes('Les joueurs aiment aussi · recommandations BGG') && h.includes('Everdell') && h.includes('href="https://boardgamegeek.com/boardgame/199792/everdell"') && h.includes('data-q="Everdell"'));
  assert.equal(front.semblables({ similaires: null }), '');
  assert.equal(front.semblables({ similaires: [] }), '');
});

// ---- v2 : rang, idéal, extensions, mécaniques cliquables, bonne affaire, comparateur, onglets ajoutés par 🔍
const front2 = vm.runInNewContext(`${script}; ({ bggCard, okk, comparerHtml, dealTag, prixNeuf, tile })`, {
  document: { querySelector: el }, location: { search: '' }, history: {}, fetch: async () => { throw new Error('pas de réseau'); }, URLSearchParams,
});
const bggV2 = over => ({ query: 'abyss', myludo: { titre: 'Abyss' }, liens: { bgg: '#' }, bgg: { id: '155987', note: 7.3, votes: 17096, duree: '30–60', joueurs: '2–4', poids: 2.31, annee: 2014,
  titre: 'Abyss', url: 'https://boardgamegeek.com/boardgame/155987', rang: 453, rangCat: { rang: 341, nom: 'stratégie' }, ideal: '4', extensions: 7,
  mecaniques: [{ id: '2012', nom: 'Enchères' }, { id: '2661', nom: 'Stop ou encore' }], themes: ['Fantastique'], ...over } });
test('encart BGG v2 : rang général + catégorie, idéal à, pastille Extensions ✓ cliquable, mécaniques cliquables', () => {
  const h = front2.bggCard(bggV2(), null);
  for (const t of ['🏆 #453 · #341 stratégie', '👥 2–4 · idéal à 4', 'data-ext="155987"', 'Extensions ✓', 'data-meca="2661"', 'data-nom="Stop ou encore"', 'id="mecabox"', 'id="extbox"']) assert.ok(h.includes(t), t);
  const sans = front2.bggCard(bggV2({ extensions: 0, rang: null, ideal: null }), null);
  assert.ok(!sans.includes('Extensions ✓') && !sans.includes('🏆') && !sans.includes('idéal'));
});
test('bonne affaire : écart au neuf le moins cher (Esprit Jeu / Philibert), couleur selon l’écart', () => {
  assert.equal(front2.prixNeuf({ espritjeu: { prix: 54 }, philibert: { prix: 57.9 } }), 54);
  assert.equal(front2.prixNeuf({ espritjeu: null, philibert: { prix: null } }), null);
  assert.ok(front2.dealTag(30, 54).includes('deal top') && front2.dealTag(30, 54).includes('−44 %'));
  assert.ok(front2.dealTag(45, 54).includes('deal moy'));
  assert.ok(front2.dealTag(60, 54).includes('deal bof') && front2.dealTag(60, 54).includes('+11 %'));
  assert.equal(front2.dealTag(30, null), '');
  const h = front2.okk(okkazeo([annonce(`${year}-01-02`, { prix: 20, cp: '75013' })]), '#', 54);
  assert.ok(h.includes('−63 %') && h.includes('neuf dès 54 €'));
});
test('tuile boutique : prix neuf affiché', () => {
  assert.ok(front2.tile('Philibert', 'red', { note: 4.7, avis: 3, titre: 'X', url: 'u', prix: 57.9 }, 5, 'avis', 's').includes('57,9 € neuf'));
});
test('comparateur : une colonne par jeu, meilleure note / plus petit prix en vert, valeur absente « – »', () => {
  const a = { query: 'a', myludo: { titre: 'Abyss', note: 7.4 }, bgg: { note: 7.3, rang: 453, poids: 2.3 }, espritjeu: { prix: 32 }, okkazeo: { min: 30 } };
  const c = { query: 'c', myludo: { titre: 'Clank!', note: 8.3 }, bgg: { note: 7.8, rang: 165 }, philibert: { prix: 45 }, okkazeo: { min: 20 } };
  const h = front2.comparerHtml([a, c, null]);
  assert.ok(h.includes('<th>Abyss</th>') && h.includes('<th>Clank!</th>'));
  assert.ok(h.includes('<td class="best">7,8/10</td>') && h.includes('<td class="best">#165</td>') && h.includes('<td class="best">32 €</td>') && h.includes('<td class="best">20 €</td>'));
  assert.ok(h.includes('<td>–</td>')); // poids de Clank absent
  assert.ok(front2.comparerHtml([a]).includes('au moins 2 jeux'));
});
test('🔍 ouvre le jeu ET l’ajoute en onglet (le jeu d’origine aussi), ✕ ferme, bouton 🛒 vers le matchmaking', async () => {
  const els = {};
  const elx = sel => (els[sel] = els[sel] || { innerHTML: '', value: '', handlers: {}, addEventListener(t, h) { this.handlers[t] = h; }, scrollIntoView() {}, focus() {} });
  const ctx = { document: { querySelector: elx }, location: { search: '' }, history: { replaceState() {} }, scrollTo() {}, URLSearchParams,
    fetch: async u => { const m = String(u).match(/notes-jeux\?q=(.*)$/); return m ? { ok: true, json: async () => ({ query: decodeURIComponent(m[1]), myludo: { titre: 'T ' + decodeURIComponent(m[1]) }, liens: { bgg: '#' }, okkazeo: null }) } : { ok: false }; } };
  const f = vm.runInNewContext(`${script}; ({ lancer, onglets: () => onglets, actif: () => actif })`, ctx);
  f.lancer('abyss');
  await new Promise(r => setTimeout(r, 10));
  assert.equal(f.onglets().length, 0); // une seule recherche : pas d'onglets
  const out = els['#out'];
  const clic = cible => out.handlers.click({ target: { closest: s => cible(s) } });
  clic(s => (s === '.go' ? { dataset: { q: 'ra' } } : null));
  await new Promise(r => setTimeout(r, 10));
  assert.deepEqual([...f.onglets()], ['abyss', 'ra']);
  assert.equal(f.actif(), 1);
  assert.ok(out.innerHTML.includes('<h1>T ra</h1>') && out.innerHTML.includes('data-x="0"') && out.innerHTML.includes('⚖ Comparer'));
  assert.ok(out.innerHTML.includes('Retour à T abyss')); // le bouton Retour reste
  assert.ok(els['#vers'].innerHTML.includes('🛒 2 jeux → matchmaking'));
  els['#vers'].handlers.click({ target: { closest: s => (s === '#versPanier' ? {} : null) } });
  assert.equal(els['#pj'].value, 'T abyss\nT ra');
  clic(s => (s === '[data-x]' ? { dataset: { x: '1' } } : null));
  await new Promise(r => setTimeout(r, 10));
  assert.deepEqual([...f.onglets()], ['abyss']);
  assert.ok(out.innerHTML.includes('<h1>T abyss</h1>'));
});

// ---- extensions ouvertes dans l'appli, liens sans pop-up, listes
const front3 = vm.runInNewContext(`${script}; ({ extensionsHtml, bgaBadge, okk })`, {
  document: { querySelector: el }, location: { search: '' }, history: {}, fetch: async () => { throw new Error('pas de réseau'); }, URLSearchParams,
});
test('extension : son titre ouvre sa page de jeu dans l’appli (data-q), pas BoardGameGeek', () => {
  const h = front3.extensionsHtml([{ titre: 'Abyss: Kraken', annee: 2015, url: 'https://boardgamegeek.com/boardgame/1', note: 7.4 }]);
  assert.ok(h.includes('class="lien" data-q="Abyss: Kraken"') && !h.includes('href='), h);
});
test('liens externes dans le même onglet (pas de pop-up) ; pastille BGA suivie du + « À tester sur BGA »', () => {
  assert.ok(!front3.okk(okkazeo([]), '#').includes('_blank'));
  const h = front3.bgaBadge(lien(), games);
  assert.ok(!h.includes('_blank') && h.includes('class="bga plus"') && h.includes('data-liste="À tester sur BGA"'));
  assert.ok(!front3.bgaBadge(lien({ query: 'clank', myludo: { titre: 'Clank!' } }), games).includes('plus'));
});
test('listes : ajout depuis le jeu, gardées dans localStorage, écran « Mes listes », création, retrait', async () => {
  const stock = {};
  const els = {};
  const elx = sel => (els[sel] = els[sel] || { innerHTML: '', value: '', handlers: {}, addEventListener(t, h) { this.handlers[t] = h; }, querySelectorAll: () => [], scrollIntoView() {}, focus() {} });
  const ctx = { document: { querySelector: elx }, location: { search: '' }, history: { replaceState() {} }, scrollTo() {}, URLSearchParams,
    localStorage: { getItem: k => stock[k] ?? null, setItem: (k, v) => { stock[k] = v; } },
    fetch: async u => (String(u).includes('notes-jeux?q=') ? { ok: true, json: async () => ({ query: 'abyss', myludo: { titre: 'Abyss' }, liens: { bgg: '#' }, okkazeo: null }) } : { ok: false }) };
  const f = vm.runInNewContext(`${script}; ({ lancer, listes })`, ctx);
  assert.deepEqual([...f.listes.map(l => l.nom)], ['À essayer', 'À acheter', 'À tester sur BGA', 'Ma ludothèque']);
  f.lancer('abyss');
  await new Promise(r => setTimeout(r, 10));
  const out = els['#out'];
  assert.ok(out.innerHTML.includes('＋ Liste') && out.innerHTML.includes('data-liste="À acheter"'));
  const clic = cible => out.handlers.click({ target: { closest: s => cible(s) } });
  clic(s => (s === '[data-liste]' ? { dataset: { liste: 'À acheter' } } : null));
  assert.deepEqual(JSON.parse(stock['notesJeux.listes']).find(l => l.nom === 'À acheter').jeux, ['Abyss']);
  assert.ok(els['#vers'].innerHTML.includes('📋 Mes listes (1)'));
  els['#vers'].handlers.click({ target: { closest: s => (s === '#versListes' ? {} : null) } });
  assert.ok(out.innerHTML.includes('📋 Mes listes') && out.innerHTML.includes('data-q="Abyss"') && out.innerHTML.includes('Retour à Abyss'));
  clic(s => (s === '[data-nvl]' ? { closest: () => ({ querySelector: () => ({ value: ' Soirées ' }) }) } : null));
  assert.ok(out.innerHTML.includes('Soirées · 0') && out.innerHTML.includes('data-suppr="Soirées"'));
  assert.ok(!out.innerHTML.includes('data-suppr="À acheter"')); // listes fixes non supprimables
  clic(s => (s === '[data-retire]' ? { dataset: { retire: 'À acheter', titre: 'Abyss' } } : null));
  assert.ok(out.innerHTML.includes('À acheter · 0'));
  const f2 = vm.runInNewContext(`${script}; ({ listes })`, { ...ctx, document: { querySelector: el } });
  assert.ok(f2.listes.some(l => l.nom === 'Soirées')); // relue au chargement suivant
});

test('liste collée (un jeu par ligne, puces, numéros, tableur) → titres séparés par des virgules, espaces gardés', () => {
  const f = vm.runInNewContext(`${script}; ({ listeCollee })`, { document: { querySelector: el }, location: { search: '' }, history: {}, fetch: async () => { throw new Error('x'); }, URLSearchParams });
  assert.equal(f.listeCollee('7 Wonders Duel\r\n- Abyss\n\n2. Skull King\tAzul\n'), '7 Wonders Duel, Abyss, Skull King, Azul');
});
test('jusqu’à 20 jeux dans la barre, chargés 6 à la fois', async () => {
  const appels = [];
  const els = {};
  const elx = sel => (els[sel] = els[sel] || { innerHTML: '', value: '', addEventListener() {} });
  const ctx = { document: { querySelector: elx }, location: { search: '' }, history: { replaceState() {} }, URLSearchParams,
    fetch: async u => { const m = String(u).match(/notes-jeux\?q=(.*)$/); if (!m) return { ok: false }; appels.push(m[1]); return { ok: true, json: async () => ({ query: m[1], myludo: null, liens: { bgg: '#' }, okkazeo: null }) }; } };
  const f = vm.runInNewContext(`${script}; ({ lancer, onglets: () => onglets })`, ctx);
  f.lancer(Array.from({ length: 25 }, (_, i) => 'jeu' + i).join(', '));
  await new Promise(r => setTimeout(r, 30));
  assert.equal(f.onglets().length, 20);
  assert.equal(appels.length, 20);
});
test('pastille Duo : « Duo ! » si intégrable, « Duo » sinon, clic = page du duo dans l’appli ; rien sans duo', () => {
  const f = vm.runInNewContext(`${script}; ({ duoBadge })`, { document: { querySelector: el }, location: { search: '' }, history: {}, fetch: async () => { throw new Error('x'); }, URLSearchParams });
  const h = f.duoBadge({ duo: { titre: 'Res Arcana Duo', url: 'u', integrable: true } });
  assert.ok(h.includes('class="bga duo"') && h.includes('data-q="Res Arcana Duo"') && h.includes('>Duo !<'), h);
  assert.ok(f.duoBadge({ duo: { titre: 'X', url: 'u', integrable: false } }).includes('>Duo<'));
  assert.equal(f.duoBadge({ duo: null }), '');
});
test('jumeaux préchargés à l’affichage du jeu (sans attendre le clic)', async () => {
  const urls = [];
  const els = {};
  const elx = sel => (els[sel] = els[sel] || { innerHTML: '', value: '', addEventListener() {} });
  const ctx = { document: { querySelector: elx }, location: { search: '' }, history: { replaceState() {} }, URLSearchParams,
    fetch: async u => { urls.push(String(u)); return String(u).includes('notes-jeux?q=') ? { ok: true, json: async () => ({ query: 'abyss', myludo: null, bgg: { id: '155987', note: 7.3 }, liens: { bgg: '#' }, okkazeo: null }) } : { ok: false }; } };
  const f = vm.runInNewContext(`${script}; ({ lancer })`, ctx);
  f.lancer('abyss');
  await new Promise(r => setTimeout(r, 10));
  assert.ok(urls.some(u => u.includes('notes-jeux-outils?op=jumeaux&id=155987')), urls.join('\n'));
});
test('vidéos des règles : cherchées à l’affichage (titre MyLudo puis BGG), encart sous Okkazeo ; rien sans vidéo', async () => {
  const urls = [];
  const els = {};
  const elx = sel => (els[sel] = els[sel] || { innerHTML: '', value: '', addEventListener() {} });
  const vid = { id: 'np11lHh2nak', titre: 'LudoChrono - Res Arcana', duree: '5:16', url: 'https://www.youtube.com/watch?v=np11lHh2nak', image: 'https://i.ytimg.com/vi/np11lHh2nak/mqdefault.jpg' };
  const ctx = { document: { querySelector: elx }, location: { search: '' }, history: { replaceState() {} }, URLSearchParams,
    fetch: async u => { urls.push(String(u)); if (String(u).includes('op=videos')) return { ok: true, json: async () => ({ op: 'videos', ludochrono: vid, chalet: null }) };
      return String(u).includes('notes-jeux?q=') ? { ok: true, json: async () => ({ query: 'res arcana', myludo: { titre: 'Res Arcana' }, bgg: { id: '262712', titre: 'Res Arcana' }, liens: { bgg: '#' }, okkazeo: null }) } : { ok: false }; } };
  const f = vm.runInNewContext(`${script}; ({ lancer, videosHtml })`, ctx);
  f.lancer('res arcana');
  await new Promise(r => setTimeout(r, 20));
  assert.ok(urls.some(u => u.includes('op=videos&q=Res%20Arcana&q2=Res%20Arcana')), urls.join('\n'));
  assert.ok(els['#out'].innerHTML.indexOf('id="videos"') > els['#out'].innerHTML.indexOf('class="okk"'));
  assert.ok(els['#videos'].innerHTML.includes('▶ Vidéos des règles') && els['#videos'].innerHTML.includes('LudoChrono - Res Arcana') && els['#videos'].innerHTML.includes('5:16'));
  assert.ok(els['#videos'].innerHTML.includes('target="_blank" rel="noopener"')); // vidéo = nouvel onglet
  assert.equal(f.videosHtml({ ludochrono: null, chalet: null }), '');
});
test('lien Leboncoin : catégorie jeux, liste dans le hash, 100 jeux au plus ; favori et bouton présents', () => {
  const u = front.lbcUrl(['Azul', 'Clank']);
  assert.ok(u.startsWith('https://www.leboncoin.fr/recherche?category=41') && u.endsWith('#nj=Azul%7CClank'), u);
  assert.equal(decodeURIComponent(front.lbcUrl(Array.from({ length: 101 }, (_, i) => 'j' + i)).split('#nj=')[1]).split('|').length, 100);
  assert.ok(/href="javascript:[^"]*link9768\.github\.io\/notes-jeux\/lbc\.js/.test(html));
  assert.ok(html.includes('id="plbc"'));
});

test('rejouabilité dans l\'encart BGG : niveau, parties par propriétaire, cas escape game et jeu ancien', () => {
  const el = () => ({ innerHTML: '', value: '', addEventListener() {} });
  const f = vm.runInNewContext(`${script}; ({ rejouHtml })`, { document: { querySelector: el }, location: { search: '' }, history: {}, fetch: async () => { throw new Error('x'); }, URLSearchParams });
  assert.ok(f.rejouHtml({ niveau: 'forte', parties: 4.9, type: null, proprietaires: 191106, ancien: false }).includes('🔁 Rejouabilité forte · 4,9 parties/propriétaire'));
  assert.ok(f.rejouHtml({ niveau: 'unique', parties: 0.6, type: 'escape', proprietaires: 12888 }).includes('Usage unique (escape game)'));
  assert.ok(f.rejouHtml({ niveau: 'faible', parties: 1.8, type: null, proprietaires: 246777, ancien: true }).includes('jeu ancien'));
  assert.ok(f.rejouHtml({ niveau: 'moyenne', parties: 2.8, type: null, proprietaires: 504 }).includes('peu de données'));
  assert.equal(f.rejouHtml(null), '');
});

test('ma ludothèque : 38 jeux préremplis, bouton à côté de Mes listes, hors du compteur et de l\'écran Mes listes, ajout et retrait', async () => {
  const stock = {};
  const els = {};
  const elx = sel => (els[sel] = els[sel] || { innerHTML: '', value: '', handlers: {}, addEventListener(t, h) { this.handlers[t] = h; }, querySelectorAll: () => [], scrollIntoView() {}, focus() {} });
  const ctx = { document: { querySelector: elx }, location: { search: '' }, history: { replaceState() {} }, scrollTo() {}, URLSearchParams,
    localStorage: { getItem: k => stock[k] ?? null, setItem: (k, v) => { stock[k] = v; } }, fetch: async () => ({ ok: false }) };
  const f = vm.runInNewContext(`${script}; ({ listes, afficherListes, majVers })`, ctx);
  const ludo = f.listes.find(l => l.nom === 'Ma ludothèque');
  assert.equal(ludo.jeux.length, 38);
  for (const j of ['Celestia', 'Skull King', '7 Wonders Duel', 'Schotten Totten', 'Service Compris']) assert.ok(ludo.jeux.includes(j), j);
  f.majVers();
  assert.ok(els['#vers'].innerHTML.includes('📚 Ma ludothèque (38)') && els['#vers'].innerHTML.includes('📋 Mes listes'));
  assert.ok(!els['#vers'].innerHTML.includes('Mes listes ('), 'la ludothèque ne compte pas dans Mes listes');
  f.afficherListes();
  assert.ok(!els['#out'].innerHTML.includes('Ma ludothèque'));
  f.afficherListes('ludo');
  const out = els['#out'];
  assert.ok(out.innerHTML.includes('Ma ludothèque · 38 jeux') && out.innerHTML.includes('data-q="Faraway"') && out.innerHTML.indexOf('Carcassonne') < out.innerHTML.indexOf('Zenith'), 'triée');
  const clic = cible => out.handlers.click({ target: { closest: s => cible(s) } });
  clic(s => (s === '[data-ajout]' ? { closest: () => ({ querySelector: () => ({ value: ' Azul ' }) }) } : null));
  assert.ok(out.innerHTML.includes('39 jeux') && out.innerHTML.includes('data-q="Azul"'));
  clic(s => (s === '[data-ajout]' ? { closest: () => ({ querySelector: () => ({ value: 'azul' }) }) } : null));
  assert.ok(out.innerHTML.includes('39 jeux'), 'doublon refusé');
  clic(s => (s === '[data-retire]' ? { dataset: { retire: 'Ma ludothèque', titre: 'Azul' } } : null));
  assert.ok(out.innerHTML.includes('38 jeux') && out.innerHTML.includes('Ma ludothèque'), 'le retrait réaffiche la ludothèque');
  assert.equal(JSON.parse(stock['notesJeux.listes']).find(l => l.nom === 'Ma ludothèque').jeux.length, 38);
});
