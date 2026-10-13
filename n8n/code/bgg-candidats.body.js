const xml = String($input.first().json.data ?? '');
const ids = bggCandidates($('Webhook').first().json.query.q, parseBggSearch(xml));
return [{ json: { ids: ids.join(',') } }]; // toujours 1 item, même vide
