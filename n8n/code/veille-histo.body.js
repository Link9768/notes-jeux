// Webhook GET ?jeu=<titre> → historique des prix du jeu suivi : { titre, okk, pts: [[jour, médiane, min, n]], maj } ; inconnu → { pts: [], maj }.
const statique = typeof $getWorkflowStaticData === 'function' ? $getWorkflowStaticData('global') : {};
const v = statique.veille || {};
const jeu = String(($('Webhook').first().json.query || {}).jeu || '').trim().toLowerCase();
const maj = v.derniere || null;
const h = jeu && v.histo ? v.histo[jeu] : null;
return [{ json: h ? { ...h, maj } : { pts: [], maj } }];
