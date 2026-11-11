const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { lbcUrlRecherche, parseNextData, annonceCorrespond, annoncesLbc, listeDepuisHash, panneauHtml } = require('../lib/leboncoin.js');
const { matchVendeurs } = require('../lib/panier.js');
const fx = n => fs.readFileSync(`${__dirname}/fixtures/${n}`, 'utf8');
const CPS = JSON.parse(fx('../../lib/cp-paris-10km.json')).cps;
const azul = parseNextData(fx('lbc-search-azul.html'));
const clank = parseNextData(fx('lbc-search-clank.html'));

test('parseNextData : searchData de la page ; page sans données, captcha ou JSON invalide → null', () => {
  assert.equal(azul.total, 32);
  assert.ok(azul.ads.length > 0 && azul.ads.length <= 35);
  assert.equal(parseNextData('<html></html>'), null);
  assert.equal(parseNextData('<html><iframe src="https://geo.captcha-delivery.com/captcha/"></iframe></html>'), null);
  assert.equal(parseNextData('<script id="__NEXT_DATA__" type="application/json">{pas du json</script>'), null);
});

test('annoncesLbc : champs de la 1re annonce ; annonce sans prix ignorée', () => {
  const a0 = azul.ads[0];
  const r = annoncesLbc(azul, 'Azul');
  assert.deepEqual(r[0], { vendeur: a0.owner.name, cle: a0.owner.user_id, prix: Number(a0.price[0]), url: a0.url,
    ville: a0.location.city, cp: a0.location.zipcode, etat: a0.subject, envoi: a0.attributes.some(x => x.key === 'shippable' && x.value === 'true') });
  const sd = { ads: [{ ...a0, price: undefined }, { ...a0, price: [] }, a0] };
  assert.equal(annoncesLbc(sd, 'Azul').length, 1);
});

test('annonceCorrespond : mots entiers, pluriels, accents ; lots et jeux vidéo écartés', () => {
  const ok = (j, t) => assert.equal(annonceCorrespond(j, t), true, `${j} / ${t}`);
  const ko = (j, t) => assert.equal(annonceCorrespond(j, t), false, `${j} / ${t}`);
  ok('Azul', 'Azul'); ok('Azul', 'Jeu Azul complet'); ok('7 Wonders Duel', '7 wonder duel'); ok('Château Combo', 'chateau combo');
  ko('Clank', 'Ratchet & Clank PS4'); ko('Clank', 'Ratchet & Clank Rift Apart');
  ko('Clank', '❗️220 Jeux Sociétés Liste de A à L'); ko('Azul', 'Lot Azul + Splendor');
  ko('Azul', 'Azulejos'); ko('Catan', 'Jeu Switch Catan');
});
test('annonceCorrespond : variantes et extensions seules écartées (titres réels du 2026-11-11), mots génériques acceptés', () => {
  const ok = (j, t) => assert.equal(annonceCorrespond(j, t), true, `${j} / ${t}`);
  const ko = (j, t) => assert.equal(annonceCorrespond(j, t), false, `${j} / ${t}`);
  ko('Splendor', 'Splendor marvel'); ko('Azul', 'AZUL - Les vitraux de Sintra'); ko('Patchwork', 'Patchwork express version anglaise jeu neuf sous cellophane');
  ko('Carcassonne', 'Jeu de société mon premier Carcassonne'); ko('Carcassonne', 'Carcassonne extension la tour');
  ko('Les Aventuriers du Rail', 'Les aventuriers du rail usa'); ko('Les Aventuriers du Rail', 'Neuf Jeu les aventuriers du rail New York Days of Wonder');
  ok('Dixit', 'Jeu de société DIXIT'); ok('Codenames', 'Jeu de société Codenames'); ok('7 Wonders Duel', '7 wonders duel - asmode');
  ok('Azul', 'Jeu Azul'); ok('Splendor', 'Splendor'); ok('Hanabi', 'Hanabi'); ok('Takenoko', 'Takenoko neuf sous blister');
  ok('Carcassonne', 'Carcassonne base + extension rivière'); ok('Clank', 'Clank + extension Trésors engloutis'); // le jeu de base est dedans
  ko('Clank', 'Clank Extensions + insert 3D'); ko('Azul', 'Extension Azul pavillon etincellant'); ko('Azul', 'Azul Duel - je de société');
  ok('Patchwork', 'Patchwork version anglaise TBE');
});
test('fixture clank : ni Ratchet ni lot parmi les annonces retenues', () => {
  const r = annoncesLbc(clank, 'Clank');
  assert.ok(r.length >= 5 && r.length < clank.ads.length, String(r.length)); // variantes (Legacy, dans l'espace…) écartées aussi
  assert.ok(r.every(a => !/legacy|espace|rangement/i.test(a.etat)), r.map(a => a.etat).join('\n'));
  assert.ok(r.every(a => !/ratchet|\blots?\b/i.test(a.etat)), r.map(a => a.etat).join('\n'));
});

