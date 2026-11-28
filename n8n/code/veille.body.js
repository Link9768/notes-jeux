// Veille quotidienne des jeux suivis : annonces Okkazeo (France entière) → bonnes affaires et vendeurs communs, envoyés sur Telegram (voir lib/veille.js).
// Entrées : « Lire sauvegarde » (JSON Drive { listes, suivis, date }) et, si lancé par /veille, « Inscription ».
// Ne lève jamais d'erreur : tout problème devient un message Telegram.
const statique = typeof $getWorkflowStaticData === 'function' ? $getWorkflowStaticData('global') : {};
const v = statique.veille || (statique.veille = {});
v.signalees = v.signalees || {};
v.histo = v.histo || {};
let jour = '';
try { jour = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }); } catch (e) { jour = ''; }
if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) jour = new Date().toISOString().slice(0, 10);
let manuel = false;
try { manuel = $('Inscription').isExecuted && !!$('Inscription').first().json.lancer; } catch (e) { manuel = false; }
const fin = t => (t && v.chatId ? [{ json: { chatId: v.chatId, texte: t } }] : []);
const msg = e => (e && e.message) || String(e);
const sansUrl = t => String(t).replace(/\s+https?:\/\/\S+/g, '');

try {
  let save = null, causeDrive = 'réponse inattendue';
  try {
    save = $('Lire sauvegarde').first().json;
    if (save && save.error) causeDrive = typeof save.error === 'string' ? save.error : (save.error.message || JSON.stringify(save.error));
  } catch (e) { causeDrive = msg(e); }
  const suivis = lireSuivis(save);
  if (suivis === null) return fin(`⚠ Notes Jeux · sauvegarde Drive illisible (${causeDrive}) : veille non faite.`);
  if (!suivis.length) return fin(manuel ? 'Aucun jeu suivi : ouvre un jeu dans Notes Jeux et touche 🔔 Suivre.' : null);

  // Toujours le rythme prudent (comme le Panier au-delà de 15 jeux) : 2 jeux à la fois, 0,4 s entre deux requêtes Okkazeo.
  const { pauseMs: PAUSE_MS, ouvriers: OUVRIERS } = rythmePanier(Infinity);
  let prochain = 0, panne = null;
  const attendre = async () => {
    const t = Math.max(0, prochain - Date.now());
    prochain = Math.max(Date.now(), prochain) + PAUSE_MS;
    if (t) await new Promise(ok => setTimeout(ok, t));
  };
  const get = async url => {
    await attendre();
    if (panne) throw new Error('veille interrompue'); // panne constatée pendant l'attente : on n'envoie plus rien à Okkazeo
    const r = await this.helpers.httpRequest({ url, headers: OKK_NAVIGATEUR, json: false, timeout: 10000, returnFullResponse: true, ignoreHttpStatusErrors: true });
    if (r.statusCode >= 400) throw new Error(`HTTP ${r.statusCode} ${url}`);
    return String(r.body ?? '');
  };

  // File de 2 ouvriers. 3 échecs d'affilée = Okkazeo en panne (blocage) : on arrête tout, rien n'est enregistré.
  const resultats = new Array(suivis.length);
  let suivant = 0, echecs = 0, premiereErreur = null;
  await Promise.all(Array.from({ length: OUVRIERS }, async () => {
    while (suivant < suivis.length && !panne) {
      const i = suivant++;
      try {
        const r = await annoncesOkkazeo(suivis[i].titre, get);
        if (r.attendues > 0 && !r.annonces.length) throw new Error('annonces illisibles');
        resultats[i] = { r };
        echecs = 0;
      } catch (e) {
        resultats[i] = { err: sansUrl(msg(e)) };
        if (!premiereErreur) premiereErreur = resultats[i].err;
        if (++echecs >= 3 && !panne) { panne = premiereErreur; suivant = suivis.length; }
      }
    }
  }));
  const nbOk = resultats.filter(x => x && x.r).length;
  if (!panne && !nbOk && premiereErreur) panne = premiereErreur;
  if (panne) return fin(messageVeille({ jour, panne }));

  const erreurs = [], jeuxTrouves = [], alertes = [];
  suivis.forEach((s, i) => {
    const x = resultats[i];
    if (!x) return;
    if (x.err) { erreurs.push(`${s.titre} (${x.err})`); return; }
    const r = x.r;
    ajouterPoint(v.histo, s.titre, r.titre, jour, r.titre ? pointHisto(r.annonces) : null);
    if (!r.titre) return;
    jeuxTrouves.push({ titre: s.titre, annonces: r.annonces });
    alertes.push(...alertesJeu({ titre: s.titre, annonces: r.annonces }, s, v.signalees, CP_PARIS));
  });
  const vendeurs = alertesVendeurs(jeuxTrouves, v.signalees, CP_PARIS);
  const texte = messageVeille({ jour, alertes, vendeurs, erreurs, nbJeux: suivis.length, manuel });
  if (v.chatId && texte) { // on mémorise les annonces SIGNALÉES (pas les vues)
    alertes.forEach(a => { v.signalees[a.id] = jour; });
    vendeurs.forEach(x => { v.signalees[x.cle] = jour; });
  }
  purger(v.signalees, jour);
  v.derniere = { le: new Date().toISOString(), jeux: suivis.length, ok: nbOk, erreurs: erreurs.length, panne: false };
  return fin(texte);
} catch (e) {
  return fin('⚠ Notes Jeux · veille en erreur : ' + msg(e));
}
