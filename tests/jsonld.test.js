const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { extractJsonLd, findProduct, ratingOf, offersOf } = require('../lib/jsonld.js');
const fx = n => fs.readFileSync(`${__dirname}/fixtures/${n}`, 'utf8');

const okk = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Clank!","offers":{"@type":"AggregateOffer","priceCurrency":"EUR","lowPrice":20,"highPrice":190,"offerCount":14}}</script>';

test('offres Okkazeo (structure vérifiée le 2026-10-13)', () => {
  assert.deepEqual(offersOf(findProduct(extractJsonLd(okk))), { total: 14, min: 20, max: 190 });
});
test('aggregateRating avec virgule décimale', () => {
  const html = '<script type="application/ld+json">[{"@type":"BreadcrumbList"},{"@type":"Product","aggregateRating":{"ratingValue":"4,6","reviewCount":"23"}}]</script>';
  assert.deepEqual(ratingOf(findProduct(extractJsonLd(html))), { note: 4.6, avis: 23 });
});
test('JSON invalide ignoré, pas de produit → null', () => {
  assert.equal(findProduct(extractJsonLd('<script type="application/ld+json">{oops</script>')), null);
  assert.equal(ratingOf(null), null);
  assert.equal(offersOf(null), null);
});
test('Esprit Jeu réel : Clank! 4,9 (34 avis) dans un @graph', () => {
  assert.deepEqual(ratingOf(findProduct(extractJsonLd(fx('espritjeu-product-clank.html')))), { note: 4.9, avis: 34 });
});
test('Philibert réel : Catacombes 5/5 (12 avis)', () => {
  assert.deepEqual(ratingOf(findProduct(extractJsonLd(fx('philibert-product-catacombes.html')))), { note: 5, avis: 12 });
});
test('Philibert réel : Clank! VF sans avis → null', () => {
  assert.equal(ratingOf(findProduct(extractJsonLd(fx('philibert-product-clank.html')))), null);
});
test('Okkazeo réel : offres cohérentes', () => {
  const o = offersOf(findProduct(extractJsonLd(fx('okkazeo-clank.html'))));
  assert.ok(o.total >= 1 && o.min != null && o.min <= o.max, JSON.stringify(o));
});
