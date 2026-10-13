// Parseurs des pages de recherche (structure observée le 2026-10-13, voir docs/sources.md).
// Pas de `URL` dans le bac à sable des nodes Code n8n (vérifié le 2026-10-13) : résolution à la main.
function absUrl(base, href) {
  const h = String(href || '').trim();
  if (!h) return null;
  if (/^https?:\/\//i.test(h)) return h;
  if (h.startsWith('//')) return 'https:' + h;
  const origin = (String(base).match(/^https?:\/\/[^/]+/i) || [])[0];
  if (!origin) return null;
  return origin + (h.startsWith('/') ? h : '/' + h);
}

function clean(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Philibert : une carte = <div class="product-card … " data-pid="…">, titre dans a.product-card__title,
// langue dans span.product-card__feature, note « x/5 » avant le titre si le produit a des avis.
function parsePhilibertSearch(html) {
  const out = [];
  for (const card of String(html || '').split(/(?=<div\s+class="product-card\s[^"]*"\s+data-pid=)/).slice(1)) {
    const a = card.match(/<a class="h6 mb-0 product-card__title[^"]*" href="([^"]+)">([^<]+)<\/a>/);
    if (!a) continue;
    const features = [...card.matchAll(/<span class="product-card__feature">([^<]*)<\/span>/g)].map(m => clean(m[1]));
    const lang = features.includes('Français') ? 'fr' : features.includes('Anglais') ? 'en' : undefined;
    const n = clean(card.slice(0, a.index)).match(/(\d(?:[.,]\d)?)\/5/);
    out.push({
      title: clean(a[2]),
      url: absUrl('https://www.philibertnet.com/', a[1]),
      lang,
      note: n ? parseFloat(n[1].replace(',', '.')) : null,
    });
  }
  return out;
}

// Esprit Jeu : <h3 class="bp_designation"><a href="…"> Titre </a></h3>
function parseEspritJeuSearch(html) {
  return [...String(html || '').matchAll(/<h3 class="bp_designation">\s*<a href="([^"]+)">\s*([^<]*?)\s*<\/a>/g)]
    .map(m => ({ title: clean(m[2]), url: absUrl('https://www.espritjeu.com/', m[1]) }))
    .filter(c => c.title && c.url);
}

// Okkazeo : un résultat = <article class="… jeu …"> avec <h4 class="titre"><a href="/jeux/<id>/<slug>">Titre</a></h4>
// et <b>N annonces</b> (nombre d'annonces de cette édition ; null si absent).
function parseOkkazeoSearch(html) {
  const out = [];
  for (const art of String(html || '').split(/(?=<article class="grid-x box_article jeu)/).slice(1)) {
    const a = art.match(/<h4 class="titre"><a href="(\/jeux\/\d+\/[^"]*)"[^>]*>([^<]*)<\/a>/);
    if (!a) continue;
    const n = art.match(/<b>\s*(\d+)\s+annonces?\s*<\/b>/);
    const c = { title: clean(a[2]), url: absUrl('https://www.okkazeo.com/', a[1]), annonces: n ? Number(n[1]) : null };
    if (c.title && c.url) out.push(c);
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { parsePhilibertSearch, parseEspritJeuSearch, parseOkkazeoSearch };
