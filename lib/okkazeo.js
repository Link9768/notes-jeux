const PRICE_RE = /^(\d+)\s*€\s*(\d{2})\b/;

function htmlToLines(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|h\d|tr|section|article|header|footer)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&rsquo;|&apos;/g, "'").replace(/&euro;/g, '€')
    .split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function parseAnnonces(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const p = lines[i].match(PRICE_RE);
    if (!p) continue;
    let j = i + 1;
    while (j < lines.length && j < i + 12 && !PRICE_RE.test(lines[j])) j++;
    const win = lines.slice(i + 1, j);
    const v = win.findIndex(l => /^Vendu par\b/i.test(l));
    if (v === -1) continue;
    const loc = win.map(l => l.match(/^(.+?) \((\d{4,5})\)$/)).find(Boolean); // 4 chiffres = annonces étrangères (ex. Belgique)
    const d = win.map(l => l.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)).find(Boolean);
    const head = lines[i - 1] || '';
    const paren = (head.match(/\(([^()]+)\)\s*$/) || [])[1];
    const etat = /^Jeu neuf\b/i.test(head) ? 'neuf' : paren ? paren.replace(/^état\s+/i, '') : head;
    out.push({
      prix: Number(p[1]) + Number(p[2]) / 100,
      etat: etat.trim(),
      ville: loc ? loc[1].trim() : null,
      cp: loc ? loc[2] : null,
      date: d ? `${d[3]}-${d[2]}-${d[1]}` : null,
      bonneAffaire: /bonne affaire/i.test(lines[i]) || win.slice(0, v).some(l => /bonne affaire/i.test(l)),
      extensions: /extension/i.test(head),
      envoi: win.some(l => /Envoi en France/i.test(l)),
    });
  }
  return out;
}

function filterParis(annonces, cps) {
  const set = new Set(cps);
  return (annonces || []).filter(a => a.cp && set.has(a.cp)).sort((a, b) => a.prix - b.prix);
}

if (typeof module !== 'undefined' && module.exports) module.exports = { htmlToLines, parseAnnonces, filterParis };
