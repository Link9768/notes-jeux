const ids = $('BGG Candidats').first().json.ids;
const bgg = ids ? pickBgg(parseBggThings(String($input.first().json.data ?? ''))) : null;
return [{ json: { bgg } }];
