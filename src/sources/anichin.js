import axios from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';

const agent = new https.Agent({
  rejectUnauthorized: false
});

const ANICHIN_BASE = "https://anichin.watch";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
  "Cache-Control": "no-cache"
};

async function fetchHtml(url) {
  const res = await axios.get(url, {
    httpsAgent: agent,
    headers: HEADERS
  });
  return res.data;
}

async function parseList(url) {
  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    
    const items = [];
    $(".listupd .bs").each((i, el) => {
      const title = $(el).find("a").attr("title");
      let href = $(el).find("a").attr("href");
      let image = $(el).find("img").attr("src");
      const eps = $(el).find(".epx").text().trim();
      
      if (title && href) {
        const id = href.replace(ANICHIN_BASE, "").replace("/donghua/", "").replace(/\//g, "");
        items.push({ id, title, image, releaseDate: eps, playCount: 0 });
      }
    });
    return items;
  } catch (e) {
    console.error(`[Anichin] Error parsing list from ${url}:`, e.message);
    return [];
  }
}

export async function searchAnichin(query, page = 1) {
  return parseList(`${ANICHIN_BASE}/page/${page}/?s=${encodeURIComponent(query)}`);
}

export async function getRecentAnichin(page = 1) {
  return parseList(`${ANICHIN_BASE}/donghua/page/${page}/?status=&type=&order=update`);
}

export async function getRecommendationsAnichin(page = 1) {
  return parseList(`${ANICHIN_BASE}/donghua/page/${page}/?status=&type=&order=popular`);
}

export async function getMoviesAnichin(page = 1) {
  return []; // Not supported
}

export async function getGenreAnichin(genreSlug, page = 1) {
  return parseList(`${ANICHIN_BASE}/donghua/page/${page}/?genre%5B0%5D=${genreSlug}&status=&type=&order=update`);
}

