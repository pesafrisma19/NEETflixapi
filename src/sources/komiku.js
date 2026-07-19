import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://komiku.org';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
  'Referer': 'https://komiku.org/'
};

const cleanUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return 'https:' + url;
  return BASE_URL + url;
};

const extractId = (url) => {
  if (!url) return '';
  const match = url.match(/\/manga\/([^\/]+)/);
  return match ? match[1] : url.split('/').filter(Boolean).pop();
};

export async function getLatestComics(page = 1) {
  try {
    const url = page === 1 ? `${BASE_URL}/` : `${BASE_URL}/page/${page}/`;
    const res = await axios.get(url, { headers: HEADERS });
    const $ = cheerio.load(res.data);
    const comicsMap = {};

    $('a[href*="/manga/"]').each((i, el) => {
      const href = $(el).attr('href');
      if (!href || href.includes('/category/') || href.includes('/genre/')) return;

      const id = extractId(href);
      if (!comicsMap[id]) comicsMap[id] = { id, endpoint: href };

      const title = $(el).attr('title') || $(el).text().trim();
      if (title && title.length > 2) {
        comicsMap[id].title = title.replace('Baca Komik ', '').replace('Baca ', '').trim();
      }

      let imgEl = $(el).find('img');
      if (imgEl.length === 0) imgEl = $(el).parent().parent().find('img');
      let image = imgEl.attr('data-src') || imgEl.attr('src');
      
      if (image && !image.includes('jp.png') && !image.includes('kr.png')) {
        comicsMap[id].image = cleanUrl(image);
      }
    });

    return Object.values(comicsMap).filter(c => c.title && c.image);
  } catch (error) {
    console.error("Error fetching getLatestComics:", error.message);
    throw new Error("Gagal mengambil daftar komik terbaru");
  }
}

export async function searchComics(query, page = 1) {
  try {
    const searchBase = 'https://api.komiku.org';
    const url = page === 1 
      ? `${searchBase}/?post_type=manga&s=${encodeURIComponent(query)}` 
      : `${searchBase}/page/${page}/?post_type=manga&s=${encodeURIComponent(query)}`;
    const res = await axios.get(url, { headers: HEADERS });
    const $ = cheerio.load(res.data);
    const comicsMap = {};

    $('a[href*="/manga/"]').each((i, el) => {
      const href = $(el).attr('href');
      if (!href || href.includes('/genre/')) return;
      
      const id = extractId(href);
      if (!comicsMap[id]) comicsMap[id] = { id, endpoint: href };

      const title = $(el).attr('title') || $(el).text().trim();
      if (title && title.length > 2) {
        comicsMap[id].title = title.replace('Baca Komik ', '').replace('Baca ', '').trim();
      }

      let imgEl = $(el).find('img');
      if (imgEl.length === 0) imgEl = $(el).parent().parent().find('img');
      let image = imgEl.attr('data-src') || imgEl.attr('src');
      
      if (image && !image.includes('jp.png') && !image.includes('kr.png')) {
        comicsMap[id].image = cleanUrl(image);
      }
    });

    return Object.values(comicsMap).filter(c => c.title && c.image);
  } catch (error) {
    console.error("Error fetching searchComics:", error.message);
    throw new Error("Gagal mencari komik");
  }
}

