// Favori « Matchmaking LBC » : chargé sur leboncoin.fr par le bookmarklet de index.html. Fetch same-origin depuis le navigateur
// de l'utilisateur (DataDome bloque le VPS n8n, pas lui). La logique (filtre, tri) est dans lib/leboncoin.js et lib/panier.js.
(function () {
  const BASE = 'https://link9768.github.io/notes-jeux/';
  if (!/leboncoin\.fr$/.test(location.hostname)) { alert("Ouvre d'abord Leboncoin depuis le bouton Leboncoin de Notes Jeux, puis relance ce favori."); return; }
  // Relancé pendant une recherche : on réaffiche le panneau. Relancé après : l'ancien panneau est retiré et tout est refait
  // (avant, l'ancien résultat était réaffiché et passait pour une nouvelle recherche).
  if (window.__njLbc && window.__njLbc.enCours) { window.__njLbc.montre(); return; }
  if (window.__njLbc) window.__njLbc.retire();

  const CAPTCHA = new Error('captcha');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const lire = k => { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } };
  const ecrire = (k, v) => { try { sessionStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {} };

  // Panneau en Shadow DOM : le CSS de Leboncoin ne le touche pas.
  const hote = document.createElement('div');
  hote.style.cssText = 'position:fixed;top:8px;right:8px;z-index:2147483647;width:380px;max-width:95vw;max-height:85vh;overflow:auto;border-radius:12px;box-shadow:0 4px 24px #0008';
  const racine = hote.attachShadow({ mode: 'open' });
  racine.innerHTML = `<style>
    .box{background:#1c1c20;color:#ececf1;font:13px/1.4 system-ui,sans-serif;padding:10px 12px;border:2px solid #ec5a13;border-radius:12px}
    header{display:flex;justify-content:space-between;align-items:center;font-size:15px}
    button{background:none;border:0;color:#ececf1;font-size:18px;cursor:pointer}
    .mut{color:#8b8b96}.chips{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0}
    .chip{background:#2c2c32;border-radius:10px;padding:2px 8px;font-size:12px}
    .msg{background:#4a2a14;border-radius:8px;padding:6px 8px}
    .vend{border-top:1px solid #2c2c32;padding:8px 0}.top{display:flex;flex-wrap:wrap;gap:4px 8px;align-items:baseline}
    .right{margin-left:auto}.tag{background:#2c2c32;border-radius:8px;padding:0 6px;font-size:11px}.ok{background:#1f4a2a}
    .ann{display:flex;justify-content:space-between;gap:8px;padding:2px 0}a{color:#ec5a13}
    h3{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8b8b96;margin:12px 0 0}
  </style><div class="box"><header><b>Matchmaking Leboncoin</b><button id="x" title="Fermer">✕</button></header><div id="c"></div></div>`;
  racine.getElementById('x').addEventListener('click', () => { hote.style.display = 'none'; });
  document.documentElement.appendChild(hote);
  const dessine = html => { racine.getElementById('c').innerHTML = html; };
  const message = m => dessine(`<p class="msg">${m}</p>`);
  window.__njLbc = { enCours: true, montre() { hote.style.display = ''; }, retire() { hote.remove(); } };

  const charge = src => new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = BASE + src + '?v=' + Date.now(); s.onload = ok; s.onerror = ko;
    document.body.appendChild(s);
  });

  // Une page Leboncoin (recherche ou annonce), espacée des autres ; CAPTCHA si DataDome nous barre la route.
  let nReq = 0;
  async function page(url) {
    if (nReq++) await sleep(1000 + Math.random() * 500);
    const r = await fetch(url, { credentials: 'include' });
    if (r.status === 403 || r.redirected) throw CAPTCHA;
    return r.text();
  }
  // Une recherche, toute la France : 3 pages au plus (105 annonces, les plus récentes) ; annonces + lots candidats.
  async function cherche(jeu) {
    const cle = 'nj-lbc3:j:' + normalize(jeu), c = lire(cle);
    if (c && Date.now() - c.t < 3600000) return c;
    // La recherche Leboncoin ne tolère pas les fautes (« dice thrones » : 3 résultats, « dice throne » : 260) :
    // sans aucune annonce retenue, on relance au singulier (variantesRecherche, lib/match.js).
    const annonces = [], lots = [];
    for (const v of variantesRecherche(jeu)) {
      for (let p = 1; p <= 3; p++) {
        const sd = parseNextData(await page(lbcUrlRecherche(v, p)));
        if (!sd) throw CAPTCHA;
        annonces.push(...annoncesLbc(sd, jeu));
        lots.push(...lotsCandidats(sd, jeu));
        if (!(sd.total > 35 * p)) break;
      }
      if (annonces.length) break;
    }
    const res = { t: Date.now(), annonces, lots };
    ecrire(cle, res);
    return res;
  }
  // Lot candidat pour ≥ 2 jeux : description lue (page de l'annonce, gardée 1 h) pour confirmer les jeux de la liste qu'elle cite.
  async function confirmeLot(lot, liste) {
    const cle = 'nj-lbc3:a:' + lot.id, c = lire(cle);
    const body = c && Date.now() - c.t < 3600000 ? c.body : parseAnnonceBody(await page(lot.url));
    if (body == null) throw CAPTCHA;
    if (!c) ecrire(cle, { t: Date.now(), body });
    return jeuxDansTexte(lot.titre + ' ' + body, liste);
  }

  (async () => {
    let CP_PARIS;
    try {
      for (const f of ['lib/match.js', 'lib/panier.js', 'lib/leboncoin.js']) await charge(f);
      CP_PARIS = (await (await fetch(BASE + 'lib/cp-paris-10km.json')).json()).cps;
    } catch (e) { delete window.__njLbc; message('Script Notes Jeux injoignable.'); return; }

    let liste = listeDepuisHash(location.hash);
    if (!liste.length) liste = parseListeJeux(String(sessionStorage.getItem('nj-lbc:liste') || ''));
    if (!liste.length) liste = parseListeJeux(prompt('Jeux séparés par des virgules') || '');
    ecrire('nj-lbc:liste', liste.join('|'));
    if (liste.length < 2) { message('Mets au moins 2 jeux.'); return; }

    const jeux = [], candidats = new Map(); // id d'annonce → { lot, demandes: Set }
    let lots = [];
    const maj = msg => dessine(panneauHtml({
      fait: jeux.length, total: liste.length,
      jeux: jeux.map(j => ({ demande: j.demande, annonces: j.annonces && j.annonces.length })),
      vendeurs: matchVendeurs(jeux.filter(j => j.annonces).map(j => ({ titre: j.demande, annonces: j.annonces })), CP_PARIS),
      lots, message: msg,
    }));
    // Liste longue : même rythme qu'une courte (1 à 1,5 s entre deux requêtes), seule la durée change (~4 s par jeu mesuré).
    const note = liste.length > 20 ? `${liste.length} jeux : environ ${Math.ceil(liste.length * 4 / 60)} min, laisse l’onglet ouvert.` : undefined;
    const captcha = () => maj('Leboncoin demande un captcha : recharge la page, résous-le puis relance le favori (les jeux déjà vus sont gardés 1 h).');
    maj(note);
    for (const demande of liste) {
      try {
        const r = await cherche(demande);
        jeux.push({ demande, annonces: r.annonces });
        for (const l of r.lots) { const c = candidats.get(l.id) || { lot: l, demandes: new Set() }; c.demandes.add(demande); candidats.set(l.id, c); }
      } catch (e) {
        if (e === CAPTCHA) return captcha();
        jeux.push({ demande, annonces: null });
      }
      maj(note);
    }
    // Lots : ceux que Leboncoin a remontés pour au moins 2 jeux de la liste, les plus prometteurs d'abord, 20 lus au plus.
    const aLire = [...candidats.values()].filter(c => c.demandes.size >= 2).sort((a, b) => b.demandes.size - a.demandes.size).slice(0, 20);
    for (const [i, c] of aLire.entries()) {
      maj(`Lecture des lots : ${i + 1}/${aLire.length}…`);
      try {
        const trouves = await confirmeLot(c.lot, liste);
        if (trouves.length >= 2) lots = [...lots, { ...c.lot, jeux: trouves, procheParis: CP_PARIS.includes(c.lot.cp) }].sort((a, b) => b.jeux.length - a.jeux.length);
      } catch (e) { if (e === CAPTCHA) return captcha(); }
    }
    maj();
  })().finally(() => { if (window.__njLbc) window.__njLbc.enCours = false; });
})();
