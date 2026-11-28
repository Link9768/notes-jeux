const xml = String($input.first().json.data ?? '');
// BGG refuse quand on l'appelle trop vite (« Rate limit exceeded ») : on le signale au lieu de répondre « pas de jeu ».
if (/Rate limit/i.test(xml)) return [{ json: { ids: '', sature: true } }];
const ids = bggCandidates($('Webhook').first().json.query.q, parseBggSearch(xml));
return [{ json: { ids: ids.join(',') } }]; // toujours 1 item, même vide