test('lbcUrlRecherche : catégorie 41, zone Paris 13e, accents encodés, page 2', () => {
  assert.equal(lbcUrlRecherche('Azul'), 'https://www.leboncoin.fr/recherche?category=41&text=Azul&locations=Paris__48.82659_2.36366_10000_10000');
  assert.ok(lbcUrlRecherche('Château Combo').includes('text=Ch%C3%A2teau%20Combo&'));
  assert.ok(lbcUrlRecherche('Azul', 2).endsWith('&page=2'));
  assert.ok(!lbcUrlRecherche('Azul', 1).includes('page='));
});

test('listeDepuisHash : #nj= décodé, vide ou mal formé → [], 50 au plus', () => {
  assert.deepEqual(listeDepuisHash('#nj=Azul%7CClank'), ['Azul', 'Clank']);
  assert.deepEqual(listeDepuisHash(''), []);
  assert.deepEqual(listeDepuisHash('#nj=%E0'), []);
  assert.equal(listeDepuisHash('#nj=' + encodeURIComponent(Array.from({ length: 60 }, (_, i) => 'j' + i).join('|'))).length, 50);
});

test('Leboncoin + matchVendeurs : même user_id sur 2 jeux → un vendeur à 2 jeux, proche de Paris selon le CP', () => {
  const an = (cle, cp, prix) => ({ vendeur: 'x', cle, prix, url: 'u', ville: 'V', cp, etat: 't', envoi: false });
  const v = matchVendeurs([
    { titre: 'Azul', annonces: [an('u1', '75013', 20), an('u2', '95500', 10)] },
    { titre: 'Clank', annonces: [an('u1', '75013', 30), an('u2', '95500', 5)] },
  ], CPS);
  assert.equal(v.length, 2);
  assert.deepEqual(v.map(x => [x.nbJeux, x.procheParis]).sort(), [[2, false], [2, true]]);
});

test('panneauHtml : progression, vendeurs partiels avec captcha, aucun vendeur, titre échappé', () => {
  const vend = { vendeur: 'Bob', ville: 'Paris', cp: '75013', procheParis: true, envoi: true, nbJeux: 2, total: 50.5,
    annonces: [{ jeu: 'Azul', prix: 20, etat: '<img src=x onerror=alert(1)>', url: 'https://www.leboncoin.fr/ad/jeux_societes/1' }, { jeu: 'Clank', prix: 30.5, etat: 'Clank', url: 'https://www.leboncoin.fr/ad/jeux_societes/2' }] };
  const h = panneauHtml({ fait: 12, total: 50, jeux: [{ demande: 'Azul', annonces: 32 }, { demande: 'Clank', annonces: null }], vendeurs: [vend],
    message: 'Leboncoin demande un captcha : recharge la page.' });
  assert.ok(h.includes('12/50') && h.includes('Azul : 32 annonces') && h.includes('Clank : indisponible'));
  assert.ok(h.includes('Bob') && h.includes('75013') && h.includes('près de Paris') && h.includes('envoi') && h.includes('30,5') && h.includes('target="_blank" rel="noopener"'));
  assert.ok(h.includes('captcha'));
  assert.ok(!h.includes('<img') && h.includes('&lt;img'));
  assert.ok(panneauHtml({ fait: 2, total: 2, jeux: [], vendeurs: [] }).toLowerCase().includes('aucun vendeur'));
});

test('lbc.js : compile ; hors leboncoin.fr → alerte, aucun fetch', () => {
  const src = fs.readFileSync(`${__dirname}/../lbc.js`, 'utf8');
  new vm.Script(src);
  const calls = { alert: 0, fetch: 0 };
  vm.runInNewContext(src, { location: { hostname: 'example.com', hash: '' }, alert: () => calls.alert++, fetch: async () => { calls.fetch++; } });
  assert.deepEqual(calls, { alert: 1, fetch: 0 });
});
