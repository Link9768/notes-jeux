const ids = $('BGG Candidats').first().json.ids;
const bgg = ids ? pickBgg(parseBggThings(String($input.first().json.data ?? '')), Number($('Webhook').first().json.query.an) || null) : null;
return [{ json: { bgg } }];