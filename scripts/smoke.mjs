// Usage : node scripts/smoke.mjs "clank" "catane" …  → appelle le webhook de prod et résume chaque réponse
const API = 'https://n8n.srv1250642.hstgr.cloud/webhook/notes-jeux';
const b = x => (x ? `${x.note ?? '-'}/${x.avis ?? x.votes ?? '-'} «${x.titre}»` : 'null');
for (const q of process.argv.slice(2)) {
  const t = Date.now();
  const r = await fetch(`${API}?q=${encodeURIComponent(q)}`);
  const d = await r.json();
  const o = d.okkazeo;
  console.log(`${q.padEnd(24)} ${r.status} ${((Date.now() - t) / 1000).toFixed(1)}s | EJ ${b(d.espritjeu)} | PH ${b(d.philibert)} | ML ${b(d.myludo)} | BGG ${b(d.bgg)} | OKK ${o ? `${o.total} (${o.min}-${o.max}€) parsees=${o.parsees ?? '-'} paris=${o.annonces.length}` : 'null'} | err ${JSON.stringify(d.erreurs)}`);
}
