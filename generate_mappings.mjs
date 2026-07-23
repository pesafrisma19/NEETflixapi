import axios from 'axios';
import fs from 'fs';
import path from 'path';

const MAPPINGS_FILE = path.join(process.cwd(), 'mappings.json');
const MANUAL_CHECK_FILE = path.join(process.cwd(), 'manual_check.json');
const HEADERS = {
  'accept': 'application/json',
  'user-agent': 'Dart/3.9 (dart:io)'
};

async function getAnimekitaList() {
  console.log('Mengambil daftar seluruh anime dari AnimeLovers...');
  const allAnimesMap = new Map();
  // Trik untuk menyedot semua 4000+ anime: cari berdasarkan semua huruf vokal (karena hampir setiap judul punya vokal)
  const keywords = ['a', 'i', 'u', 'e', 'o', ' ']; 
  
  for (const kw of keywords) {
    let page = 1;
    let prevFirstUrl = null;
    while (true) {
      try {
        const keywordUrl = kw === ' ' ? '%20' : kw;
        // PENTING: API Animekita mentok maksimal 20 per halaman, berapapun per_page yang diminta!
        const url = `https://apps.animekita.org/api/v1.2.5/search.php?keyword=${keywordUrl}&page=${page}&per_page=20`;
        const res = await axios.get(url, { headers: HEADERS });
        const items = res.data?.data?.[0]?.result || [];
        
        if (items.length === 0) break;
        
        const prevSize = allAnimesMap.size;
        
        // Simpan ke Map agar tidak ada anime duplikat
        items.forEach(item => allAnimesMap.set(item.url, item));
        process.stdout.write(`\r- Menarik "${kw === ' ' ? 'Spasi' : kw}" Halaman ${page} (Total sementara: ${allAnimesMap.size} anime)`);
        
        // Hentikan jika tidak ada anime baru yang bertambah atau sudah mencapai batas halaman
        const currentFirstUrl = items[0]?.url;
        if (items.length < 20 || currentFirstUrl === prevFirstUrl || allAnimesMap.size === prevSize || page > 30) break;
        prevFirstUrl = currentFirstUrl;
        
        page++;
        await new Promise(r => setTimeout(r, 100)); // Kasih jeda sedikit agar server tidak down
      } catch (e) {
        console.error(`\nGagal mengambil huruf "${kw}" halaman ${page}:`, e.message);
        break;
      }
    }
  }
  
  const allAnimes = Array.from(allAnimesMap.values());
  console.log(`\nSelesai! Berhasil mengumpulkan total ${allAnimes.length} anime unik dari server.`);
  return allAnimes;
}

