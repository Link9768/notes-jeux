const test = require('node:test');
const assert = require('node:assert/strict');
const data = require('../lib/cp-paris-10km.json');

test('centre et rayon', () => {
  assert.deepEqual(data.center, { lat: 48.8266, lon: 2.3658 });
  assert.equal(data.radiusKm, 10);
});
test('dedans : Paris 13e, Ivry, Montreuil, Créteil', () => {
  for (const cp of ['75013', '75018', '94200', '93100', '94000']) assert.ok(data.cps.includes(cp), cp);
});
test('dehors : Versailles, Savigny-sur-Orge, Argenteuil', () => {
  for (const cp of ['78000', '91600', '95100']) assert.ok(!data.cps.includes(cp), cp);
});
