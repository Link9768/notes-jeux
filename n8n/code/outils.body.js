// Webhook GET ?op=ext|meca|jumeaux&id=<id BGG> | op=suggest&q=<texte> | op=ean&code=<chiffres> | op=videos&q=<titre>&q2=<autre titre>
const p = $('Webhook').first().json.query || {};
const op = String(p.op || '');
const id = String(p.id || '').replace(/\D/g, '').slice(0, 10);
const UA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Accept': 'application/json', 'Accept-Language': 'fr-FR,fr;q=0.9',
};
const req = async (url, headers = UA) => {
  const r = await this.helpers.httpRequest({ url, headers, json: false, timeout: 10000, returnFullResponse: true, ignoreHttpStatusErrors: true });
  if (r.statusCode >= 400) throw new Error(`HTTP ${r.statusCode} ${url.split('?')[0]}`);
  return r;
};
// Page en ISO-8859-1 (Esprit Jeu) : octets bruts puis décodage latin1.
const reqLatin1 = async url => Buffer.from(await this.helpers.httpRequest({ url, headers: { ...UA, 'Accept': 'text/html' }, timeout: 10000, encoding: 'arraybuffer', ignoreHttpStatusErrors: true })).toString('latin1');
// n8n décode lui-même le JSON (selon le content-type) malgré json: false : objet ou texte selon les cas.
const getJson = async url => { const b = (await req(url)).body; return typeof b === 'string' ? JSON.parse(b) : b; };
// Requêtes en parallèle, 6 à la fois (geekdo limite les rafales) ; une requête en échec donne null.
async function parallele(taches, max = 6) {
  const res = new Array(taches.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(max, taches.length) }, async () => {
    while (i < taches.length) { const k = i++; try { res[k] = await taches[k](); } catch (e) { res[k] = null; } }
  }));
  return res;
}
const ficheUrl = x => `https://api.geekdo.com/api/geekitems?objectid=${x}&objecttype=thing&nosession=1`;

async function jumeaux() {
  const [fiche, dyn] = await Promise.all([getJson(ficheUrl(id)), getJson(`https://api.geekdo.com/api/dynamicinfo?objectid=${id}&objecttype=thing`).catch(() => null)]);
  const cible = { ...geekItemTags(fiche), poids: Number(dyn && dyn.item && dyn.item.stats && dyn.item.stats.avgweight) || null };
  if (!cible.tags.length) return [];
  const tags = [...cible.tags.filter(t => t.type === 'mecanique' || t.type === 'famille'), ...cible.tags.filter(t => t.type === 'theme' || t.type === 'categorie')].slice(0, 12);
  const listes = (await parallele(tags.map(t => async () => {
    const j = await getJson(linkedItemsUrl(t));
    return { tag: t, total: Number(j.config && j.config.numitems) || 0, jeux: parseLinkedItems(j) };
  }))).filter(Boolean);
  const finalistes = preselection(cible, listes);
  const fiches = new Map((await parallele(finalistes.map(j => async () => geekItemTags(await getJson(ficheUrl(j.id)))))).filter(Boolean).map(f => [f.id, f]));
  return scoreJumeaux(cible, listes, finalistes, fiches);
}

// Saisie semi-automatique : titres MyLudo (français), jeton CSRF + cookie comme dans le node Sources.
async function suggest(q) {
  if (q.length < 3) return [];
  const home = await req('https://www.myludo.fr/', { ...UA, 'Accept': 'text/html' });
  const token = (String(home.body).match(/name="csrf-token" content="([^"]+)"/) || [])[1];
  if (!token) throw new Error('jeton CSRF introuvable');
  const cookie = [].concat((home.headers || {})['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  const r = await req('https://www.myludo.fr/views/search/datas.php?type=search&tab=games&page=1&order=bymagic&words=' + encodeURIComponent(q),
    { ...UA, 'X-Requested-With': 'XMLHttpRequest', 'X-Csrf-Token': token, 'Cookie': cookie });
  return classerSuggestions(q, parseMyludoSearch(typeof r.body === 'string' ? JSON.parse(r.body) : r.body));
}

// Code-barres → titre : recherche Philibert par EAN, sinon Esprit Jeu (page en ISO-8859-1).
async function ean(code) {
  const ph = await req('https://www.philibertnet.com/fr/recherche?search_query=' + code, { ...UA, 'Accept': 'text/html' }).catch(() => null);
  const a = ph && parsePhilibertSearch(String(ph.body))[0];
  if (a) return a.title;
  const ej = await reqLatin1('https://www.espritjeu.com/dhtml/resultat_recherche.php?keywords=' + code).catch(() => null);
  const b = ej && parseEspritJeuSearch(ej)[0];
  return b ? b.title : null;
}

// Vidéos de règles : Ludochrono (chaîne Ludovox) et Le Chalet (chaîne Un Monde de jeux), recherche dans chaque chaîne
// (sans clé d'API ; cookie SOCS = refus des cookies, sinon YouTube redirige vers sa page de consentement).
// Titres essayés dans l'ordre (MyLudo en français, puis BGG) ; une chaîne en panne → null pour elle seule.
const YT = { 'User-Agent': UA['User-Agent'], 'Accept': 'text/html', 'Accept-Language': 'fr-FR,fr;q=0.9', 'Cookie': 'SOCS=CAI' };
async function videos(titres) {
  const cherche = async (chaine, pick) => {
    for (const t of titres) {
      const r = await req(`https://www.youtube.com/@${chaine}/search?query=${encodeURIComponent(t)}`, YT).catch(() => null);
      const v = r && pick(parseYtVideos(String(r.body)), titres);
      if (v) return v;
    }
    return null;
  };
  const [ludochrono, chalet] = await Promise.all([cherche('LudovoxFr', pickLudochrono), cherche('UnMondedejeux', pickChalet)]);
  return { ludochrono, chalet };
}

const base = `https://api.geekdo.com/api/geekitem/linkeditems?ajax=1&nosession=1&objectid=${id}&pageid=1&sort=rank`;
try {
  if (op === 'ext' && id) return [{ json: { op, extensions: pickExtensions(await getJson(`${base}&linkdata_index=boardgameexpansion&objecttype=thing&showcount=50&subtype=boardgameexpansion`)) } }];
  if (op === 'meca' && id) return [{ json: { op, jeux: pickTopMeca(await getJson(`${base}&linkdata_index=boardgame&objecttype=property&showcount=25&subtype=boardgamemechanic`)) } }];
  if (op === 'jumeaux' && id) return [{ json: { op, jumeaux: await jumeaux() } }];
  const titres = [p.q, p.q2].map(x => String(x || '').trim().slice(0, 80)).filter((x, i, a) => x && a.indexOf(x) === i);
  if (op === 'videos' && titres.length) return [{ json: { op, ...(await videos(titres)) } }];
  if (op === 'suggest') return [{ json: { op, titres: await suggest(String(p.q || '').trim().slice(0, 60)) } }];
  if (op === 'ean' && estEan(p.code)) return [{ json: { op, titre: await ean(String(p.code).trim()) } }];
  return [{ json: { op, erreur: 'paramètres invalides' } }];
} catch (e) {
  return [{ json: { op, erreur: (e && e.message) || String(e) } }];
}