// FUNGSI SKORING PINTAR (Di-upgrade menggunakan algoritma animelovers.js yang lebih akurat)
function calculateMatchScore(anilistData, candidate) {
  let score = 0;
  const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim();
  const cTitle = normalize(candidate.judul);
  
  const aTitles = [];
  if (anilistData.title.romaji) aTitles.push(anilistData.title.romaji);
  if (anilistData.title.english) aTitles.push(anilistData.title.english);
  if (anilistData.title.native) aTitles.push(anilistData.title.native);
  if (anilistData.synonyms) aTitles.push(...anilistData.synonyms);
  
  // 1. TITLE MATCH (Max 40)
  let bestTitleScore = 0;
  for (const t of aTitles) {
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
    const s = Math.round((overlap / Math.max(union, 1)) * 30); // Jaccard similarity murni
    if (s > bestTitleScore) bestTitleScore = s;
  }
  score += bestTitleScore;

  // Deteksi season mismatch (sangat fatal) — membandingkan NOMOR season
  const extractSeasonNum = (text) => {
    if (!text) return null;
    const t = text.toLowerCase();
    let m = t.match(/(?:s|season\s*)(\d+)/);
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
  for (const t of aTitles) {
    const n = extractSeasonNum(t);
    if (n !== null) { qSeasonNum = n; break; }
  }
  const cSeasonNum = extractSeasonNum(candidate.judul);
  if (qSeasonNum !== null && cSeasonNum !== null) {
    if (qSeasonNum !== cSeasonNum) score -= 40; // Beda nomor season = hampir pasti salah
  } else if (qSeasonNum !== null && cSeasonNum === null) {
    score -= 20;
  } else if (qSeasonNum === null && cSeasonNum !== null) {
    score -= 30;
  }

  // 2. YEAR MATCH (Max 20)
  if (anilistData.seasonYear && candidate.rilis) {
    const cYearMatch = candidate.rilis.match(/\d{4}/);
    if (cYearMatch) {
      const cYear = parseInt(cYearMatch[0], 10);
      const aYear = parseInt(anilistData.seasonYear, 10);
      if (cYear === aYear) {
        score += 20;
      } else if (Math.abs(cYear - aYear) === 1) {
        score += 10;
      } else {
        score -= 20; 
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
      score -= 30;
    }
  }

  // 4. STATUS MATCH (Max 5)
  if (anilistData.status && candidate.status) {
    const isAOngoing = anilistData.status === 'RELEASING';
    const isCOngoing = candidate.status.toLowerCase() === 'ongoing';
    if (isAOngoing === isCOngoing) score += 5;
  }

  // 5. TOTAL EPISODES (Max 10)
  if (anilistData.episodes && candidate.total_episode) {
    const aEps = parseInt(anilistData.episodes);
    const cEps = parseInt(candidate.total_episode);
    if (aEps === cEps) {
      score += 10;
    } else if (Math.abs(aEps - cEps) <= 2) {
      score += 5; // Sedikit beda bisa karena special/recap
    } else {
      score -= 15; // Beda jauh = kemungkinan besar beda series/season
    }
  }

  // 6. STUDIO MATCH (Max 10)
  if (anilistData.studios?.nodes?.length > 0 && candidate.studio) {
    const cStudio = normalize(candidate.studio).replace(/\s/g, '');
    const hasStudioMatch = anilistData.studios.nodes.some(st => {
      const aStudio = normalize(st.name).replace(/\s/g, '');
      return aStudio.includes(cStudio) || cStudio.includes(aStudio);
    });
    if (hasStudioMatch) score += 10;
  }

  // 7. GENRE MATCH (Max 10)
  if (anilistData.genres?.length > 0 && Array.isArray(candidate.genre) && candidate.genre.length > 0) {
    const aGenres = anilistData.genres.map(g => g.toLowerCase());
    const cGenres = candidate.genre.map(g => g.toLowerCase());
    const overlap = cGenres.filter(g => aGenres.includes(g)).length;
    if (overlap >= 2) score += 10;
    else if (overlap === 1) score += 5;
  }

  return Math.min(score, 100); // Bisa negatif untuk membantu filter
}

async function queryAnilistBatch(titles) {
  let query = 'query(';
  let queryBody = '';
  let variables = {};
  
  titles.forEach((title, i) => {
    query += `$s${i}: String, `;
    // Meminta 3 hasil teratas beserta detail Tahun, Format, Episode, Studio, dan Genre
    queryBody += `a${i}: Page(page: 1, perPage: 3) {
      media(search: $s${i}, type: ANIME) {
        id
        title { romaji english native }
        synonyms
        seasonYear
        format
        status
        episodes
        genres
        studios(isMain: true) { nodes { name } }
      }
    }\n`;
    variables[`s${i}`] = title;
  });
  query = query.slice(0, -2) + ') {\n' + queryBody + '}';

  try {
    const res = await axios.post('https://graphql.anilist.co', { query, variables }, { timeout: 10000 });
    return res.data?.data || {};
  } catch (e) {
    if (e.response && e.response.status === 429) {
       console.log(' (Rate Limit AniList, istirahat 10 detik...)');
       await new Promise(r => setTimeout(r, 10000));
       return await queryAnilistBatch(titles);
    }
    return {};
  }
}

async function run() {
  console.log('=== MEMULAI AUTO-MAPPING 100% AKURAT (SMART AI MODE) ===\n');
  
  let existingMappings = {};
  if (fs.existsSync(MAPPINGS_FILE)) {
    existingMappings = JSON.parse(fs.readFileSync(MAPPINGS_FILE, 'utf8'));
  }
  if (!existingMappings.animelovers) existingMappings.animelovers = {};

  let manualCheck = [];
  if (fs.existsSync(MANUAL_CHECK_FILE)) {
    manualCheck = JSON.parse(fs.readFileSync(MANUAL_CHECK_FILE, 'utf8'));
  }

  const mappedSlugs = new Set(Object.values(existingMappings.animelovers));
  const manualSlugs = new Set(manualCheck.map(m => m.slug));

  const allAnimes = await getAnimekitaList();
  
  const targetList = allAnimes.filter(item => {
    const slug = item.url.replace('anime/', '');
    // Jangan proses yang sudah ada di mappings atau sudah ditandai untuk manual check
    return !mappedSlugs.has(slug) && !manualSlugs.has(slug);
  });

  console.log(`\n✅ Ditemukan ${targetList.length} anime BARU yang belum di-mapping (dari total ${allAnimes.length}).\n`);

  if (targetList.length === 0) {
    console.log('Semua anime sudah di-mapping atau masuk daftar manual check. Selesai!');
    return;
  }

  let successCount = 0;
  let manualCount = 0;
  // Kurangi batch size jadi 5 karena query GraphQL sekarang lebih kompleks (nested)
  const batchSize = 5; 
  
  for (let i = 0; i < targetList.length; i += batchSize) {
    const batch = targetList.slice(i, i + batchSize);
    
    // Jangan hapus season dari pencarian, tapi hilangkan karakter spesial (seperti ä, é) karena API AniList sering error
    const cleanTitles = batch.map(item => 
      item.judul
        .replace(/\s*\(\d{4}\)\s*/g, '')
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .trim()
    );
    
    process.stdout.write(`Memproses batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(targetList.length/batchSize)} ... `);
    
    const results = await queryAnilistBatch(cleanTitles);
    
    let batchSuccess = 0;
    let batchManual = 0;

    batch.forEach((item, idx) => {
      const pageData = results[`a${idx}`];
      const candidates = pageData?.media || [];
      const slug = item.url.replace('anime/', '');
      
      let bestMatch = null;
      let highestScore = 0;

      for (const candidate of candidates) {
        const score = calculateMatchScore(candidate, item);
        if (score > highestScore) {
          highestScore = score;
          bestMatch = candidate;
        }
      }

      // SYARAT 100% AKURAT: Skor minimal harus 70
      if (bestMatch && highestScore >= 70) {
        existingMappings.animelovers[String(bestMatch.id)] = slug;
        batchSuccess++;
        successCount++;
      } else {
        // Jika ragu-ragu (skor rendah), simpan ke manual check
        manualCheck.push({
          judul: item.judul,
          slug: slug,
          alasan: bestMatch ? `Skor tertinggi cuma ${highestScore} (Tahun/Season mungkin beda)` : 'Tidak ditemukan di AniList'
        });
        batchManual++;
        manualCount++;
      }
    });
    
    console.log(`Dapat ${batchSuccess} ID (Akurat). ${batchManual} Ragu-ragu.`);
    
    fs.writeFileSync(MAPPINGS_FILE, JSON.stringify(existingMappings, null, 2));
    fs.writeFileSync(MANUAL_CHECK_FILE, JSON.stringify(manualCheck, null, 2));
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log(`\n🎉 SELESAI! Berhasil mapping ${successCount} anime dengan akurasi tinggi.`);
  console.log(`⚠️ Ada ${manualCount} anime yang dimasukkan ke manual_check.json karena datanya meragukan.`);
}

run();
