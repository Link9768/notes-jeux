// Favori « Matchmaking LBC » : chargé sur leboncoin.fr par le bookmarklet de index.html. Fetch same-origin depuis le navigateur
// de l'utilisateur (DataDome bloque le VPS n8n, pas lui). La logique (filtre, tri) est dans lib/leboncoin.js et lib/panier.js.
(function () {
  const BASE = 'https://link9768.github.io/notes-jeux/';
  if (!/leboncoin\.fr$/.test(location.hostname)) { alert("Ouvre d'abord Leboncoin depuis le bouton Leboncoin de Notes Jeux, puis relance ce favori."); return; }
  if (window.__njLbc) { window.__njLbc.montre(); return; }

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
  </style><div class="box"><header><b>Matchmaking Leboncoin</b><button id="x" title="Fermer">✕</button></header><div id="c"></div></div>`;
  racine.getElementById('x').addEventListener('click', () => { hote.style.display = 'none'; });
  document.documentElement.appendChild(hote);
  const dessine = html => { racine.getElementById('c').innerHTML = html; };
  const message = m => dessine(`<p class="msg">${m}</p>`);
  window.__njLbc = { montre() { hote.style.display = ''; } };

  const charge = src => new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = BASE + src + '?v=' + Date.now(); s.onload = ok; s.onerror = ko;
    document.body.appendChild(s);
  });

  // Une recherche (page 2 seulement si > 35 résultats) ; CAPTCHA si DataDome nous barre la route.
  let nReq = 0;
  async function cherche(jeu) {
    const cle = 'nj-lbc:j:' + normalize(jeu), c = lire(cle);
    if (c && Date.now() - c.t < 3600000) return c.annonces;
    const annonces = [];
    for (let page = 1; page <= 2; page++) {
      if (nReq++) await sleep(1000 + Math.random() * 500);
      const r = await fetch(lbcUrlRecherche(jeu, page), { credentials: 'include' });
      if (r.status === 403 || r.redirected) throw CAPTCHA;
      const sd = parseNextData(await r.text());
      if (!sd) throw CAPTCHA;
      annonces.push(...annoncesLbc(sd, jeu));
      if (!(sd.total > 35)) break;
    }
    ecrire(cle, { t: Date.now(), annonces });
    return annonces;
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

    const jeux = [];
    const maj = msg => dessine(panneauHtml({
      fait: jeux.length, total: liste.length,
      jeux: jeux.map(j => ({ demande: j.demande, annonces: j.annonces && j.annonces.length })),
      vendeurs: matchVendeurs(jeux.filter(j => j.annonces).map(j => ({ titre: j.demande, annonces: j.annonces })), CP_PARIS),
      message: msg,
    }));
    maj();
    for (const demande of liste) {
      try { jeux.push({ demande, annonces: await cherche(demande) }); }
      catch (e) {
        if (e === CAPTCHA) { maj('Leboncoin demande un captcha : recharge la page, résous-le puis relance le favori.'); return; }
        jeux.push({ demande, annonces: null });
      }
      maj();
    }
  })();
})();
