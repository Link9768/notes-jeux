// Veille des jeux suivis (workflow « Notes Jeux — Veille », node « Veille », voir scripts/bundle.mjs) : logique pure, testée.
// Dépend de mediane (lib/okkazeo.js) et matchVendeurs (lib/panier.js), placés devant ce fichier dans le bundle.
// SEUIL_MEDIANE est recopié dans index.html (pastille « bonne affaire ») : le garder identique.
const SEUIL_MEDIANE = 0.75, MAX_SUIVIS = 50;

const cleSuivi = t => String(t || '').trim().toLowerCase();

// Suivis lus dans la sauvegarde Drive { listes, suivis, date } → [{ titre, max }] ; null si la sauvegarde est absente ou illisible.
function lireSuivis(save) {
  if (!save || typeof save !== 'object' || save.error) return null;
  if (save.suivis === undefined || save.suivis === null) return [];
  if (!Array.isArray(save.suivis)) return null;
  const vus = new Set(), out = [];
  for (const s of save.suivis) {
    const titre = String((s && s.titre) || '').trim();
    const k = cleSuivi(titre);
    if (!k || vus.has(k)) continue;
    vus.add(k);
    const max = Number(s.max);
    out.push({ titre, max: Number.isInteger(max) && max > 0 ? max : null });
  }
  return out.slice(0, MAX_SUIVIS);
}

const idAnnonce = url => (String(url || '').match(/\/annonces\/(\d+)/) || [])[1] || null;

// Point du jour d'un jeu : médiane, minimum et nombre des annonces (France entière).
function pointHisto(annonces) {
  const prix = (annonces || []).map(a => a.prix).filter(x => typeof x === 'number');
  return { med: mediane(prix), min: prix.length ? Math.min(...prix) : null, n: prix.length };
}

// Bonnes affaires d'un jeu suivi. jeu = { titre, annonces } ; suivi = { titre, max } ; signalees = { <clé>: jour }.
// Seuil perso (max) : prix <= max, le seuil automatique est alors ignoré ; sinon au moins 3 annonces et prix <= 0,75 × médiane du jour.
function alertesJeu(jeu, suivi, signalees, cps) {
  const annonces = (jeu && jeu.annonces) || [];
  const med = pointHisto(annonces).med, proches = new Set(cps || []);
  const max = suivi && suivi.max > 0 ? suivi.max : null;
  const out = [];
  for (const a of annonces) {
    const id = idAnnonce(a.url);
    if (!id || (signalees && signalees[id])) continue;
    let raison = null;
    if (max !== null) { if (a.prix <= max) raison = 'max'; }
    else if (annonces.length >= 3 && med !== null && a.prix <= SEUIL_MEDIANE * med) raison = 'mediane';
    if (!raison) continue;
    out.push({
      id, jeu: jeu.titre, prix: a.prix, url: a.url, ville: a.ville, cp: a.cp, etat: a.etat, envoi: !!a.envoi,
      procheParis: !!(a.cp && proches.has(a.cp)), raison, max,
      mediane: raison === 'mediane' ? med : null,
      ecart: raison === 'mediane' ? Math.round((a.prix / med - 1) * 100) : null,
    });
  }
  return out;
}

// Vendeurs qui proposent au moins 2 des jeux suivis. Clé = vendeur + ids d'annonces : un nouveau jeu chez lui = nouvelle alerte.
function alertesVendeurs(jeux, signalees, cps) {
  return matchVendeurs(jeux, cps, 50)
    .map(v => {
      const ids = v.annonces.map(a => idAnnonce(a.url)).filter(Boolean).sort((a, b) => Number(a) - Number(b));
      return { cle: 'v:' + String(v.vendeur).trim().toLowerCase() + ':' + ids.join(','), vendeur: v.vendeur, ville: v.ville, cp: v.cp, procheParis: v.procheParis, total: v.total, annonces: v.annonces };
    })
    .filter(v => !(signalees && signalees[v.cle]));
}

// Historique : 1 point par jour et par jeu [jour, médiane, min, n], 365 au plus. pt = { med, min, n } ou null (pas de point).
function ajouterPoint(histo, titre, okk, jour, pt) {
  const k = cleSuivi(titre);
  const h = histo[k] || (histo[k] = { titre, okk: null, pts: [] });
  h.titre = titre;
  h.okk = okk;
  if (pt) {
    h.pts = h.pts.filter(p => p[0] !== jour).concat([[jour, pt.med, pt.min, pt.n]]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).slice(-365);
  }
  return h;
}

