// Matchmaking Leboncoin (favori lbc.js, exécuté sur leboncoin.fr : le serveur n8n y est bloqué par DataDome).
// Page de recherche observée le 2026-11-11 : <script id="__NEXT_DATA__"> → props.pageProps.searchData = { total, max_pages, ads }.
// Dépend de normalize() (lib/match.js) et parseListeJeux() (lib/panier.js), chargés avant.

// Catégorie 41 = Jeux & Jouets ; toute la France (le badge « près de Paris » vient de cp-paris-10km.json).
function lbcUrlRecherche(jeu, page = 1) {
  return 'https://www.leboncoin.fr/recherche?category=41&text=' + encodeURIComponent(jeu) + (page > 1 ? '&page=' + page : '');
}

// searchData de la page, ou null (pas de __NEXT_DATA__ : captcha DataDome, page inattendue, JSON invalide).
function parseNextData(html) {
  const m = String(html || '').match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]).props.pageProps.searchData || null; } catch (e) { return null; }
}

// Tous les mots du jeu présents (mots entiers, pluriel ignoré) ; lots, listes et jeux vidéo écartés.
// En dehors du nom du jeu, le titre ne doit contenir que des mots génériques : « Splendor Marvel », « Patchwork Express »,
// « Mon premier Carcassonne », « extension la tour » sont d'autres jeux ou des extensions seules.
// Exception : le jeu de base avec ses extensions (« base + extension rivière », « Clank + extension Trésors engloutis »).
const singulierLbc = t => t.split(' ').filter(Boolean).map(w => (w.length > 3 ? w.replace(/s$/, '') : w));
const lbcMots = t => singulierLbc(normalize(t));
const LBC_GENERIQUES = new Set(singulierLbc('jeu jeux de du des la le les l d un une et avec en a au pour sur societe plateau carte cartes '
  + 'neuf neuve occasion complet complete tbe be tres bon bonne etat excellent parfait comme boite sous blister cellophane scelle emballe '
  + 'vf vo fr francais francaise anglais anglaise english version edition original originale officiel '
  + 'asmodee asmode iello repos gigamic matagot libellud blackrock bombyx space cowboys days wonder hurrican lucky duck games zman'));
function annonceCorrespond(jeu, titre) {
  const t = normalize(titre);
  if (/\blots?\b|\b\d{2,}\s*jeux\b|\bliste\b/.test(t)) return false;
  if (/\b(ps[1-5]|playstation|xbox|switch|nintendo|wii|ds|jeu video|ratchet)\b/.test(t)) return false;
  const mots = lbcMots(titre);
  const voulus = lbcMots(jeu);
  if (!voulus.length || !voulus.every(w => mots.includes(w))) return false;
  if (mots.includes('base') || /(\+|\bavec\b|\bet\b)\s*(\d+\s*)?(les\s+)?extensions?\b/i.test(titre)) return true;
  return mots.every(w => voulus.includes(w) || LBC_GENERIQUES.has(w));
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

// Lots : Leboncoin cherche aussi dans la description, mais la renvoie vide dans les résultats (body = '').
// Candidat = annonce de la recherche dont le titre ne nomme pas le jeu (donc le jeu est dans la description).
// Une même annonce candidate pour 2 jeux ou plus de la liste est lue (page de l'annonce) pour confirmer.
function lotsCandidats(searchData, jeu) {
  const out = [];
  for (const a of (searchData && searchData.ads) || []) {
    const prix = a && a.price != null ? Number(Array.isArray(a.price) ? a.price[0] : a.price) : NaN;
    if (!Number.isFinite(prix) || !a.list_id || annonceCorrespond(jeu, a.subject)) continue;
    if (/\b(ps[1-5]|playstation|xbox|switch|nintendo|wii|ds|jeu video|ratchet)\b/.test(normalize(a.subject))) continue;
    const l = a.location || {};
    out.push({ id: String(a.list_id), titre: a.subject, url: a.url, prix, ville: l.city, cp: l.zipcode, vendeur: (a.owner || {}).name });
  }
  return out;
}
// Description d'une annonce (page /ad/…, __NEXT_DATA__ → props.pageProps.ad.body), ou null.
function parseAnnonceBody(html) {
  const m = String(html || '').match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { const ad = JSON.parse(m[1]).props.pageProps.ad; return ad && typeof ad.body === 'string' ? ad.body : null; } catch (e) { return null; }
}
// Jeux de la liste cités dans un texte : le nom entier, mots consécutifs (« just » et « one » séparés ≠ Just One).
function jeuxDansTexte(texte, liste) {
  const t = ' ' + lbcMots(texte).join(' ') + ' ';
  return (liste || []).filter(j => { const k = lbcMots(j).join(' '); return k && t.includes(' ' + k + ' '); });
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
  // etat.lots = [{ titre, url, prix, ville, cp, procheParis, jeux: [noms de la liste trouvés dans la description] }]
  const lots = (etat.lots || []).length ? `<h3>Lots qui contiennent plusieurs de tes jeux</h3>${etat.lots.map(l => `<div class="vend"><div class="top"><b>${esc(l.titre)}</b> <span class="mut">${esc(l.ville ?? '')}${l.cp ? ` (${esc(l.cp)})` : ''}</span>${l.procheParis ? ' <span class="tag ok">près de Paris</span>' : ''}<span class="right"><b>${l.jeux.length} jeux</b> · ${fr(l.prix)} €</span></div><div class="ann"><span>${esc(l.jeux.join(', '))}</span>${/^https:\/\//.test(l.url || '') ? `<a href="${esc(l.url)}" target="_blank" rel="noopener">annonce ↗</a>` : ''}</div></div>`).join('')}` : '';
  return `<p class="mut">${etat.fait}/${etat.total} jeux</p><div class="chips">${jeux}</div>${etat.message ? `<p class="msg">${esc(etat.message)}</p>` : ''}${vendeurs}${vide}${lots}`;
}

if (typeof module !== 'undefined' && module.exports) {
  if (typeof normalize === 'undefined') global.normalize = require('./match.js').normalize;
  if (typeof parseListeJeux === 'undefined') global.parseListeJeux = require('./panier.js').parseListeJeux;
  module.exports = { lbcUrlRecherche, parseNextData, annonceCorrespond, annoncesLbc, listeDepuisHash, panneauHtml, lotsCandidats, parseAnnonceBody, jeuxDansTexte };
}
