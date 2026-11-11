// Matchmaking Leboncoin (favori lbc.js, exécuté sur leboncoin.fr : le serveur n8n y est bloqué par DataDome).
// Page de recherche observée le 2026-11-11 : <script id="__NEXT_DATA__"> → props.pageProps.searchData = { total, max_pages, ads }.
// Dépend de normalize() (lib/match.js) et parseListeJeux() (lib/panier.js), chargés avant.

// Catégorie 41 = Jeux & Jouets ; zone = 10 km autour des Olympiades (Paris 13e).
function lbcUrlRecherche(jeu, page = 1) {
  return 'https://www.leboncoin.fr/recherche?category=41&text=' + encodeURIComponent(jeu)
    + '&locations=Paris__48.82659_2.36366_10000_10000' + (page > 1 ? '&page=' + page : '');
}

// searchData de la page, ou null (pas de __NEXT_DATA__ : captcha DataDome, page inattendue, JSON invalide).
function parseNextData(html) {
  const m = String(html || '').match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]).props.pageProps.searchData || null; } catch (e) { return null; }
}

// Tous les mots du jeu présents (mots entiers, pluriel ignoré) ; lots, listes et jeux vidéo écartés.
const lbcMots = t => normalize(t).split(' ').filter(Boolean).map(w => (w.length > 3 ? w.replace(/s$/, '') : w));
function annonceCorrespond(jeu, titre) {
  const t = normalize(titre);
  if (/\blots?\b|\b\d{2,}\s*jeux\b|\bliste\b/.test(t)) return false;
  if (/\b(ps[1-5]|playstation|xbox|switch|nintendo|wii|ds|jeu video|ratchet)\b/.test(t)) return false;
  const mots = new Set(lbcMots(titre));
  const voulus = lbcMots(jeu);
  return voulus.length > 0 && voulus.every(w => mots.has(w));
}

function annoncesLbc(searchData, jeu) {
  const out = [];
  for (const a of (searchData && searchData.ads) || []) {
    const prix = a && a.price != null ? Number(Array.isArray(a.price) ? a.price[0] : a.price) : NaN;
    if (!Number.isFinite(prix) || !annonceCorrespond(jeu, a.subject)) continue;
    const o = a.owner || {}, l = a.location || {};
    out.push({
      vendeur: o.name, cle: o.user_id, prix, url: a.url, ville: l.city, cp: l.zipcode, etat: a.subject,
      envoi: (a.attributes || []).some(x => x.key === 'shippable' && x.value === 'true'),
    });
  }
  return out;
}

// « #nj=Azul%7CClank » → ['Azul', 'Clank'] ; absent ou mal formé → [].
function listeDepuisHash(hash) {
  const m = String(hash || '').match(/nj=([^&]*)/);
  if (!m) return [];
  try { return parseListeJeux(decodeURIComponent(m[1])); } catch (e) { return []; }
}

// etat = { fait, total, jeux: [{ demande, annonces: n | null }], vendeurs (matchVendeurs), message }
function panneauHtml(etat) {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fr = n => String(n).replace('.', ',');
  const jeux = (etat.jeux || []).map(j => `<span class="chip">${esc(j.demande)} : ${j.annonces === null ? 'indisponible' : j.annonces + ' annonce' + (j.annonces > 1 ? 's' : '')}</span>`).join('');
  const vendeurs = (etat.vendeurs || []).map(v => `<div class="vend"><div class="top"><b>${esc(v.vendeur)}</b> <span class="mut">${esc(v.ville ?? '')}${v.cp ? ` (${esc(v.cp)})` : ''}</span>${v.procheParis ? ' <span class="tag ok">près de Paris</span>' : ''}${v.envoi ? ' <span class="tag">envoi</span>' : ''}<span class="right"><b>${v.nbJeux} jeux</b> · ${fr(v.total)} €</span></div>${v.annonces.map(a => `<div class="ann"><span>${esc(a.jeu)} <span class="mut">${esc(a.etat ?? '')}</span></span><span>${fr(a.prix)} € ${/^https:\/\//.test(a.url || '') ? `<a href="${esc(a.url)}" target="_blank" rel="noopener">annonce ↗</a>` : ''}</span></div>`).join('')}</div>`).join('');
  const vide = !vendeurs && !etat.message && etat.fait >= etat.total ? '<p class="mut">Aucun vendeur ne propose au moins 2 de ces jeux.</p>' : '';
  return `<p class="mut">${etat.fait}/${etat.total} jeux</p><div class="chips">${jeux}</div>${etat.message ? `<p class="msg">${esc(etat.message)}</p>` : ''}${vendeurs}${vide}`;
}

if (typeof module !== 'undefined' && module.exports) {
  if (typeof normalize === 'undefined') global.normalize = require('./match.js').normalize;
  if (typeof parseListeJeux === 'undefined') global.parseListeJeux = require('./panier.js').parseListeJeux;
  module.exports = { lbcUrlRecherche, parseNextData, annonceCorrespond, annoncesLbc, listeDepuisHash, panneauHtml };
}
