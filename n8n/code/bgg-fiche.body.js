const ids = $('BGG Candidats').first().json.ids;
const xml = String($input.first().json.data ?? '');
const sature = !!$('BGG Candidats').first().json.sature || (!!ids && /Rate limit/i.test(xml));
const bgg = ids && !sature ? pickBgg(parseBggThings(xml), Number($('Webhook').first().json.query.an) || null, String($('Webhook').first().json.query.ed || '').trim().slice(0, 100)) : null;
return [{ json: { bgg, sature } }];
