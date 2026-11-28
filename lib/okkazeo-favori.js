// Logique du favori « Matchmaking Okkazeo » (okk.js), exécuté sur www.okkazeo.com depuis le navigateur de l'utilisateur
// (le VPS n8n est bloqué par Cloudflare au-delà de quelques dizaines de jeux). Chargé après match.js, sites.js et panier.js.

// Liste et jeux à sécuriser lus dans le hash de l'onglet ouvert par index.html : #nj=A|B|C&ns=A|B (300 et 3 au plus).
function hashOkk(hash) {
  const lire = (k, max) => {
    const m = new RegExp('[#&]' + k + '=([^&]*)').exec(String(hash || ''));
    if (!m) return [];
    try { return parseListeJeux(decodeURIComponent(m[1]), max); } catch (e) { return []; }
  };
  return { liste: lire('nj', 300), secu: lire('ns', 3) };
}

const OKK_BLOQUE = 'okkazeo bloque';

// get(url) → HTML, une requête à la fois espacée de pauseMs (+ alea ms au hasard) ; au 1er blocage Cloudflare (okkBloque),
// plus aucune requête : le drapeau est vérifié avant ET après l'attente.
function okkFetcher(fetchFn, pauseMs = 1000, alea = 300) {
  let prochain = 0, bloque = false;
  const get = async url => {
    if (bloque) throw new Error(OKK_BLOQUE);
    const t = Math.max(0, prochain - Date.now());
    prochain = Math.max(Date.now(), prochain) + pauseMs + Math.random() * alea;
    if (t) await new Promise(ok => setTimeout(ok, t));
    if (bloque) throw new Error(OKK_BLOQUE);
    const r = await fetchFn(url, { credentials: 'include' });
    const html = await r.text();
    if (okkBloque(r.status, html)) { bloque = true; throw new Error(OKK_BLOQUE); }
    if (r.status >= 400) throw new Error('HTTP ' + r.status);
    return html;
  };
  return { get, estBloque: () => bloque };
}

// jeux : [{ demande, titre, url, annonces: [...] | null }] (null = recherche en échec). nbs : { url de la 1re annonce → total d'annonces du vendeur }.
// securises = null tant que les jeux à sécuriser ne sont pas tous cherchés (ou sans jeu à sécuriser).
function bilanOkk(jeux, secu, cps, nbs = {}) {
  const avecNb = vendeurs => vendeurs.map(v => {
    const a = v.annonces.find(x => x.url), nb = a ? nbs[a.url] : undefined;
    return nb ? { ...v, nbAnnonces: nb } : v;
  });
  const trouves = jeux.filter(j => j.titre && j.annonces);
  const vendeurs = avecNb(matchVendeurs(trouves, cps));
  const secuNorm = new Set((secu || []).map(s => normalize(s)));
  const cherches = new Set(jeux.map(j => normalize(j.demande)));
  if (!secuNorm.size || [...secuNorm].some(s => !cherches.has(s))) return { vendeurs, securises: null };
  const requis = trouves.filter(j => secuNorm.has(normalize(j.demande))).map(j => j.titre);
  const introuvables = jeux.filter(j => !j.titre && secuNorm.has(normalize(j.demande))).map(j => j.demande);
  return { vendeurs, securises: { jeux: requis, introuvables, vendeurs: introuvables.length ? [] : avecNb(matchVendeurs(trouves, cps, 10, requis)) } };
}

// etat = { fait, total, jeux: [{ demande, titre, url, annonces: n | null }], vendeurs, securises, message }
function panneauOkkHtml(etat) {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fr = n => String(n).replace('.', ',');
  const okk = u => /^https:\/\/www\.okkazeo\.com\//.test(u || '');
  const lien = (u, t) => okk(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener">${t}</a>` : t;
  const cp = noms => `<button class="cp" data-copie="${esc(noms.join(', '))}" title="Copier la liste des jeux">📋</button>`;
  const jeux = (etat.jeux || []).map((j, i) => ({ j, i }))
    .sort((a, b) => (b.j.titre ? b.j.annonces || 0 : -1) - (a.j.titre ? a.j.annonces || 0 : -1) || a.i - b.i)
    .map(({ j }) => j.annonces === null ? `<span class="chip">${esc(j.demande)} : indisponible</span>`
      : j.titre ? `<span class="chip">${lien(j.url, esc(j.titre))} · ${j.annonces} annonce${j.annonces > 1 ? 's' : ''}</span>`
        : `<span class="chip">${esc(j.demande)} : introuvable sur Okkazeo</span>`).join('');
  const carte = v => `<div class="vend"><div class="top"><b>${esc(v.vendeur)}</b>${cp(v.annonces.map(a => a.jeu))} <span class="mut">${esc(v.ville ?? '')}${v.cp ? ` (${esc(v.cp)})` : ''}${v.nbAnnonces ? ` · ${v.nbAnnonces} annonce${v.nbAnnonces > 1 ? 's' : ''} en tout` : ''}</span>${v.procheParis ? ' <span class="tag ok">près de Paris</span>' : ''}${v.envoi ? ' <span class="tag">envoi</span>' : ''}<span class="right"><b>${v.nbJeux} jeux</b> · ${fr(v.total)} €</span></div>${v.annonces.map(a => `<div class="ann"><span>${esc(a.jeu)} <span class="mut">${esc(a.etat ?? '')}</span></span><span>${fr(a.prix)} € ${okk(a.url) ? lien(a.url, 'annonce ↗') : ''}</span></div>`).join('')}</div>`;
  const vendeurs = (etat.vendeurs || []).map(carte).join('');
  const vide = !vendeurs && !etat.message && etat.fait >= etat.total ? '<p class="mut">Aucun vendeur ne propose au moins 2 de ces jeux.</p>' : '';
  const s = etat.securises;
  const securises = !s ? '' : `<h3>🔒 Vendeurs qui ont tes jeux à sécuriser</h3>${
    (s.introuvables || []).length ? `<p class="mut">Introuvable sur Okkazeo : ${s.introuvables.map(esc).join(', ')}.</p>`
      : (s.vendeurs || []).length ? s.vendeurs.map(carte).join('')
        : `<p class="mut">Aucun vendeur n'a à la fois ${(s.jeux || []).map(esc).join(' et ')}.</p>`}`;
  return `<p class="mut">${etat.fait}/${etat.total} jeux</p>${etat.message ? `<p class="msg">${esc(etat.message)}</p>` : ''}<div class="chips">${jeux}</div>${securises}${securises && vendeurs ? '<h3>Autres vendeurs</h3>' : ''}${vendeurs}${vide}`;
}

if (typeof module !== 'undefined' && module.exports) {
  // Hors navigateur, les fonctions de match.js, sites.js et panier.js ne sont pas globales.
  if (typeof normalize === 'undefined') Object.assign(global, require('./match.js'));
  if (typeof parseOkkazeoSearch === 'undefined') global.parseOkkazeoSearch = require('./sites.js').parseOkkazeoSearch;
  if (typeof parseListeJeux === 'undefined') Object.assign(global, require('./panier.js'));
  module.exports = { hashOkk, okkFetcher, bilanOkk, panneauOkkHtml, OKK_BLOQUE };
}
