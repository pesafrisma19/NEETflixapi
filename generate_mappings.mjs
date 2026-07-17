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
  let allAnimes = [];
  let page = 1;
  const perPage = 100;
  
  while (true) {
    try {
      const url = `https://apps.animekita.org/api/v1.2.5/search.php?keyword=a&page=${page}&per_page=${perPage}`;
      const res = await axios.get(url, { headers: HEADERS });
      const json = res.data;
      const items = json.data?.[0]?.result || [];
      
      if (items.length === 0) break;
      allAnimes.push(...items);
      process.stdout.write(`\r- Menarik Halaman ${page} (Total sementara: ${allAnimes.length})`);
      
      if (items.length < perPage) break;
      page++;
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      console.error(`\nGagal mengambil halaman ${page}:`, e.message);
      break;
    }
  }
  console.log('\nSelesai menarik daftar anime.');
  return allAnimes;
}

// FUNGSI SKORING PINTAR (Mencegah Salah Season/Tahun/Format)
function calculateMatchScore(anilistData, candidate) {
  let score = 0;
  
  // 1. TITLE MATCH (Max 40)
  const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim();
  const cTitle = normalize(candidate.judul);
  
  const aTitles = [];
  if (anilistData.title.romaji) aTitles.push(anilistData.title.romaji);
  if (anilistData.title.english) aTitles.push(anilistData.title.english);
  if (anilistData.title.native) aTitles.push(anilistData.title.native);
  
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
    const overlap = cWords.filter(w => qWords.has(w)).length;
    const s = Math.round((overlap / Math.max(qWords.size, 1)) * 30);
    if (s > bestTitleScore) bestTitleScore = s;
  }
  score += bestTitleScore;

  // Penalti Season (Penting untuk akurasi 100%)
  const seasonPattern = /\b(s\d+|season\s*\d+|part\s*\d+|[ivx]{2,}|\d+(st|nd|rd|th)\s*(season|part)|ii|iii|iv)\b/gi;
  const qSeasons = (aTitles.join(' ').match(seasonPattern) || []).map(s => s.toLowerCase());
  const cSeasons = (candidate.judul?.match(seasonPattern) || []).map(s => s.toLowerCase());
  if (qSeasons.length > 0 && cSeasons.length === 0) score -= 20;
  if (qSeasons.length === 0 && cSeasons.length > 0) score -= 30;

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
        score -= 30; // Beda tahun jauh = Diskualifikasi
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

  // 4. STATUS MATCH (Max 5)
  if (anilistData.status && candidate.status) {
    const isAOngoing = anilistData.status === 'RELEASING';
    const isCOngoing = candidate.status.toLowerCase() === 'ongoing';
    if (isAOngoing === isCOngoing) score += 5;
  }

  // 5. TOTAL EPISODES (Max 10)
  if (anilistData.episodes && candidate.total_episode) {
    if (parseInt(anilistData.episodes) === parseInt(candidate.total_episode)) {
      score += 10;
    }
  }

  // 6. STUDIO MATCH (Max 10)
  if (anilistData.studios?.nodes?.length > 0 && candidate.studio) {
    const cStudio = normalize(candidate.studio);
    const hasStudioMatch = anilistData.studios.nodes.some(st => {
      const aStudio = normalize(st.name);
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

  return Math.min(Math.max(score, 0), 100);
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
    
    // Jangan hapus season dari pencarian agar AniList bisa memberi hasil spesifik
    const cleanTitles = batch.map(item => item.judul.replace(/\s*\(\d{4}\)\s*/g, '').trim());
    
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
