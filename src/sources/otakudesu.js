import axios from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';
import { getMapping } from '../utils/mappings.js';

const agent = new https.Agent({
  rejectUnauthorized: false
});

// Fungsi untuk unpack script packed odvidhide.com dll.
function unpack(p, a, c, k, e, d) {
  while (c--) {
    if (k[c]) {
      p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
    }
  }
  return p;
}

const BASE_URL = 'https://otakudesu.blog';

export async function searchOtakudesu(query) {
  try {
    const url = `${BASE_URL}/?s=${encodeURIComponent(query)}&post_type=anime`;
    const res = await axios.get(url, {
      httpsAgent: agent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      }
    });

    const $ = cheerio.load(res.data);
    const results = [];

    $('.chivsrc li').each((i, el) => {
      const title = $(el).find('h2').text().trim();
      const link = $(el).find('h2 a').attr('href');
      const image = $(el).find('img').attr('src');

      if (title && link) {
        // Otakudesu link: https://otakudesu.blog/anime/attack-on-titan-sub-indo/
        const idMatch = link.match(/\/anime\/([^\/]+)/);
        const id = idMatch ? idMatch[1] : null;

        if (id) {
          results.push({
            id,
            title,
            image,
            link
          });
        }
      }
    });

    return results;
  } catch (error) {
    console.error(`[Otakudesu] Search error for "${query}":`, error.message);
    return [];
  }
}

