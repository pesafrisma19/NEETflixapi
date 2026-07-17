// Test matching season logic
function titleSimilarity(query, candidate) {
  const normalize = (s) => s.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();

  const q = normalize(query);
  const c = normalize(candidate);

  if (q === c) return 100;

  const seasonPattern = /\b(s\d+|season\s*\d+|part\s*\d+|[ivx]{2,}|\d+(st|nd|rd|th)\s*(season|part)|ii|iii|iv)\b/gi;
  const qSeasons = (q.match(seasonPattern) || []).map(s => s.toLowerCase());
  const cSeasons = (c.match(seasonPattern) || []).map(s => s.toLowerCase());

  if (qSeasons.length > 0 && cSeasons.length === 0) return 20;
  if (qSeasons.length === 0 && cSeasons.length > 0) return 15;

  const qWords = new Set(q.split(' ').filter(w => w.length > 2));
  const cWords = c.split(' ').filter(w => w.length > 2);
  const overlap = cWords.filter(w => qWords.has(w)).length;
  const score = Math.round((overlap / Math.max(qWords.size, 1)) * 70);

  return Math.min(score, 99);
}

const tests = [
  ["Youjo Senki", "Youjo Senki"],
  ["Youjo Senki", "Youjo Senki II"],
  ["Youjo Senki", "Youjo Senki Movie"],
];

for (const [q, c] of tests) {
  console.log(`"${q}" vs "${c}" → score: ${titleSimilarity(q, c)}`);
}
