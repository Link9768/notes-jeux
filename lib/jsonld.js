function extractJsonLd(html) {
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html || ''))) {
    try {
      const v = JSON.parse(m[1].trim());
      for (const x of Array.isArray(v) ? v : (v['@graph'] || [v])) out.push(x);
    } catch (e) { /* bloc invalide ignoré */ }
  }
  return out;
}

function findProduct(objs) {
  return (objs || []).find(o => [].concat(o && o['@type']).includes('Product')) || null;
}

function ratingOf(product) {
  const r = product && product.aggregateRating;
  if (!r) return null;
  const note = parseFloat(String(r.ratingValue).replace(',', '.'));
  const avis = parseInt(r.reviewCount ?? r.ratingCount, 10);
  return Number.isFinite(note) ? { note: Math.round(note * 10) / 10, avis: Number.isFinite(avis) ? avis : null } : null;
}

function offersOf(product) {
  const o = product && product.offers;
  if (!o) return null;
  return { total: Number(o.offerCount ?? 0), min: o.lowPrice != null ? Number(o.lowPrice) : null, max: o.highPrice != null ? Number(o.highPrice) : null };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { extractJsonLd, findProduct, ratingOf, offersOf };
