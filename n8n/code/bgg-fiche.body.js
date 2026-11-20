const ids = $('BGG Candidats').first().json.ids;
const bgg = ids ? pickBgg(parseBggThings(String($input.first().json.data ?? '')), Number($('Webhook').first().json.query.an) || null, String($('Webhook').first().json.query.ed || '').trim().slice(0, 100)) : null;
return [{ json: { bgg } }];