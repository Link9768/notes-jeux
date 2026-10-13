// Usage : node scripts/build-cp-list.mjs  → écrit lib/cp-paris-10km.json
import { writeFileSync } from 'node:fs';

const CENTER = { lat: 48.8266, lon: 2.3658 }; // Olympiades, Paris 13e
const RADIUS_KM = 10;
const DEPTS = ['75', '77', '78', '91', '92', '93', '94', '95'];

function km(a, b) {
  const r = x => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const communes = [];
for (const d of DEPTS) {
  const res = await fetch(`https://geo.api.gouv.fr/communes?codeDepartement=${d}&fields=nom,codesPostaux,centre&format=json`);
  if (!res.ok) throw new Error(`geo.api ${d} : HTTP ${res.status}`);
  for (const c of await res.json()) {
    if (!c.centre) continue;
    const [lon, lat] = c.centre.coordinates;
    const dist = km(CENTER, { lat, lon });
    if (dist <= RADIUS_KM) for (const cp of c.codesPostaux) communes.push({ cp, nom: c.nom, km: Math.round(dist * 10) / 10 });
  }
}
communes.sort((a, b) => a.km - b.km);
const cps = [...new Set(communes.map(c => c.cp))].sort();
writeFileSync(new URL('../lib/cp-paris-10km.json', import.meta.url),
  JSON.stringify({ center: CENTER, radiusKm: RADIUS_KM, cps, communes }, null, 2));
console.log(`${cps.length} codes postaux, ${communes.length} lignes`);