// Retire les annonces signalées il y a plus de `jours` jours.
function purger(signalees, jour, jours = 180) {
  const t = Date.parse(jour + 'T00:00:00Z');
  for (const k of Object.keys(signalees)) {
    const d = Date.parse(signalees[k] + 'T00:00:00Z');
    if (isNaN(d) || (t - d) / 86400000 > jours) delete signalees[k];
  }
  return signalees;
}

const jjmm = jour => String(jour).slice(8, 10) + '/' + String(jour).slice(5, 7);
const euros = x => (Number.isInteger(x) ? String(x) : x.toFixed(2).replace('.', ',')) + ' €';

// Texte Telegram (brut, 3800 caractères au plus) ; null si rien à dire et lancement planifié.
function messageVeille({ jour, alertes = [], vendeurs = [], erreurs = [], panne = null, nbJeux = 0, manuel = false }) {
  if (panne) {
    const court = String(panne).replace(/\s+https?:\/\/\S+/g, '');
    return `⚠ Notes Jeux · Okkazeo ne répond pas (${court}, 3 jeux d'affilée) : veille du ${jjmm(jour)} interrompue, rien d'enregistré. Nouvel essai demain ou /veille.`;
  }
  const tri = (a, b) => Number(b.procheParis) - Number(a.procheParis);
  const items = [];
  const lieu = x => (x.ville ? ` · ${x.ville}${x.cp ? ` (${x.cp})` : ''}` : '') + (x.procheParis ? ' 📍 près de Paris' : '');
  alertes.slice().sort((a, b) => tri(a, b) || String(a.jeu).localeCompare(String(b.jeu)) || a.prix - b.prix).forEach(a => {
    const raison = a.raison === 'max' ? `≤ ton max ${euros(a.max)}` : `−${Math.abs(a.ecart)} % sous la médiane ${euros(a.mediane)}`;
    items.push({ section: 'a', texte: `• ${a.jeu} : ${euros(a.prix)} (${raison})${a.etat ? ` · état ${a.etat}` : ''}${lieu(a)}${a.envoi ? ' · envoi possible' : ''}\n  ${a.url}` });
  });
  vendeurs.slice().sort(tri).forEach(v => {
    items.push({ section: 'v', texte: `• ${v.vendeur}${lieu(v)} · ${v.annonces.length} jeux pour ${euros(v.total)}\n${v.annonces.map(x => `  – ${x.jeu} ${euros(x.prix)} ${x.url}`).join('\n')}` });
  });
  if (!items.length) return manuel ? `Rien de nouveau · ${nbJeux} jeux vérifiés.` : null;
  const titres = { a: `Bonnes affaires (${alertes.length})`, v: `Vendeurs qui ont plusieurs de tes jeux suivis (${vendeurs.length})` };
  const pied = erreurs.length ? ('⚠ Non vérifiés : ' + erreurs.join(', ')).slice(0, 300) : '';
  const LIMITE = 3800 - 80 - pied.length; // marge pour « … et N autres » et les erreurs
  let txt = `🔔 Notes Jeux · veille du ${jjmm(jour)}`, section = '', gardes = 0;
  for (const it of items) {
    const ajout = (it.section !== section ? `\n\n${titres[it.section]}\n` : '\n') + it.texte;
    if (txt.length + ajout.length > LIMITE) break;
    txt += ajout;
    section = it.section;
    gardes++;
  }
  if (gardes < items.length) txt += `\n… et ${items.length - gardes} autres`;
  return pied ? `${txt}\n\n${pied}` : txt;
}

if (typeof module !== 'undefined' && module.exports) {
  if (typeof mediane === 'undefined') global.mediane = require('./okkazeo.js').mediane;
  if (typeof matchVendeurs === 'undefined') global.matchVendeurs = require('./panier.js').matchVendeurs;
  module.exports = { SEUIL_MEDIANE, MAX_SUIVIS, cleSuivi, lireSuivis, idAnnonce, pointHisto, alertesJeu, alertesVendeurs, ajouterPoint, purger, messageVeille };
}