export async function getInfoOtakudesu(id) {
  try {
    const url = `${BASE_URL}/anime/${id}/`;
    const res = await axios.get(url, {
      httpsAgent: agent,
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    const $ = cheerio.load(res.data);

    const title = $('.venser .fotoanime .infozin .infozingle p').first().text().replace('Judul: ', '').trim() || $('.jdlrx h1').text().trim();
    const image = $('.venser .fotoanime img').attr('src');
    const synopsis = $('.venser .fotoanime .sinopc p').toArray().map(el => $(el).text().trim()).join('\n');

    // Parse info details
    const info = {};
    $('.venser .fotoanime .infozin .infozingle p').each((i, el) => {
      const text = $(el).text().trim();
      const splitIndex = text.indexOf(':');
      if (splitIndex > -1) {
        const key = text.substring(0, splitIndex).trim().toLowerCase();
        const value = text.substring(splitIndex + 1).trim();
        info[key] = value;
      }
    });

    const episodes = [];

    $('.episodelist ul li').each((i, el) => {
      const epTitle = $(el).find('span a').text().trim();
      const link = $(el).find('span a').attr('href');
      const date = $(el).find('.zeebr').text().trim();

      if (epTitle && link && !epTitle.toLowerCase().includes('batch')) {
        const epIdMatch = link.match(/\/episode\/([^\/]+)/);
        const epId = epIdMatch ? epIdMatch[1] : null;

        // Extract episode number from title (usually like "Attack on Titan Episode 1 Sub Indo")
        let epNumMatch = epTitle.match(/Episode\s+(\d+)/i);
        let epNum = epNumMatch ? Number(epNumMatch[1]) : (episodes.length + 1);

        if (epId) {
          episodes.push({
            id: epId,
            title: epTitle,
            episodeNumber: epNum,
            date,
            link
          });
        }
      }
    });

    // Biasanya urutannya dari terbaru (descending), balikkan jadi ascending (1,2,3)
    episodes.reverse();

    return {
      id,
      title,
      image,
      synopsis,
      status: info['status'] || '',
      releaseDate: info['tanggal rilis'] || '',
      genres: (info['genre'] || '').split(',').map(s => s.trim()).filter(Boolean),
      type: info['tipe'] || '',
      studio: info['studio'] || '',
      score: info['skor'] || '',
      episodes
    };
  } catch (error) {
    console.error(`[Otakudesu] Get info error for "${id}":`, error.message);
    throw error;
  }
}

export async function getStreamOtakudesu(episodeId) {
  try {
    const url = `${BASE_URL}/episode/${episodeId}/`;
    const res = await axios.get(url, {
      httpsAgent: agent,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const $ = cheerio.load(res.data);
    const sources = [];

    // Mencari link download MP4
    // Struktur biasanya: .download ul li
    $('.download ul li').each((i, el) => {
      const resolution = $(el).find('strong').text().trim(); // misal "Mp4 720p" atau "360p"

      // Ambil link-link yang ada di sebelahnya (Zippyshare, dll)
      $(el).find('a').each((j, aEl) => {
        const providerName = $(aEl).text().trim(); // misal "Zippyshare", "DesuDrive", "Mp4upload"
        const href = $(aEl).attr('href');

        if (href) {
          // Sengaja tidak memasukkan link download (Zippyshare dll) 
          // karena frontend (NEETflix) mengharapkan link murni mp4/iframe,
          // bukan halaman HTML download.
        }
      });
    });

    // Juga ekstrak iframe stream jika ada
    const iframe = $('#lightsVideo iframe').attr('src') || $('.responsive-embed-stream iframe').attr('src');
    if (iframe) {
      try {
        const iframeRes = await axios.get(iframe, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          httpsAgent: agent,
          timeout: 8000
        });

        // Jika iframe adalah desustream, ekstrak mp4 langsung
        if (iframe.includes('desustream.me') || iframe.includes('pdstream')) {
          const iframe$ = cheerio.load(iframeRes.data);
          const mp4Url = iframe$('source').attr('src');
          if (mp4Url) {
            sources.push({ quality: 'auto', provider: 'Otakudesu', url: mp4Url, type: 'mp4' });
          }
        }
        // Jika iframe adalah odvidhide, ekstrak m3u8 dari packed script
        else if (iframe.includes('odvidhide.com') || iframe.includes('vidhide')) {
          let directUrl = null;
          let directType = 'mp4';

          const match = iframeRes.data.match(/return p}\('(.*?)',(\d+),(\d+),'(.*?)'\.split\('\|'\)/);
          if (match) {
            const unpacked = unpack(match[1], parseInt(match[2]), parseInt(match[3]), match[4].split('|'), 0, {});
            const m3u8Match = unpacked.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i) || unpacked.match(/file:\s*["'](.*?)["']/);
            const mp4Match = unpacked.match(/(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/i);

            if (m3u8Match) { directUrl = m3u8Match[1]; directType = 'hls'; }
            else if (mp4Match) { directUrl = mp4Match[1]; directType = 'mp4'; }
          } else {
            const m3u8Direct = iframeRes.data.match(/file:\s*["'](.*?)["']/);
            if (m3u8Direct) { directUrl = m3u8Direct[1]; directType = 'hls'; }
          }

          if (directUrl) {
            sources.push({ quality: 'auto', provider: 'Otakudesu', url: directUrl, type: directType });
          }
        }
      } catch (e) {
        console.log(`[Otakudesu] Failed to extract direct stream from ${iframe}:`, e.message);
      }
    }
    // Ubah format sources agar kompatibel dengan UI (berisi `url` / `server`)
    // Format UI ekspektasi: { quality, url, type, server }
    const formattedSources = sources.map(s => ({
      quality: s.quality === "p" ? "unknown" : s.quality,
      url: s.url,
      type: s.type,
      server: s.provider
    }));

    return { sources: formattedSources };
  } catch (error) {
    console.error(`[Otakudesu] Stream error for "${episodeId}":`, error.message);
    throw error;
  }
}

// ==========================================
// Integrasi untuk NEETflix API
// ==========================================

/**
 * Hitung skor kemiripan AniList ↔ Otakudesu candidate
 * Sama dengan calculateMatchScore di animelovers.js
 */
function calculateMatchScore(anilistData, candidate) {
  let score = 0;
  const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim();
  const cTitle = normalize(candidate.title);

  // 1. TITLE MATCH (Max 40) — Jaccard similarity
  let bestTitleScore = 0;
  for (const t of anilistData.titles || []) {
    if (!t) continue;
    const qTitle = normalize(t);
    if (qTitle === cTitle) { bestTitleScore = 40; break; }
    const qWords = new Set(qTitle.split(' ').filter(w => w.length > 2));
    const cWords = cTitle.split(' ').filter(w => w.length > 2);
    if (qWords.size === 0 && cWords.length === 0) continue;
    const cSet = new Set(cWords);
    const overlap = cWords.filter(w => qWords.has(w)).length;
    const union = new Set([...qWords, ...cSet]).size;
    const s = Math.round((overlap / Math.max(union, 1)) * 30);
    if (s > bestTitleScore) bestTitleScore = s;
  }
  score += bestTitleScore;

  // Season mismatch — bandingkan NOMOR season
  const extractSeasonNum = (text) => {
    if (!text) return null;
    const t = text.toLowerCase();
    let m = t.match(/(?:season\s*)(\d+)/);
    if (m) return parseInt(m[1]);
    m = t.match(/(\d+)(?:st|nd|rd|th)\s*season/);
    if (m) return parseInt(m[1]);
    m = t.match(/part\s*(\d+)/);
    if (m) return parseInt(m[1]);
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
    if (qSeasonNum !== cSeasonNum) score -= 40;
  } else if (qSeasonNum !== null && cSeasonNum === null) {
    score -= 20;
  } else if (qSeasonNum === null && cSeasonNum !== null) {
    score -= 30;
  }

  // 2. YEAR MATCH (Max 20)
  const aYearData = anilistData.year || anilistData.seasonYear;
  if (aYearData && (candidate.releaseDate || candidate.releaseYear)) {
    const cDateStr = candidate.releaseDate || candidate.releaseYear;
    const cYearMatch = String(cDateStr).match(/\\d{4}/);
    if (cYearMatch) {
      const cYear = parseInt(cYearMatch[0], 10);
      const aYear = parseInt(aYearData, 10);
      if (cYear === aYear) score += 20;
      else if (Math.abs(cYear - aYear) === 1) score += 10;
      else score -= 20;
    }
  }

  // 3. FORMAT MATCH (Max 15)
  if (anilistData.format && candidate.type) {
    const aFormat = anilistData.format.toLowerCase();
    const cFormat = candidate.type.toLowerCase();
    if ((aFormat === 'tv' && cFormat === 'tv') || (aFormat === 'movie' && cFormat === 'movie')) {
      score += 15;
    } else if (aFormat !== cFormat && ['tv', 'movie'].includes(aFormat) && ['tv', 'movie'].includes(cFormat)) {
      score -= 30;
    }
  }

  return Math.min(score, 100);
}

/** Bersihkan special chars untuk search engine Otakudesu */
const cleanForSearch = (s) => s.replace(/[^a-z0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim();

/** Build daftar query yang akan dicoba secara berurutan */
function buildSearchQueries(anilistData) {
  const titlesToSearch = (typeof anilistData === 'object' && anilistData.titles)
    ? anilistData.titles.slice(0, 3)
    : [anilistData];
  const queries = [];
  for (const t of titlesToSearch) {
    if (!t) continue;
    queries.push(t);
    const stripped = t.replace(/\s*\(\d{4}\)\s*/g, '').replace(/\s*\(TV\)\s*/gi, '').trim();
    if (stripped !== t && !queries.includes(stripped)) queries.push(stripped);
    const cleaned = cleanForSearch(stripped);
    if (cleaned !== stripped && !queries.includes(cleaned)) queries.push(cleaned);
    const shortQuery = cleaned.split(' ').filter(w => w.length > 1).slice(0, 3).join(' ');
    if (shortQuery.length > 5 && !queries.includes(shortQuery)) queries.push(shortQuery);
  }
  return queries;
}

export async function getEpisodesByTitle(anilistData) {
  const anilistId = typeof anilistData === 'object' ? anilistData.id : null;

  // Cek mapping manual dulu
  if (anilistId) {
    const mappedSlug = getMapping(anilistId, 'otakudesu');
    if (mappedSlug) {
      const info = await getInfoOtakudesu(mappedSlug);
      if (info.episodes && info.episodes.length > 0) {
        return {
          animeId: mappedSlug,
          animeTitle: info.title,
          totalEpisodes: info.episodes.length,
          episodes: info.episodes.map(ep => ({
            number: ep.episodeNumber,
            id: ep.id
          })).sort((a, b) => Number(a.number) - Number(b.number))
        };
      }
    }
  }

  const searchQueries = buildSearchQueries(anilistData);
  let results = [];
  let query = '';
  for (const q of searchQueries) {
    if (!q) continue;
    query = q;
    results = await searchOtakudesu(q);
    if (results.length > 0) break;
  }
  if (!results.length) throw new Error(`Anime "${searchQueries[0]}" tidak ditemukan di Otakudesu`);

  const scored = results.map(r => ({
    ...r,
    score: (typeof anilistData === 'object') ? calculateMatchScore(anilistData, r) : 50
  })).sort((a, b) => b.score - a.score);

  console.log(`[OD:episodes] Candidates for "${query}":`, scored.map(s => `${s.id}(${s.score})`).join(', '));

  const topScore = scored[0]?.score ?? 0;
  if (topScore < 20) throw new Error(`Tidak ada hasil cocok untuk "${query}" di Otakudesu (skor terbaik: ${topScore})`);
  const minAcceptable = topScore >= 70 ? 70 : 40;
  const candidates = scored.filter(s => s.score >= minAcceptable);
  if (candidates.length === 0) candidates.push(scored[0]);

  // GET INFO AND RE-SCORE (Two-pass matching)
  const detailedCandidates = [];
  for (const candidate of candidates.slice(0, 3)) {
    try {
      const info = await getInfoOtakudesu(candidate.id);
      if (!info.episodes || info.episodes.length === 0) continue;

      const finalScore = (typeof anilistData === 'object') ? calculateMatchScore(anilistData, info) : candidate.score;
      detailedCandidates.push({ info, finalScore });
    } catch (err) {
      console.warn(`[OD:episodes] Error for "${candidate.id}":`, err.message);
    }
  }

  if (detailedCandidates.length === 0) {
    throw new Error(`Episode list tidak ditemukan untuk "${query}" di Otakudesu`);
  }

  detailedCandidates.sort((a, b) => b.finalScore - a.finalScore);
  const best = detailedCandidates[0].info;

  return {
    animeId: best.id,
    animeTitle: best.title,
    totalEpisodes: best.episodes.length,
    episodes: best.episodes.map(ep => ({
      number: ep.episodeNumber,
      id: ep.id
    })).sort((a, b) => Number(a.number) - Number(b.number))
  };
}

export async function getEpisodeStreamByTitle(anilistData, epNum) {
  const anilistId = typeof anilistData === 'object' ? anilistData.id : null;

  // Cek mapping manual dulu
  if (anilistId) {
    const mappedSlug = getMapping(anilistId, 'otakudesu');
    if (mappedSlug) {
      const info = await getInfoOtakudesu(mappedSlug);
      if (info.episodes && info.episodes.length > 0) {
        const targetEp = info.episodes.find(ep => String(ep.episodeNumber) === String(epNum));
        if (targetEp) {
          const stream = await getStreamOtakudesu(targetEp.id);
          return { animeId: mappedSlug, animeTitle: info.title, episodeId: targetEp.id, sources: stream.sources };
        }
      }
    }
  }

  const searchQueries = buildSearchQueries(anilistData);
  let results = [];
  let query = '';
  for (const q of searchQueries) {
    if (!q) continue;
    query = q;
    results = await searchOtakudesu(q);
    if (results.length > 0) break;
  }
  if (!results.length) throw new Error(`Anime "${searchQueries[0]}" tidak ditemukan di Otakudesu`);

  const scored = results.map(r => ({
    ...r,
    score: (typeof anilistData === 'object') ? calculateMatchScore(anilistData, r) : 50
  })).sort((a, b) => b.score - a.score);

  console.log(`[OD:stream] Candidates for "${query}":`, scored.map(s => `${s.id}(${s.score})`).join(', '));

  const topScore = scored[0]?.score ?? 0;
  if (topScore < 20) throw new Error(`Tidak ada hasil cocok untuk "${query}" di Otakudesu (skor terbaik: ${topScore})`);
  const minAcceptable = topScore >= 70 ? 70 : 40;
  const candidates = scored.filter(s => s.score >= minAcceptable);
  if (candidates.length === 0) candidates.push(scored[0]);

  // GET INFO AND RE-SCORE (Two-pass matching)
  const detailedCandidates = [];
  for (const candidate of candidates.slice(0, 3)) {
    try {
      const info = await getInfoOtakudesu(candidate.id);
      if (!info.episodes || info.episodes.length === 0) continue;

      const targetEp = info.episodes.find(ep => String(ep.episodeNumber) === String(epNum))
        ?? (String(epNum) === '1' && info.episodes.length === 1 ? info.episodes[0] : null)
        ?? (String(epNum) === '1' ? info.episodes.find(ep => /^(movie|ova|special|film)/i.test(String(ep.episodeNumber))) : null);

      if (!targetEp) continue;

      const finalScore = (typeof anilistData === 'object') ? calculateMatchScore(anilistData, info) : candidate.score;
      detailedCandidates.push({ info, targetEp, finalScore });
    } catch (err) {
      console.warn(`[OD:stream] Error for "${candidate.id}":`, err.message);
    }
  }

  if (detailedCandidates.length === 0) {
    throw new Error(`Episode ${epNum} tidak ditemukan untuk "${query}" di Otakudesu`);
  }

  detailedCandidates.sort((a, b) => b.finalScore - a.finalScore);
  const best = detailedCandidates[0];

  console.log(`[OD:stream] ✅ Found at "${best.info.id}" episode ${epNum} (Final Score: ${best.finalScore})`);
  const stream = await getStreamOtakudesu(best.targetEp.id);
  return { animeId: best.info.id, animeTitle: best.info.title, episodeId: best.targetEp.id, sources: stream.sources };
}
