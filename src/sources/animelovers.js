// src/sources/animelovers.js
// Scraper AnimeLovers via API animekita.org
// Ported from aNEETme project

import { getMapping } from '../utils/mappings.js';

const HEADERS = {
  "accept": "application/json",
  "user-agent": "Dart/3.9 (dart:io)"
};

const BASE = "https://apps.animekita.org/api/v1.2.5";

const normalizeId = (url) => url ? url.replace("anime/", "") : "";

// Strip PHP warning/error HTML yang sering muncul sebelum JSON
function parseSafeJson(text) {
  const start = text.indexOf('{');
  const startArr = text.indexOf('[');
  let idx = -1;
  if (start === -1) idx = startArr;
  else if (startArr === -1) idx = start;
  else idx = Math.min(start, startArr);
  if (idx === -1) throw new Error("Response bukan JSON valid");
  return JSON.parse(text.slice(idx));
}

export async function searchAnimelovers(query, page = 1) {
  const url = `${BASE}/search.php?keyword=${encodeURIComponent(query)}&page=${page}&per_page=30`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error("Gagal memuat data pencarian AnimeLovers");
  const json = parseSafeJson(await res.text());
  const items = json.data?.[0]?.result || [];
  return items.map((item) => ({
    id: normalizeId(item.url),
    title: item.judul,
    image: item.cover,
    releaseDate: item.rilis || "",
    status: item.status || "",
    studio: item.studio || "",
    type: item.type || "",
    total_episode: item.total_episode || null
  }));
}

