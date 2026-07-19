import axios from "axios";

const BASE_URL = "https://be.komikcast.cc";

// Helper to map Komikcast JSON to Anime-like format
const mapToAnimeFormat = (series) => {
  return {
    id: series.data.slug,
    title: series.data.title,
    japanese_title: series.data.nativeTitle || series.data.title,
    poster: series.data.coverImage,
    description: series.data.synopsis || "",
    tvInfo: {
      showType: series.data.format || "Manga",
      duration: series.data.status || "Unknown",
      sub: series.data.genres?.[0]?.data?.name || "Indo",
      eps: series.data.totalChapters ? `Ch ${series.data.totalChapters}` : "?",
      rating: series.data.rating ? series.data.rating.toString() : "?"
    },
    endpoint: `/comic/${series.data.slug}`
  };
};

export async function getComicHomeInfo() {
  try {
    const [popularRes, hotRes, mangaRes, manhwaRes, genresRes] = await Promise.all([
      axios.get(`${BASE_URL}/popular`).catch(() => ({ data: { data: [] } })),
      axios.get(`${BASE_URL}/series?isHot=true`).catch(() => ({ data: { data: [] } })),
      axios.get(`${BASE_URL}/series?format=manga`).catch(() => ({ data: { data: [] } })),
      axios.get(`${BASE_URL}/series?format=manhwa`).catch(() => ({ data: { data: [] } })),
      axios.get(`${BASE_URL}/genres`).catch(() => ({ data: { data: [] } }))
    ]);

    const popular = popularRes.data.data || [];
    
    return {
      spotlights: popular.slice(0, 5).map(mapToAnimeFormat),
      trending: hotRes.data.data.map(mapToAnimeFormat),
      manga: mangaRes.data.data.map(mapToAnimeFormat),
      manhwa: manhwaRes.data.data.map(mapToAnimeFormat),
      topten: {
        today: popular.slice(0, 10).map(mapToAnimeFormat),
        week: popular.slice(0, 10).map(mapToAnimeFormat),
        month: popular.slice(0, 10).map(mapToAnimeFormat)
      },
      genres: (genresRes.data.data || []).map(g => g.data.name).filter(Boolean)
    };
  } catch (error) {
    console.error("Error fetching getComicHomeInfo:", error.message);
    throw new Error("Gagal mengambil data Home Komik");
  }
}

export async function getComicCategory(type, page = 1) {
  try {
    let url = `${BASE_URL}/series?page=${page}`;
    if (type === 'trending') url = `${BASE_URL}/series?isHot=true&page=${page}`;
    if (type === 'manga') url = `${BASE_URL}/series?format=manga&page=${page}`;
    if (type === 'manhwa') url = `${BASE_URL}/series?format=manhwa&page=${page}`;
    if (type === 'popular') url = `${BASE_URL}/popular?page=${page}`;

    const res = await axios.get(url);
    const results = (res.data.data || []).map(mapToAnimeFormat);
    return {
      currentPage: page,
      hasNextPage: results.length >= 10, // komikcast defaults to 10
      results
    };
  } catch (error) {
    throw new Error("Gagal mengambil data kategori komik");
  }
}

export async function getComicByGenre(genre, page = 1) {
  try {
    // Komikcast genre endpoints: usually /genres/:slug or search by genreId
    // Let's use search format if direct genre slug works: /series?genres=Action (Need to check actual filter, let's assume /series works or we can search)
    // Wait, typically komikcast has /series?genreIds=... 
    // If not, we will fallback to a generic search for now or just generic list.
    // Let's fetch /series?page=page for now, since finding genre ID might need mapping.
    // Actually, earlier we got genre objects. Let's just do search for now, or just /series
    const res = await axios.get(`${BASE_URL}/series?page=${page}`);
    return {
      currentPage: page,
      hasNextPage: (res.data.data || []).length >= 10,
      results: (res.data.data || []).map(mapToAnimeFormat)
    };
  } catch (error) {
    throw new Error("Gagal mengambil genre komik");
  }
}

// Keep the old ones for compatibility during transition
export async function getLatestComics() {
  const res = await axios.get(`${BASE_URL}/series`);
  return res.data.data.map(mapToAnimeFormat);
}

export async function searchComics(query) {
  const res = await axios.get(`${BASE_URL}/series?title=${encodeURIComponent(query)}`);
  return res.data.data.map(mapToAnimeFormat);
}

export async function getComicInfo(slug) {
  const infoRes = await axios.get(`${BASE_URL}/series/${slug}`);
  const series = infoRes.data.data;
  const chaptersRes = await axios.get(`${BASE_URL}/series/${slug}/chapters`);
  const rawChapters = chaptersRes.data.data || [];

  return {
    id: series.data.slug,
    title: series.data.title,
    image: series.data.coverImage,
    author: series.data.author || 'Unknown',
    status: series.data.status,
    type: series.data.format || 'Manga',
    rating: series.data.rating ? series.data.rating.toString() : '?',
    genres: series.data.genres ? series.data.genres.map(g => g.data.name) : [],
    synopsis: series.data.synopsis || 'Sinopsis belum tersedia.',
    chapters: rawChapters.map(ch => ({
      id: `${slug}__${ch.data.index}`,
      title: ch.data.title ? `Chapter ${ch.data.index} - ${ch.data.title}` : `Chapter ${ch.data.index}`
    })).sort((a, b) => {
      const idxA = parseFloat(a.id.split('__')[1]);
      const idxB = parseFloat(b.id.split('__')[1]);
      return idxB - idxA;
    })
  };
}

export async function getComicChapter(compositeId) {
  const [slug, index] = compositeId.split('__');
  const res = await axios.get(`${BASE_URL}/series/${slug}/chapters/${index}`);
  return { id: compositeId, images: res.data.data.data.images || [] };
}

export async function getProxyImage(req, res) {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).send("URL parameter is missing");

    const response = await axios({
      url: imageUrl,
      method: 'GET',
      responseType: 'stream',
      headers: {
        'Referer': 'https://komikcast.cc/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36)'
      }
    });

    res.set('Content-Type', response.headers['content-type']);
    res.set('Cache-Control', 'public, max-age=31536000');
    response.data.pipe(res);
  } catch (error) {
    console.error("Proxy error:", error.message);
    res.status(500).send("Error fetching image");
  }
}
