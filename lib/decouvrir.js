// Découvrir (Tendances / Sorties / Prochainement de MyLudo) : tri « Pour toi » sur les mécaniques MyLudo (en français).
// Les nouveautés sont rarement documentées sur BGG (vérifié le 2026-11-18 : 5 jeux sur 18 sans fiche, souvent 1 à 3
// mécaniques) : on n'utilise que MyLudo ici. La fiche d'un jeu garde son encart « Pour toi » fondé sur BGG.

// Profil déduit des parties BGA (Captain Flip 123, Château Combo 120, Faraway 77, Toy Battle 59, Akropolis 44,
// Skull King 40, Zenith 37…) et confirmé par l'utilisateur. Un groupe compte une seule fois (son meilleur libellé).
const PROFIL_ML = {
  aime: [
    { nom: 'combos et draft', coeur: true, mots: { 'Combinaison': 3, 'Construction De Tableau': 3, 'Draft': 3, 'Placement De Cartes': 2, 'Collection': 2 } },
    { nom: 'stop ou encore', coeur: true, mots: { 'Prise de risque': 3, 'Stop ou encore': 3 } },
    { nom: 'plis', coeur: true, mots: { 'Plis': 3, 'Pari': 1, 'Défausse': 1 } },
    { nom: 'deck building', coeur: true, mots: { 'Deck building': 3, 'Marché': 1 } },
    { nom: 'pose de tuiles', mots: { 'Placement De Tuiles': 2, 'Empilement': 1 } },
    { nom: 'contrôle de zones', mots: { 'Majorité': 2, 'Contrôle de zone': 2, 'Tir à la corde': 2 } },
    { nom: 'roll & write', mots: { 'Roll & Write': 2, 'Flip & Write': 2, 'Papier & Crayon': 1 } }, // Welcome, Miams, Très Futé
    { nom: 'bluff', mots: { 'Bluff': 1 } },
  ],
  evite: [
    { nom: 'coopératif', poids: -3, mots: ['Coopération', 'Coopératif'] },
    { nom: 'legacy', poids: -3, mots: ['Legacy'] },
    { nom: 'campagne', poids: -2, mots: ['Campagne'] },
  ],
};

// Mécaniques MyLudo de tes jeux préférés (lues le 2026-11-18), du plus joué au moins joué : « proche de … ».
const FAVORIS_ML = [
  ['Captain Flip', ['Chance & Hasard', 'Choix multiples', 'Mémorisation', 'Placement De Tuiles', 'Prise de risque']],
  ['Château Combo', ['Combinaison', 'Construction De Tableau', 'Gestion de main', 'Placement De Cartes']],
  ['Faraway', ['Collection', 'Construction De Tableau', 'Gestion de main', 'Placement De Cartes']],
  ['Toy Battle', ['Contrôle de zone', 'Majorité', 'Stratégie']],
  ['Akropolis', ['Empilement', 'Placement De Tuiles']],
  ['Skull King', ['Pari', 'Plis', 'Prise de risque']],
  ['Zenith', ['Équipes', 'Gestion de main', 'Négociation', 'Plateau modulaire', 'Tir à la corde']],
  ['Kingdomino', ['Combinaison', 'Construction', 'Placement De Tuiles']],
  ['Odin', ['Combinaison', 'Défausse', 'Gestion de main']],
  ['King of Tokyo', ['Affrontement Direct', 'Chance & Hasard', 'Combinaison', 'Élimination', 'Gestion de main', 'Jet De Dés']],
  ['Miams', ['Chance & Hasard', 'Combinaison', 'Jet De Dés', 'Papier & Crayon', 'Roll & Write']],
  ['Flip 7', ['Chance & Hasard', 'Combinaison', 'Prise de risque', 'Stop ou encore']],
  ['Challengers!', ['Affrontement Direct', 'Asymétrie', 'Combinaison', 'Deck building']],
  ['Fliptoons', ['Combinaison', 'Deck building', 'Marché', 'Placement De Cartes']],
  ['Les Cités Perdues', ['Blocage', 'Chance & Hasard', 'Collection', 'Majorité', 'Prise de risque']],
  ['7 Wonders Duel', ['Draft', 'Gestion de ressources', 'Majorité', 'Tir à la corde']],
  ['Sea Salt & Paper', ['Chance & Hasard', 'Collection', 'Combinaison', 'Pioche', 'Prise de risque']],
  ['Splendor', ['Blocage', 'Combinaison', 'Échange & Troc', 'Gestion de ressources']],
  ['Dominion', ['Combinaison', 'Dans Ta Face', 'Deck building', 'Gestion de main']],
  ['Fantasy Realms', ['Collection', 'Combinaison', 'Gestion de main']],
];
// Trop répandues pour dire qu'un jeu ressemble à un autre.
const ML_GENERIQUES = new Set(['Gestion de main', 'Chance & Hasard', 'Stratégie', 'Affrontement Direct', 'Combinaison']);