export async function getInfoAnimelovers(id) {
  const url = `${BASE}/series.php?url=${id}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error("Gagal memuat detail AnimeLovers");
  const json = parseSafeJson(await res.text());
  if (!json.data || json.data.length === 0) throw new Error("Data tidak ditemukan");

  const item = json.data[0];
  const episodes = (item.chapter || []).map((ep) => ({
    id: normalizeId(ep.url),
    title: `Episode ${ep.ch}`,
    episodeNumber: parseFloat(ep.ch) || ep.ch
  }));

  return {
    title: item.judul,
    image: item.cover,
    synopsis: item.sinopsis,
    status: item.status,
    releaseDate: item.published,
    genres: item.genre || [],
    type: item.type || "",
    studio: item.author || item.studio || "",
    episodes
  };
}

export async function getStreamAnimelovers(id) {
  const url = `${BASE}/series/episode/data.php?url=${id}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error("Gagal memuat stream AnimeLovers");
  const json = parseSafeJson(await res.text());
  if (!json.data || json.data.length === 0) throw new Error("Video tidak ditemukan");

  const streams = json.data[0].streams;
  let sources = [];

  const BLOCKED = ["pixeldrain.com", "pixeldra.in"];
  const isBlocked = (url) => BLOCKED.some(d => url.includes(d));

  if (streams) {
    for (const [quality, links] of Object.entries(streams)) {
      const best = links.find(s => s.link && !isBlocked(s.link))
        || links.find(s => s.link);
      if (best?.link) {
        sources.push({
          quality,
          url: best.link,
          type: best.link.includes(".m3u8") ? "hls" : "mp4",
          server: "AnimeLovers"
        });
      }
    }
  }

  if (sources.length === 0) throw new Error("Tidak ada video tersedia");

  const qualityOrder = ["1080p", "720p", "480p", "360p", "240p"];
  sources.sort((a, b) => {
    const ai = qualityOrder.indexOf(a.quality);
    const bi = qualityOrder.indexOf(b.quality);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return { sources };
}

/**
 * Hitung skor kemiripan berdasarkan multi-parameter
 */
function calculateMatchScore(anilistData, candidate) {
  let score = 0;
  
  // 1. TITLE MATCH (Max 40)
  const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim();
  const cTitle = normalize(candidate.title);
  
  let bestTitleScore = 0;
  for (const t of anilistData.titles || []) {
    if (!t) continue;
    const qTitle = normalize(t);
    if (qTitle === cTitle) {
      bestTitleScore = 40;
      break;
    }
    const qWords = new Set(qTitle.split(' ').filter(w => w.length > 2));
    const cWords = cTitle.split(' ').filter(w => w.length > 2);
    if (qWords.size === 0 && cWords.length === 0) continue;
    const cSet = new Set(cWords);
    const overlap = cWords.filter(w => qWords.has(w)).length;
    const union = new Set([...qWords, ...cSet]).size;
    const s = Math.round((overlap / Math.max(union, 1)) * 30); // Jaccard similarity
    if (s > bestTitleScore) bestTitleScore = s;
  }
  score += bestTitleScore;

  // Deteksi season mismatch (sangat fatal) — bandingkan NOMOR season, bukan cuma ada/tidak
  const extractSeasonNum = (text) => {
    if (!text) return null;
    const t = text.toLowerCase();
    let m = t.match(/(?:s|season\s*)(\d+)/);
    if (m) return parseInt(m[1]);
    m = t.match(/(\d+)(?:st|nd|rd|th)\s*season/);
    if (m) return parseInt(m[1]);
    m = t.match(/part\s*(\d+)/);
    if (m) return parseInt(m[1]);
    // Roman numerals (hanya yang jelas)
    if (/\biv\b/.test(t)) return 4;
    if (/\biii\b/.test(t)) return 3;
    if (/\bii\b/.test(t)) return 2;
    return null;
  };
  let qSeasonNum = null;
  for (const t of anilistData.titles || []) {
    const n = extractSeasonNum(t);
    if (n !== null) { qSeasonNum = n; break; }
  }
  const cSeasonNum = extractSeasonNum(candidate.title);
  if (qSeasonNum !== null && cSeasonNum !== null) {
    if (qSeasonNum !== cSeasonNum) score -= 40; // Beda nomor season = hampir pasti salah
  } else if (qSeasonNum !== null && cSeasonNum === null) {
    score -= 20; // AniList punya season tapi candidate tidak
  } else if (qSeasonNum === null && cSeasonNum !== null) {
    score -= 30; // Candidate punya season tapi AniList tidak
  }

  // 2. YEAR MATCH (Max 20)
  const aYearData = anilistData.year || anilistData.seasonYear;
  if (aYearData && candidate.releaseDate) {
    const cYearMatch = candidate.releaseDate.match(/\d{4}/);
    if (cYearMatch) {
      const cYear = parseInt(cYearMatch[0], 10);
      const aYear = parseInt(aYearData, 10);
      if (cYear === aYear) {
        score += 20;
      } else if (Math.abs(cYear - aYear) === 1) {
        score += 10; // beda 1 tahun bisa jadi karena akhir/awal tahun
      } else {
        score -= 20; // beda jauh = kemungkinan besar beda season
      }
    }
  }

  // 3. FORMAT MATCH (Max 15)
  if (anilistData.format && candidate.type) {
    const aFormat = anilistData.format.toLowerCase();
    const cFormat = candidate.type.toLowerCase();
    if ((aFormat === 'tv' && cFormat === 'tv') || (aFormat === 'movie' && cFormat === 'movie')) {
      score += 15;
    } else if (aFormat !== cFormat && ['tv', 'movie'].includes(aFormat) && ['tv', 'movie'].includes(cFormat)) {
      score -= 30; // Jika beda format TV vs Movie, diskualifikasi
    }
  }

  // 4. STUDIO MATCH (Max 10)
  if (anilistData.studio && candidate.studio) {
    const aStudio = normalize(anilistData.studio).replace(/\s/g, ''); // Hapus spasi agar 8-bit cocok dgn 8bit
    const cStudio = normalize(candidate.studio).replace(/\s/g, '');
    if (aStudio && cStudio && (aStudio.includes(cStudio) || cStudio.includes(aStudio))) {
      score += 10;
    }
  }

  // 5. STATUS MATCH (Max 5)
  if (anilistData.status && candidate.status) {
    const isAOngoing = anilistData.status === 'RELEASING';
    const isCOngoing = candidate.status.toLowerCase() === 'ongoing';
    if (isAOngoing === isCOngoing) score += 5;
  }

  // 6. TOTAL EPISODES (Max 10)
  if (anilistData.totalEpisodes && candidate.total_episode) {
    const aEps = parseInt(anilistData.totalEpisodes);
    const cEps = parseInt(candidate.total_episode);
    if (aEps === cEps) {
      score += 10;
    } else if (Math.abs(aEps - cEps) <= 2) {
      score += 5; // Sedikit beda bisa karena special/recap
    } else {
      score -= 15; // Beda jauh = kemungkinan besar beda series/season
    }
  }

  return Math.min(score, 100); // Biarkan negatif untuk ranking yang lebih informatif
}

export async function getEpisodeStreamByTitle(anilistData, epNum) {
  const anilistId = typeof anilistData === 'object' ? anilistData.id : null;

  if (anilistId) {
    const mappedSlug = getMapping(anilistId, "animelovers");
    if (mappedSlug) {
      const info = await getInfoAnimelovers(mappedSlug);
      if (info.episodes && info.episodes.length > 0) {
        const targetEp = info.episodes.find(ep => String(ep.episodeNumber) === String(epNum));
        if (targetEp) {
          const stream = await getStreamAnimelovers(targetEp.id);
          return { animeId: mappedSlug, animeTitle: info.title, episodeId: targetEp.id, sources: stream.sources };
        }
      }
    }
  }

  let results = [];
  let query = "";
  const titlesToSearch = (typeof anilistData === 'object' && anilistData.titles) ? anilistData.titles.slice(0, 3) : [anilistData];
  
  // Helper: bersihkan special chars agar search engine AnimeLovers tidak bingung
  // Contoh: "THE LAST -NARUTO THE MOVIE-" → "THE LAST NARUTO THE MOVIE"
  const cleanForSearch = (s) => s.replace(/[^a-z0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim();

  let searchQueries = [];
  for (const t of titlesToSearch) {
    if (!t) continue;
    // Versi original
    searchQueries.push(t);
    // Versi tanpa (YYYY) atau (TV)
    const stripped = t.replace(/\s*\(\d{4}\)\s*/g, '').replace(/\s*\(TV\)\s*/gi, '').trim();
    if (stripped !== t && !searchQueries.includes(stripped)) searchQueries.push(stripped);
    // Versi bersih dari special chars (paling penting untuk judul romaji)
    const cleaned = cleanForSearch(stripped);
    if (cleaned !== stripped && !searchQueries.includes(cleaned)) searchQueries.push(cleaned);
    // Fallback: 3 kata pertama dari versi bersih
    const shortQuery = cleaned.split(' ').filter(w => w.length > 1).slice(0, 3).join(' ');
    if (shortQuery.length > 5 && !searchQueries.includes(shortQuery)) searchQueries.push(shortQuery);
  }

  for (const t of searchQueries) {
    if (!t) continue;
    query = t;
    results = await searchAnimelovers(query);
    if (results.length > 0) break;
  }

  if (!results.length) throw new Error(`Anime "${titlesToSearch[0]}" tidak ditemukan di AnimeLovers`);

  const scored = results.map(r => ({
    ...r,
    score: (typeof anilistData === 'object') ? calculateMatchScore(anilistData, r) : 50
  })).sort((a, b) => b.score - a.score);

  console.log(`[AL] Candidates for "${query}":`, scored.map(s => `${s.id}(${s.score})`).join(', '));
  
  const topScore = scored[0]?.score ?? 0;
  if (topScore < 20) throw new Error(`Tidak ada hasil yang cocok untuk "${query}" di AnimeLovers (skor terbaik: ${topScore})`);
  const minAcceptable = topScore >= 70 ? 70 : 40;
  const candidates = scored.filter(s => s.score >= minAcceptable);
  if (candidates.length === 0) candidates.push(scored[0]);

  let lastError = null;
  for (const candidate of candidates.slice(0, 3)) {
    try {
      const info = await getInfoAnimelovers(candidate.id);
      if (!info.episodes || info.episodes.length === 0) continue;
      // Cari episode by nomor, atau fallback ke episode non-numerik (Movie/OVA/Special) jika epNum=1
      const targetEp = info.episodes.find(ep => String(ep.episodeNumber) === String(epNum))
        ?? (String(epNum) === '1' && info.episodes.length === 1 ? info.episodes[0] : null)
        ?? (String(epNum) === '1' ? info.episodes.find(ep => /^(movie|ova|special|film)/i.test(String(ep.episodeNumber))) : null);
      if (!targetEp) {
        lastError = `Episode ${epNum} tidak ada di "${candidate.id}"`;
        continue;
      }
      const stream = await getStreamAnimelovers(targetEp.id);
      return { animeId: candidate.id, animeTitle: info.title, episodeId: targetEp.id, sources: stream.sources };
    } catch (err) {
      lastError = err.message;
    }
  }
  throw new Error(lastError || `Episode ${epNum} tidak ditemukan untuk "${query}"`);
}

export async function getEpisodesByTitle(anilistData) {
  const anilistId = typeof anilistData === 'object' ? anilistData.id : null;

  if (anilistId) {
    const mappedSlug = getMapping(anilistId, "animelovers");
    if (mappedSlug) {
      const info = await getInfoAnimelovers(mappedSlug);
      return {
        animeId: mappedSlug,
        animeTitle: info.title,
        totalEpisodes: info.episodes.length,
        episodes: info.episodes.map(ep => {
          const raw = ep.episodeNumber;
          const num = parseFloat(raw);
          return { number: isNaN(num) ? 1 : num, id: ep.id, label: isNaN(num) ? String(raw) : undefined };
        }).sort((a, b) => a.number - b.number)
      };
    }
  }

  let results = [];
  let query = "";
  const titlesToSearch = (typeof anilistData === 'object' && anilistData.titles) ? anilistData.titles.slice(0, 3) : [anilistData];
  
  // Helper: bersihkan special chars agar search engine AnimeLovers tidak bingung
  const cleanForSearch = (s) => s.replace(/[^a-z0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim();

  let searchQueries = [];
  for (const t of titlesToSearch) {
    if (!t) continue;
    searchQueries.push(t);
    const stripped = t.replace(/\s*\(\d{4}\)\s*/g, '').replace(/\s*\(TV\)\s*/gi, '').trim();
    if (stripped !== t && !searchQueries.includes(stripped)) searchQueries.push(stripped);
    // Versi bersih dari special chars (paling penting untuk judul romaji)
    const cleaned = cleanForSearch(stripped);
    if (cleaned !== stripped && !searchQueries.includes(cleaned)) searchQueries.push(cleaned);
    // Fallback: 3 kata pertama dari versi bersih
    const shortQuery = cleaned.split(' ').filter(w => w.length > 1).slice(0, 3).join(' ');
    if (shortQuery.length > 5 && !searchQueries.includes(shortQuery)) searchQueries.push(shortQuery);
  }

  for (const t of searchQueries) {
    if (!t) continue;
    query = t;
    results = await searchAnimelovers(query);
    if (results.length > 0) break;
  }

  if (!results.length) throw new Error(`Anime "${titlesToSearch[0]}" tidak ditemukan`);

  const scored = results.map(r => ({
    ...r,
    score: (typeof anilistData === 'object') ? calculateMatchScore(anilistData, r) : 50
  })).sort((a, b) => b.score - a.score);

  console.log(`[AL:episodes] Candidates for "${query}":`, scored.map(s => `${s.id}(${s.score})`).join(', '));
  
  const topScore = scored[0]?.score ?? 0;
  if (topScore < 20) throw new Error(`Tidak ada hasil yang cocok untuk "${query}" di AnimeLovers (skor terbaik: ${topScore})`);
  const minAcceptable = topScore >= 70 ? 70 : 40;
  const candidates = scored.filter(s => s.score >= minAcceptable);
  if (candidates.length === 0) candidates.push(scored[0]);

  for (const candidate of candidates.slice(0, 3)) {
    try {
      const info = await getInfoAnimelovers(candidate.id);
      if (!info.episodes || info.episodes.length === 0) continue;
      return {
        animeId: candidate.id,
        animeTitle: info.title,
        totalEpisodes: info.episodes.length,
        // Normalisasi episodeNumber: Movie/OVA/Special → 1, sisanya pakai Number()
        episodes: info.episodes.map(ep => {
          const raw = ep.episodeNumber;
          const num = parseFloat(raw);
          return { number: isNaN(num) ? 1 : num, id: ep.id, label: isNaN(num) ? String(raw) : undefined };
        }).sort((a, b) => a.number - b.number)
      };
    } catch (err) {
      console.warn(`[AL:episodes] Error for "${candidate.id}":`, err.message);
    }
  }
  throw new Error(`Episode list tidak ditemukan untuk "${query}"`);
}
