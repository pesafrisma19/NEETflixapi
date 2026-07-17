import axios from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';

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
// Integrasi untuk NEETflix API (Mirip dengan animelovers.js)
// ==========================================

export async function getEpisodesByTitle(title) {
  const results = await searchOtakudesu(title);
  if (!results.length) throw new Error(`Anime "${title}" tidak ditemukan di Otakudesu`);

  // Ambil hasil pencarian pertama saja, tanpa logika penggabungan / skor yang rumit
  const bestCandidate = results[0];
  
  const info = await getInfoOtakudesu(bestCandidate.id);
  if (!info.episodes || info.episodes.length === 0) {
    throw new Error(`Episode list tidak ditemukan untuk "${title}" di Otakudesu`);
  }

  // Urutkan berdasarkan episode dari terkecil ke terbesar
  const uniqueEpisodes = info.episodes
    .map(ep => ({ number: ep.episodeNumber, id: ep.id }))
    .sort((a, b) => Number(a.number) - Number(b.number));

  return {
    animeId: bestCandidate.id,
    animeTitle: info.title,
    totalEpisodes: uniqueEpisodes.length,
    episodes: uniqueEpisodes
  };
}

export async function getEpisodeStreamByTitle(title, epNum) {
  const results = await searchOtakudesu(title);
  if (!results.length) throw new Error(`Anime "${title}" tidak ditemukan di Otakudesu`);

  const scored = results.slice(0, 8).map(r => ({
    ...r,
    score: titleSimilarity(title, r.title || r.id || '')
  })).sort((a, b) => b.score - a.score);

  console.log(`[OD:stream] Candidates for "${title}":`, scored.map(s => `${s.id}(${s.score})`).join(', '));

  let lastError = null;

  for (const candidate of scored) {
    if (candidate.score < 0.5) continue;
    try {
      const info = await getInfoOtakudesu(candidate.id);
      if (!info.episodes || info.episodes.length === 0) continue;

      const targetEp = info.episodes.find(ep => String(ep.episodeNumber) === String(epNum));
      if (!targetEp) {
        lastError = `Episode ${epNum} tidak ada di "${candidate.id}"`;
        continue;
      }

      console.log(`[OD:stream] ✅ Found at "${candidate.id}" episode ${epNum}`);

      const stream = await getStreamOtakudesu(targetEp.id);
      return {
        animeId: candidate.id,
        animeTitle: info.title,
        episodeId: targetEp.id,
        sources: stream.sources
      };
    } catch (err) {
      lastError = err.message;
      continue;
    }
  }

  throw new Error(lastError || `Episode ${epNum} tidak ditemukan untuk "${title}" di semua kandidat Otakudesu`);
}
