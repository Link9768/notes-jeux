const q = String($('Webhook').first().json.query.q || '').trim().slice(0, 100);
const enc = encodeURIComponent(q);
const liens = {
  espritjeu: 'https://www.espritjeu.com/dhtml/resultat_recherche.php?keywords=' + enc,
  philibert: 'https://www.philibertnet.com/fr/recherche?search_query=' + enc,
  bgg: 'https://boardgamegeek.com/geeksearch.php?action=search&objecttype=boardgame&q=' + enc,
  okkazeo: 'https://www.okkazeo.com/jeux/resultats?rech_nom=' + enc,
  myludo: 'https://www.myludo.fr/#!/search/' + enc,
};
const bgg = $('BGG Fiche').first().json.bgg;
if (!q) return [{ json: { query: q, espritjeu: null, philibert: null, bgg: null, okkazeo: null, myludo: null, liens, erreurs: ['q manquant'] } }];

const UA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9',
};
// Okkazeo refuse (403) le User-Agent seul : il faut les en-têtes d'un vrai navigateur (vérifié le 2026-10-13).
const BROWSER = {
  ...UA,
  'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Site': 'none', 'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  'sec-ch-ua': '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
  'sec-ch-ua-mobile': '?0', 'sec-ch-ua-platform': '"Windows"',
  'Accept-Encoding': 'gzip, deflate, br', 'Referer': 'https://www.google.com/',
};
// charset : Esprit Jeu sert ses pages en ISO-8859-1 (accents perdus si lues en UTF-8) → arraybuffer + décodage.
const get = async (url, headers = UA, charset) => {
  const r = await this.helpers.httpRequest({ url, headers, json: false, timeout: 10000, returnFullResponse: true, ignoreHttpStatusErrors: true, ...(charset ? { encoding: 'arraybuffer' } : {}) });
  if (r.statusCode >= 400) throw new Error(`HTTP ${r.statusCode} ${url}`);
  return charset ? Buffer.from(r.body).toString(charset) : String(r.body ?? '');
};

async function boutique(searchUrl, parseSearch, charset) {
  const p = pickProduct(q, parseSearch(await get(searchUrl, UA, charset)));
  if (!p) return null;
  const r = ratingOf(findProduct(extractJsonLd(await get(p.url, UA, charset))));
  return { note: r ? r.note : (p.note ?? null), avis: r ? r.avis : null, titre: p.title, url: p.url };
}

// Okkazeo sépare un même jeu en plusieurs éditions (même titre, ids différents) : on additionne celles qui ont des annonces.
async function okkazeo() {
  const search = await get(liens.okkazeo, BROWSER);
  if (!/Nous avons trouvé|Aucun jeu ne correspond/.test(search)) throw new Error('page de recherche inattendue');
  const cands = parseOkkazeoSearch(search);
  const p = pickProduct(q, cands);
  const vide = { total: 0, min: null, max: null, url: p ? p.url : liens.okkazeo, annonces: [] };
  if (!p) return vide;
  const editions = cands.filter(c => normalize(c.title) === normalize(p.title) && c.annonces !== 0).slice(0, 3);
  if (!editions.length) return vide;
  const pages = await Promise.all(editions.map(e => get(e.url, BROWSER)));
  const offres = pages.map(h => offersOf(findProduct(extractJsonLd(h))) || { total: 0, min: null, max: null });
  const prix = offres.flatMap(o => [o.min, o.max]).filter(x => x != null);
  const toutes = pages.flatMap(h => parseAnnonces(htmlToLines(h)));
  return {
    total: offres.reduce((s, o) => s + o.total, 0),
    min: prix.length ? Math.min(...prix) : null,
    max: prix.length ? Math.max(...prix) : null,
    url: editions.length > 1 ? liens.okkazeo : editions[0].url,
    parsees: toutes.length,
    annonces: filterParis(toutes, CP_PARIS),
  };
}

// MyLudo (note de la communauté) : l'API interne exige le jeton CSRF de la page d'accueil ET le cookie de session.
const getFull = async (url, headers) => this.helpers.httpRequest({ url, headers, json: false, timeout: 10000, returnFullResponse: true, ignoreHttpStatusErrors: true });
async function myludo() {
  const home = await getFull('https://www.myludo.fr/', UA);
  if (home.statusCode >= 400) throw new Error(`HTTP ${home.statusCode} myludo.fr`);
  const token = (String(home.body).match(/name="csrf-token" content="([^"]+)"/) || [])[1];
  if (!token) throw new Error('jeton CSRF introuvable');
  const cookie = [].concat((home.headers || {})['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  const api = { ...UA, 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-Csrf-Token': token, 'Cookie': cookie };
  const call = async path => {
    const r = await getFull('https://www.myludo.fr/views/' + path, api);
    if (r.statusCode >= 400) throw new Error(`HTTP ${r.statusCode} myludo ${path.split('?')[0]}`);
    return typeof r.body === 'string' ? JSON.parse(r.body) : r.body;
  };
  const p = pickMyludo(q, parseMyludoSearch(await call('search/datas.php?type=search&tab=games&page=1&order=bymagic&words=' + enc)));
  if (!p) return null;
  const fiche = parseMyludoGame(await call('game/datas.php?type=game&id=' + encodeURIComponent(p.id)));
  // Mécaniques et semblables : facultatifs. Une panne met ces deux champs à null sans effacer la note.
  try {
    const info = parseMyludoInfo(await call('game/datas.php?type=info&id=' + encodeURIComponent(p.id)));
    // Jeux de base du tag, du mieux classé au moins bien (même liste que le clic sur un tag du site) ; max 10 mécaniques.
    const tagLists = (await Promise.allSettled(info.mecaniques.slice(0, 10).map(async m => {
      const l = await call(`theme/datas.php?type=games&id=${m.id}&order=byrankdesc&filter=basegame&limit=100`);
      return { ...m, count: Number(l.count) || 0, list: l.list || [] };
    }))).filter(r => r.status === 'fulfilled').map(r => r.value);
    const similaires = await Promise.all(pickSimilaires(fiche.titre, tagLists).map(async s => {
      try { const g = parseMyludoGame(await call('game/datas.php?type=game&id=' + encodeURIComponent(s.id))); return { ...s, note: g.note, avis: g.avis }; }
      catch (e) { return { ...s, note: null, avis: null }; }
    }));
    return { ...fiche, mecaniques: topMecaniques(tagLists), themes: info.themes.slice(0, 3), similaires };
  } catch (e) {
    return { ...fiche, mecaniques: null, themes: null, similaires: null };
  }
}

const [ej, ph, ok, ml] = await Promise.allSettled([
  boutique(liens.espritjeu, parseEspritJeuSearch, 'latin1'),
  boutique(liens.philibert, parsePhilibertSearch),
  okkazeo(),
  myludo(),
]);
const val = r => (r.status === 'fulfilled' ? r.value : null);
const erreurs = [ej, ph, ok, ml].map((r, i) => r.status === 'rejected' ? `${['espritjeu', 'philibert', 'okkazeo', 'myludo'][i]}: ${(r.reason && r.reason.message) || String(r.reason)}` : null).filter(Boolean);
return [{ json: { query: q, espritjeu: val(ej), philibert: val(ph), bgg, okkazeo: val(ok), myludo: val(ml), liens, erreurs } }];