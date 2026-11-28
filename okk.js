// Favori « Matchmaking Okkazeo » : chargé sur www.okkazeo.com par le bookmarklet de index.html. Fetch same-origin depuis le navigateur
// de l'utilisateur (Cloudflare bloque le VPS n8n au-delà de quelques dizaines de jeux). La logique est dans lib/okkazeo-favori.js et lib/panier.js.
(function () {
  const BASE = 'https://link9768.github.io/notes-jeux/';
  if (location.hostname !== 'www.okkazeo.com') { alert("Ouvre d'abord Okkazeo depuis le bouton « Okkazeo (favori) » de Notes Jeux, puis relance ce favori."); return; }
  // Relancé pendant une recherche : on réaffiche le panneau. Relancé après : l'ancien panneau est retiré et tout est refait.
  if (window.__njOkk && window.__njOkk.enCours) { window.__njOkk.montre(); return; }
  if (window.__njOkk) window.__njOkk.retire();

  const MSG_BLOQUE = 'Okkazeo (Cloudflare) demande une vérification : recharge la page, coche la case si elle apparaît, puis relance le favori (les jeux déjà vus sont gardés 1 h).';
  const lire = k => { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } };
  const ecrire = (k, v) => { try { sessionStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {} };

  // Panneau en Shadow DOM : le CSS d'Okkazeo ne le touche pas.
  const hote = document.createElement('div');
  hote.style.cssText = 'position:fixed;top:8px;right:8px;z-index:2147483647;width:380px;max-width:95vw;max-height:85vh;overflow:auto;border-radius:12px;box-shadow:0 4px 24px #0008';
  const racine = hote.attachShadow({ mode: 'open' });
  racine.innerHTML = `<style>
    .box{background:#1c1c20;color:#ececf1;font:13px/1.4 system-ui,sans-serif;padding:10px 12px;border:2px solid #ff8a00;border-radius:12px}
    header{display:flex;justify-content:space-between;align-items:center;font-size:15px}
    button{background:none;border:0;color:#ececf1;font-size:18px;cursor:pointer}.cp{font-size:13px;padding:0 2px}
    .mut{color:#8b8b96}.chips{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0}
    .chip{background:#2c2c32;border-radius:10px;padding:2px 8px;font-size:12px}
    .msg{background:#4a2a14;border-radius:8px;padding:6px 8px}
    .vend{border-top:1px solid #2c2c32;padding:8px 0}.top{display:flex;flex-wrap:wrap;gap:4px 8px;align-items:baseline}
    .right{margin-left:auto}.tag{background:#2c2c32;border-radius:8px;padding:0 6px;font-size:11px}.ok{background:#1f4a2a}
    .ann{display:flex;justify-content:space-between;gap:8px;padding:2px 0}a{color:#ff8a00}
    h3{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8b8b96;margin:12px 0 0}
  </style><div class="box"><header><b>Matchmaking Okkazeo</b><button id="x" title="Fermer">✕</button></header><div id="c"></div></div>`;
  racine.getElementById('x').addEventListener('click', () => { hote.style.display = 'none'; });
  document.documentElement.appendChild(hote);
  racine.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.cp');
    if (!b) return;
    const t = b.dataset.copie || '', ok = () => { b.textContent = '✓'; setTimeout(() => { b.textContent = '📋'; }, 1500); };
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(ok, () => {
      const a = document.createElement('textarea'); a.value = t; racine.appendChild(a); a.select();
      try { document.execCommand('copy'); ok(); } catch (x) {} a.remove();
    });
  });
  const dessine = html => { racine.getElementById('c').innerHTML = html; };
  const message = m => dessine(`<p class="msg">${m}</p>`);
  window.__njOkk = { enCours: true, montre() { hote.style.display = ''; }, retire() { hote.remove(); } };

  const charge = src => new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = BASE + src + '?v=' + Date.now(); s.onload = ok; s.onerror = ko;
    document.body.appendChild(s);
  });

  (async () => {
    let CP_PARIS;
    try {
      if (typeof panneauOkkHtml !== 'function') for (const f of ['lib/match.js', 'lib/sites.js', 'lib/panier.js', 'lib/okkazeo-favori.js']) await charge(f);
      CP_PARIS = (await (await fetch(BASE + 'lib/cp-paris-10km.json')).json()).cps;
    } catch (e) { delete window.__njOkk; message('Script Notes Jeux injoignable.'); return; }

    let { liste, secu } = hashOkk(location.hash);
    if (!liste.length) { liste = parseListeJeux(String(sessionStorage.getItem('nj-okk:liste') || '')); secu = parseListeJeux(String(sessionStorage.getItem('nj-okk:secu') || ''), 3); }
    if (!liste.length) liste = parseListeJeux(prompt('Jeux séparés par des virgules') || '');
    ecrire('nj-okk:liste', liste.join('|'));
    ecrire('nj-okk:secu', secu.join('|'));
    const noms = parseListeJeux(secu.concat(liste).join('|'));
    if (noms.length < 2) { message('Mets au moins 2 jeux.'); return; }

    const { get } = okkFetcher((u, o) => fetch(u, o));
    const cache = (cle, produit) => async () => {
      const c = lire(cle);
      if (c && Date.now() - c.t < 3600000) return c.v;
      const v = await produit();
      ecrire(cle, { t: Date.now(), v });
      return v;
    };
    const cherche = nom => cache('nj-okk:j:' + normalize(nom), async () => {
      const { titre, url, annonces } = await annoncesOkkazeo(nom, get);
      return { titre, url, annonces };
    })();
    const nbVendeur = url => cache('nj-okk:nb:' + url, async () => nbAnnoncesVendeur(await get(url)))();

    const jeux = [], nbs = {};
    const maj = msg => dessine(panneauOkkHtml({
      fait: jeux.length, total: noms.length,
      jeux: jeux.map(j => ({ ...j, annonces: j.annonces ? j.annonces.length : null })),
      ...bilanOkk(jeux, secu, CP_PARIS, nbs), message: msg,
    }));
    // Une requête par seconde environ : la durée s'allonge avec la liste (2 à 4 requêtes par jeu).
    const note = noms.length > 20 ? `${noms.length} jeux : environ ${Math.ceil(noms.length * 3.5 / 60)} min (1 requête par seconde), laisse l'onglet ouvert.` : undefined;
    maj(note);
    for (const demande of noms) {
      try { jeux.push({ demande, ...(await cherche(demande)) }); } catch (e) {
        if (/okkazeo bloque|inattendue/.test((e && e.message) || '')) return maj(MSG_BLOQUE);
        jeux.push({ demande, titre: null, url: null, annonces: null });
      }
      maj(note);
    }
    // Total d'annonces de chaque vendeur affiché (1 requête par vendeur, une seule fois même s'il est dans les deux listes).
    const b = bilanOkk(jeux, secu, CP_PARIS);
    const urls = new Set();
    for (const v of b.vendeurs.concat(b.securises ? b.securises.vendeurs : [])) { const a = v.annonces.find(x => x.url); if (a) urls.add(a.url); }
    for (const u of urls) {
      try { const nb = await nbVendeur(u); if (nb) nbs[u] = nb; } catch (e) {
        if (/okkazeo bloque/.test((e && e.message) || '')) return maj(MSG_BLOQUE);
      }
    }
    maj();
  })().finally(() => { if (window.__njOkk) window.__njOkk.enCours = false; });
})();