export async function getInfoAnichin(id) {
  try {
    const html = await fetchHtml(`${ANICHIN_BASE}/donghua/${id}/`);
    const $ = cheerio.load(html);
    
    const title = $(".infox h1").text().trim();
    const image = $(".thumb img").attr("src");
    const synopsis = $(".entry-content").text().trim();
    
    const genres = [];
    $(".genxed a").each((i, el) => genres.push($(el).text().trim()));
    
    const episodes = [];
    $(".eplister ul li").each((i, el) => {
      const epTitle = $(el).find(".epl-num").text().trim() || $(el).find(".epl-title").text().trim();
      const epHref = $(el).find("a").attr("href");
      if (epHref) {
         episodes.push({
            id: epHref.replace(ANICHIN_BASE, "").replace(/\//g, ""),
            title: epTitle
         });
      }
    });
    
    return {
      title,
      image,
      synopsis,
      genres,
      status: "Ongoing", 
      episodes: episodes.reverse()
    };
  } catch (e) {
    console.error(`[Anichin] Get info error for "${id}":`, e.message);
    throw new Error("Gagal mengambil data dari Anichin");
  }
}

export async function getStreamAnichin(episodeId, clientIp = null) {
  try {
    const html = await fetchHtml(`${ANICHIN_BASE}/${episodeId}/`);
    const $ = cheerio.load(html);
    
    const options = [];
    $("select.mirror option").each((i, el) => {
       const val = $(el).attr("value");
       if (val) {
           const decoded = Buffer.from(val, 'base64').toString('ascii');
           const match = decoded.match(/src="([^"]+)"/);
           if (match) {
               const name = $(el).text().trim() || `Server ${i + 1}`;
               // Exclude the default empty option if it says "Pilih Server"
               if (name && !name.toLowerCase().includes("pilih server") && !name.toLowerCase().includes("pilih kualitas")) {
                   options.push({ name, url: match[1] });
               }
           }
       }
    });
    
    if (options.length > 0) {
        // Prioritize finding anichin.stream server
        let anichinServer = options.find(o => o.url.includes("anichin.stream"));
        // Find OK.ru either directly or wrapped (anichin-player.web.id?ok=...)
        let okruServer = options.find(o => o.url.includes("ok.ru") || o.url.includes("ok=") || o.name.toLowerCase().includes("ok"));
        
        let defaultIframe = anichinServer ? anichinServer.url : (okruServer ? okruServer.url : options[0].url);
        let streamUrl = null;

        // Try to unpack the anichin.stream iframe if we found it
        if (anichinServer) {
            try {
                const iframeRes = await axios.get(anichinServer.url, {
                    httpsAgent: agent,
                    headers: { 'Referer': ANICHIN_BASE + '/' }
                });

                const matchEval = iframeRes.data.match(/eval\(function\(p,a,c,k,e,d\)\{.*?\}\('(.*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'(.*?)'\.split\('\|'\)/);
                if (matchEval) {
                    let p = matchEval[1];
                    const a = parseInt(matchEval[2]);
                    const c = parseInt(matchEval[3]);
                    const k = matchEval[4].split('|');

                    function e(c) {
                        return (c < a ? '' : e(parseInt(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
                    }
                    let d = {};
                    for (let i = 0; i < c; i++) {
                        d[e(i)] = k[i] || e(i);
                    }
                    let unpacked = p.replace(/\b\w+\b/g, function(match) {
                        return d[match] || match;
                    });
                    
                    const matchRaw = unpacked.match(/file\s*:\s*["'](https?:\/\/[^"']+)["']/);
                    if (matchRaw) {
                        streamUrl = matchRaw[1];
                    }
                }
            } catch (err) {
                console.error(`[Anichin] Failed to unpack anichin.stream for "${episodeId}":`, err.message);
            }
        }
        
        if (!streamUrl && okruServer) {
            // Try to extract from OK.ru
            try {
                let okUrl = okruServer.url;
                // If it's wrapped in anichin-player, extract the ok ID
                if (okUrl.includes("ok=")) {
                    const matchId = okUrl.match(/ok=([^&]+)/);
                    if (matchId) {
                        okUrl = `https://ok.ru/videoembed/${matchId[1]}`;
                    }
                }
                const fetchHeaders = { ...HEADERS };
                if (clientIp) {
                    fetchHeaders['X-Forwarded-For'] = clientIp;
                    fetchHeaders['X-Real-IP'] = clientIp;
                }
                const iframeRes = await axios.get(okUrl, { httpsAgent: agent, headers: fetchHeaders });
                const dataOptionsMatch = iframeRes.data.match(/data-options="([^"]+)"/);
                if (dataOptionsMatch) {
                    const dataOptionsRaw = dataOptionsMatch[1].replace(/&quot;/g, '"');
                    const dataOptions = JSON.parse(dataOptionsRaw);
                    const metadata = JSON.parse(dataOptions.flashvars.metadata);
                    
                    if (metadata.videos && metadata.videos.length > 0) {
                        const hdVideo = metadata.videos.find(v => v.name === 'hd') || metadata.videos[metadata.videos.length - 1];
                        streamUrl = hdVideo.url;
                    }
                }
                defaultIframe = okUrl; // update default iframe to point to real ok.ru
            } catch (err) {
                console.error(`[Anichin] Failed to unpack ok.ru for "${episodeId}":`, err.message);
            }
        }

        // Clean up servers array to replace wrapped OK.ru links with direct ones
        options.forEach(server => {
            if (server.url.includes("ok=")) {
                const matchId = server.url.match(/ok=([^&]+)/);
                if (matchId) {
                    server.url = `https://ok.ru/videoembed/${matchId[1]}`;
                }
            }
        });

        return {
            iframeSrc: defaultIframe,
            streamUrl: streamUrl,
            servers: options
        };
    }
    
    throw new Error("No streaming link found");
  } catch (e) {
    console.error(`[Anichin] Stream error for "${episodeId}":`, e.message);
    throw new Error("Gagal mengambil stream dari Anichin");
  }
}