export async function getComicInfo(id) {
  try {
    const url = `${BASE_URL}/manga/${id}/`;
    const res = await axios.get(url, { headers: HEADERS });
    const $ = cheerio.load(res.data);

    let title = $('h1').text().trim();
    if (!title) title = id.replace(/-/g, ' ');
    
    let imgEl = $('.thumb img, .imghalf img, img.wp-post-image');
    if (imgEl.length === 0) imgEl = $('img');
    
    let image = '';
    imgEl.each((i, el) => {
        const src = $(el).attr('data-src') || $(el).attr('src');
        if (src && !src.includes('jp.png') && !src.includes('kr.png') && !src.includes('cn.png') && !src.includes('lazy.jpg') && !src.includes('google.svg') && !src.includes('gravatar')) {
            image = cleanUrl(src);
            return false; // break loop
        }
    });
    
    let synopsis = '';
    $('p').each((i, el) => {
        const text = $(el).text().trim();
        if (text.length > 50 && !text.includes('Baca komik')) {
            synopsis += text + ' ';
        }
    });

    // Extract metadata from table
    let author = "Unknown";
    let status = "Unknown";
    let type = "Manga";
    let rating = "";
    
    $('table tbody tr, table tr').each((i, el) => {
        const key = $(el).find('td').eq(0).text().trim() || $(el).find('th').text().trim();
        const val = $(el).find('td').eq(1).text().trim() || $(el).text().replace(key, '').trim();
        const lowerKey = key.toLowerCase();
        
        if (lowerKey.includes('author') || lowerKey.includes('pengarang')) author = val;
        if (lowerKey.includes('status')) status = val;
        if (lowerKey.includes('tipe') || lowerKey.includes('type')) type = val;
        if (lowerKey.includes('rating') || lowerKey.includes('skor')) rating = val;
    });

    // Extract genres
    const genres = [];
    $('.genre-info a, .seriestugenre a, a[href*="/genre/"]').each((i, el) => {
        const g = $(el).text().trim();
        if (g && !genres.includes(g)) genres.push(g);
    });

    const chapters = [];
    $('a[href*="-chapter-"], a[href*="-ch-"]').each((i, el) => {
      const href = $(el).attr('href');
      const chapTitle = $(el).text().trim();
      const chapId = href.split('/').filter(Boolean).pop(); 
      
      if (!chapters.find(c => c.id === chapId) && chapTitle.match(/\d+/)) {
        chapters.push({
          id: chapId,
          title: chapTitle,
          number: parseFloat(chapTitle.match(/(\d+(\.\d+)?)/)?.[0] || i + 1),
          endpoint: href
        });
      }
    });

    return {
      id,
      title,
      image,
      author,
      status,
      type,
      rating,
      genres,
      synopsis: synopsis.trim() || 'Sinopsis belum tersedia.',
      chapters: chapters.sort((a, b) => b.number - a.number)
    };
  } catch (error) {
    console.error("Error fetching getComicInfo:", error.message);
    throw new Error("Gagal mengambil detail komik");
  }
}

export async function getComicChapter(chapterId) {
  try {
    const url = `${BASE_URL}/${chapterId}/`;
    const res = await axios.get(url, { headers: HEADERS });
    const $ = cheerio.load(res.data);
    
    let images = [];
    $('#readerarea img, .reader-area img, .main-reading-area img').each((i, el) => {
      const src = $(el).attr('data-src') || $(el).attr('src');
      if (src) images.push(cleanUrl(src));
    });

    if (images.length === 0) {
      $('img').each((i, el) => {
        const src = $(el).attr('data-src') || $(el).attr('src');
        const alt = $(el).attr('alt') || '';
        if (src && (alt.toLowerCase().includes('chapter') || src.includes('/uploads/'))) {
          images.push(cleanUrl(src));
        }
      });
    }

    // Filter out irrelevant images such as weekly rank thumbnails, banners, etc.
    images = images.filter(src => {
      const urlLower = src.toLowerCase();
      if (urlLower.includes('thumbnail.komiku.org')) return false;
      if (urlLower.includes('resize=')) return false;
      if (urlLower.includes('manga_img_horizontal')) return false;
      if (urlLower.includes('loading.gif')) return false;
      return true;
    });

    return {
      id: chapterId,
      images
    };
  } catch (error) {
    console.error(`Error in getComicChapter: ${error.message}`);
    throw new Error('Gagal mengambil panel komik');
  }
}

export async function getProxyImage(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).send("Parameter 'url' wajib diisi");
  
  try {
    const response = await axios.get(url, {
      responseType: 'stream',
      headers: {
        'Referer': 'https://komiku.org/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
      }
    });
    
    if (response.headers['content-type']) {
      res.set('Content-Type', response.headers['content-type']);
    }
    res.set('Cache-Control', 'public, max-age=31536000');
    response.data.pipe(res);
  } catch (error) {
    console.error(`Error in proxy image: ${error.message}`);
    res.status(500).send("Gagal mengambil gambar");
  }
}
