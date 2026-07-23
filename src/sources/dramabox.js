import axios from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';

const agent = new https.Agent({
  rejectUnauthorized: false
});

const DRAMABOX_BASE = "https://www.dramaboxapp.com";

async function getBuildId() {
  try {
    const res = await axios.get(`${DRAMABOX_BASE}/in`, { httpsAgent: agent });
    const html = res.data;
    const match = html.match(/"buildId":"([^"]+)"/);
    if (match && match[1]) {
      return match[1];
    }
  } catch (e) {
    console.error("[Dramabox] Failed to get buildId", e.message);
  }
  return "dramaboxapp_prod_20260703"; // fallback
}

async function fetchNextData(path) {
  const buildId = await getBuildId();
  const url = `${DRAMABOX_BASE}/_next/data/${buildId}/${path}`;
  try {
    const res = await axios.get(url, {
      httpsAgent: agent,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "x-nextjs-data": "1"
      }
    });
    return res.data;
  } catch (e) {
    throw new Error("Gagal mengambil data dari DramaBox: " + url);
  }
}

async function getMoreDataList(endpoint, page) {
  if (page > 1) return []; // The more endpoints only have 1 page of 18 items

  try {
    const json = await fetchNextData(`in/more/${endpoint}.json?position=${endpoint}`);
    const list = json.pageProps?.moreData?.items || [];

    return list.map(item => ({
      id: item.bookId,
      title: item.bookName,
      image: item.cover,
      releaseDate: item.shelfTime ? item.shelfTime.split(" ")[0] : "",
      playCount: 0
    }));
  } catch (e) {
    console.error(`[Dramabox] Error fetching more data for ${endpoint}:`, e.message);
    return [];
  }
}

export async function getRecentDramabox(page = 1) {
  return getMoreDataList("must-sees", page);
}

export async function getMoviesDramabox(page = 1) {
  return getMoreDataList("trending", page);
}

export async function getRecommendationsDramabox(page = 1) {
  return getMoreDataList("hidden-gems", page);
}

export async function searchDramabox(query, page = 1) {
  try {
    const recentList = await getRecentDramabox(1);
    const lowerQuery = query.toLowerCase();
    return recentList.filter(item => item.title.toLowerCase().includes(lowerQuery));
  } catch (e) {
    return [];
  }
}

export async function getGenreDramabox(genreId, page = 1) {
  try {
    const json = await fetchNextData(`in/browse/${genreId}.json?typeTwoId=${genreId}`);
    const records = json.pageProps?.bookList || [];
    return records.map(item => ({
      id: item.bookId,
      title: item.bookName,
      image: item.cover,
      releaseDate: item.chapterCount ? `${item.chapterCount} Eps` : "",
      playCount: item.playCount || 0
    }));
  } catch (e) {
    console.error(`[Dramabox] Error fetching genre ${genreId}:`, e.message);
    return [];
  }
}

export async function getInfoDramabox(id) {
  try {
    const res = await axios.get(`${DRAMABOX_BASE}/in/film/${id}`, {
      httpsAgent: agent,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
    });
    const html = res.data;

    const jsonMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/);
    if (!jsonMatch) throw new Error("Tidak menemukan data Next.js");

    const json = JSON.parse(jsonMatch[1]);
    const item = json.props?.pageProps?.bookInfo || {};
    const chapters = json.props?.pageProps?.chapterList || [];

    return {
      title: item.bookName || ("Detail Drama " + id),
      image: item.cover || "",
      synopsis: item.introduction || "",
      status: "Completed",
      releaseDate: item.shelfTime || "",
      genres: (item.tags || []),
      episodes: chapters.map(ch => ({
        id: `${id}/${ch.id}`,
        title: ch.name,
        episodeNumber: ch.indexStr,
        isPremium: !ch.unlock
      }))
    };
  } catch (e) {
    console.error(`[Dramabox] Get info error for "${id}":`, e.message);
    throw new Error("Gagal mengambil data info dari Dramabox");
  }
}

export async function getStreamDramabox(id) {
  try {
    const [bookId, chapterId] = id.split('/');

    const json = await fetchNextData(`in/episode/${bookId}/${chapterId}.json?bookId=${bookId}&chapterId=${chapterId}`);

    const chapters = json.pageProps?.chapterList || [];
    const currentCh = chapters.find(c => c.id === chapterId);

    if (!currentCh || !currentCh.unlock || !currentCh.m3u8Url) {
      throw new Error("Episode berbayar atau tidak ditemukan");
    }

    return {
      streamUrl: currentCh.m3u8Url,
      iframeSrc: null
    };
  } catch (e) {
    console.error(`[Dramabox] Stream error for "${id}":`, e.message);
    throw new Error("Gagal mengambil stream dari Dramabox");
  }
}