// Liste MyLudo (views/games/datas.php) → jeux de base seulement (extensions et goodies écartés).
function parseDecouvrir(json) {
  return ((json && json.list) || []).filter(g => g && g.type === 'basegame').map(g => {
    const tmin = Number(g.time_min) || null, tmax = Number(g.time_max) || null;
    return {
      id: String(g.id), titre: [g.title, g.subtitle].filter(Boolean).join(' – '),
      url: `https://www.myludo.fr/#!/game/${g.code}-${g.id}`,
      image: (g.image && (g.image.S160 || g.image.S80)) || null,
      date: (g.release && g.release.dateshort) || null, futur: !!(g.release && g.release.futur),
      duree: tmin && tmax && tmin !== tmax ? `${tmin}–${tmax}` : (tmin || tmax ? String(tmin || tmax) : null), dureeMax: tmax || tmin,
      financement: g.crowdfunding || null,
      tendance: g.tendance != null ? Number(g.tendance) : null, evolution: g.trend != null ? Number(g.trend) : null,
    };
  });
}

// Mécaniques MyLudo d'un jeu (fiche type=info) : themes.mecanisme = { "deck-building-22": "Deck building", … }.
const mecaniquesMl = info => Object.values((info && info.themes && info.themes.mecanisme) || {}).map(String);

// Accents retirés sans séquence d'échappement (la couche d'envoi vers n8n les transforme) : on garde les caractères ASCII.
const sansAccent = s => [...String(s || '').normalize('NFD')].filter(c => c.charCodeAt(0) < 128).join('').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Ressemblance (cosinus sur les mécaniques non génériques) avec le favori le plus proche ; null sous 0,5 ou 2 communes.
// Un favori n'est pas « proche » de lui-même ni de sa gamme (Flip 7 – Vengeance).
function procheDe(meca, titreJeu) {
  const a = new Set(meca.filter(m => !ML_GENERIQUES.has(m)));
  const t = sansAccent(titreJeu);
  let best = null;
  for (const [titre, tags] of FAVORIS_ML) {
    if (t && t.startsWith(sansAccent(titre))) continue;
    const b = tags.filter(m => !ML_GENERIQUES.has(m));
    const communes = b.filter(m => a.has(m));
    if (communes.length < 2) continue;
    const sim = communes.length / Math.sqrt(a.size * b.length);
    if (sim >= 0.5 && (!best || sim > best.sim)) best = { titre, communes, sim: Math.round(sim * 100) / 100 };
  }
  return best;
}

// Score « Pour toi » d'un jeu (mécaniques MyLudo + durée). null = pas de mécanique connue (« infos insuffisantes »).
function scoreDecouvrir(jeu, meca) {
  if (!meca || !meca.length) return { score: null, verdict: 'Infos insuffisantes', oui: [], non: [], proche: null };
  const tags = new Set(meca);
  let score = 0, coeur = false;
  const oui = [], non = [];
  for (const g of PROFIL_ML.aime) {
    const p = Math.max(0, ...Object.entries(g.mots).filter(([m]) => tags.has(m)).map(([, v]) => v));
    if (p) { score += p; oui.push(g.nom); if (g.coeur && p >= 2) coeur = true; }
  }
  for (const g of PROFIL_ML.evite) if (g.mots.some(m => tags.has(m))) { score += g.poids; non.push(g.nom); }
  const d = jeu.dureeMax;
  if (d && d <= 40) { score += 1; oui.push('partie courte'); } else if (d > 90) { score -= 3; non.push(`long (${d} min)`); } else if (d > 60) { score -= 2; non.push(`long (${d} min)`); }
  const proche = procheDe(meca, jeu.titre);
  if (proche) score += 1;
  const verdict = score >= 6 && coeur && !non.length ? 'Très ton style'
    : score >= 3 && !(non.length > oui.length) ? 'Dans tes goûts'
    : non.length > oui.length || score < 0 ? 'Loin de tes habitudes' : 'Peu de points communs';
  return { score, verdict, oui, non, proche };
}

// Les n jeux les plus proches de tes goûts (« Très ton style » puis « Dans tes goûts », ordre MyLudo à score égal).
function pourToiDecouvrir(jeux, n = 5) {
  return jeux.map((j, i) => ({ j, i })).filter(x => ['Très ton style', 'Dans tes goûts'].includes(x.j.verdict))
    .sort((a, b) => b.j.score - a.j.score || a.i - b.i).slice(0, n).map(x => x.j.id);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PROFIL_ML, FAVORIS_ML, parseDecouvrir, mecaniquesMl, procheDe, scoreDecouvrir, pourToiDecouvrir };
}
