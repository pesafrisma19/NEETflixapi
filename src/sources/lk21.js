import axios from "axios";
import * as cheerio from "cheerio";
import https from "https";

const LK21_BASE_URL = process.env.LK21_BASE_URL || "https://tv12.lk21official.cc";

// Agent to bypass some basic protections
const agent = new https.Agent({
    rejectUnauthorized: false
});

const getHeaders = () => ({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
    "Referer": LK21_BASE_URL
});

/**
 * Utility to extract block of items from LK21 homepage based on header
 */
function extractBlock($, headerText) {
    let items = [];
    let seen = new Set();
    let foundHeader = null;
    $('h1, h2, h3, .widget-title, .header h2').each((i, el) => {
        if ($(el).text().trim().toUpperCase() === headerText.toUpperCase()) {
            foundHeader = $(el);
        }
    });

    if (foundHeader) {
        let container = foundHeader.closest('.widget').find('ul.sliders, ul.popular-movie-list, .grid-archive, ul.slider, .slider-wrapper ul');
        if (container.length === 0) container = foundHeader.nextAll('ul, .slider-wrapper, .grid-archive').first();
        if (container.length === 0) container = foundHeader.parent().nextAll('ul, .slider-wrapper, .grid-archive').first();
        
        container.find('li, .item, article').each((i, itemEl) => {
            let title = $(itemEl).find('.poster-title, h2, h3, a[title]').text().trim();
            if (!title) title = $(itemEl).find('a').attr('title');
            let link = $(itemEl).find('a').attr('href');
            let img = $(itemEl).find('img').attr('data-src') || $(itemEl).find('img').attr('src');
            let rating = $(itemEl).find('.rating').text().trim() || null;
            let ep = $(itemEl).find('.episode').text().trim() || null;
            
            if (title && link) {
                // parse ID from link (e.g., /agent-kim-reactivated-2026 -> agent-kim-reactivated-2026)
                const id = link.replace(/^\/+/, '').replace(/\/+$/, '');
                if (!seen.has(id)) {
                    seen.add(id);
                    items.push({ id, title, image: img, rating, episode: ep });
                }
            }
        });
    }
    return items;
}

const getHomeData = async () => {
    try {
        const { data } = await axios.get(LK21_BASE_URL, { headers: getHeaders(), httpsAgent: agent });
        const $ = cheerio.load(data);
        
        return {
            status: "success",
            data: {
                filmTerbaru: extractBlock($, 'Film Terbaru'),
                seriesUnggulan: extractBlock($, 'SERIES UNGGULAN'),
                seriesUpdate: extractBlock($, 'SERIES UPDATE'),
                topBulanIni: extractBlock($, 'TOP BULAN INI')
            }
        };
    } catch (error) {
        console.error("Error scraping LK21 Home:", error.message);
        return { status: "error", message: error.message };
    }
};

const searchMovies = async (keyword, page = 1) => {
    try {
        const url = page > 1 ? `${LK21_BASE_URL}/page/${page}/?s=${encodeURIComponent(keyword)}` : `${LK21_BASE_URL}/?s=${encodeURIComponent(keyword)}`;
        const { data } = await axios.get(url, { headers: getHeaders(), httpsAgent: agent });
        const $ = cheerio.load(data);
        
        const items = [];
        const seen = new Set();
        
        $('.search-item, .grid-archive .item, article').each((i, el) => {
            let title = $(el).find('h2, h3').text().trim() || $(el).find('a').attr('title');
            let link = $(el).find('a').attr('href');
            let img = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');
            let rating = $(el).find('.rating').text().trim() || null;
            
            if (title && link && link.includes('/')) {
                const id = link.replace(LK21_BASE_URL, '').replace(/^\/+/, '').replace(/\/+$/, '');
                // only add if it looks like a valid movie/series link, not a genre or year link
                if (id && !id.startsWith('genre') && !id.startsWith('year') && !id.startsWith('country')) {
                    if (!seen.has(id)) {
                        seen.add(id);
                        items.push({ id, title, image: img, rating });
                    }
                }
            }
        });
        
        return { status: "success", data: items, page };
    } catch (error) {
        console.error("Error scraping LK21 Search:", error.message);
        return { status: "error", message: error.message };
    }
};

const getMovieDetails = async (id) => {
    try {
        const detailUrl = `${LK21_BASE_URL}/${id}`;
        const { data } = await axios.get(detailUrl, { headers: getHeaders(), httpsAgent: agent });
        let $ = cheerio.load(data);
        
        // LK21 might redirect to dramamu.lk21.de or similar
        const redirectUrl = $('#openNow').attr('href');
        let realData = data;
        
        if (redirectUrl) {
            const res = await axios.get(redirectUrl, { headers: getHeaders(), httpsAgent: agent });
            realData = res.data;
            $ = cheerio.load(realData);
        }
        
        const title = $('h1').text().trim();
        const synopsis = $('.synopsis, .content-box').text().trim();
        const poster = $('.poster img, .movie-info img').attr('src') || $('meta[property="og:image"]').attr('content');
        
        // Extract episodes if it's a series
        const episodes = [];
        $('.episode-list li, .btn-group a').each((i, el) => {
            const epLink = $(el).find('a').attr('href') || $(el).attr('href');
            const epTitle = $(el).text().trim();
            if (epLink && epTitle) {
                const epId = epLink.replace(/https?:\/\/[^\/]+/, '').replace(/^\/+/, '').replace(/\/+$/, '');
                episodes.push({ id: epId, title: epTitle });
            }
        });
        
        // Try to find iframe on this page (if it's a movie)
        const iframe = $('iframe').attr('src');
        
        return {
            status: "success",
            data: {
                title,
                synopsis,
                poster,
                isSeries: episodes.length > 0,
                episodes,
                iframe: iframe || null
            }
        };
    } catch (error) {
        console.error("Error scraping LK21 Detail:", error.message);
        return { status: "error", message: error.message };
    }
};

const getMovieStream = async (id) => {
    // This expects the ID of the exact page (e.g. agent-kim-reactivated-season-1-episode-1-2026)
    try {
        // We guess the domain is the redirect domain if it's a series episode
        // For simplicity, let's just search through the known redirect domains or just try the base url
        // Actually, we can fetch from a proxy or the base domain. But since eps are on the redirect domain,
        // it's best to fetch via base URL and follow redirect.
        const detailUrl = `${LK21_BASE_URL}/${id}`;
        let { data } = await axios.get(detailUrl, { headers: getHeaders(), httpsAgent: agent });
        let $ = cheerio.load(data);
        
        const redirectUrl = $('#openNow').attr('href');
        if (redirectUrl) {
            const res = await axios.get(redirectUrl, { headers: getHeaders(), httpsAgent: agent });
            data = res.data;
            $ = cheerio.load(data);
        }
        
        const iframe = $('iframe').attr('src');
        
        return {
            status: "success",
            data: {
                iframe
            }
        };
    } catch (error) {
        console.error("Error scraping LK21 Stream:", error.message);
        return { status: "error", message: error.message };
    }
};

export default {
    getHomeData,
    searchMovies,
    getMovieDetails,
    getMovieStream
};
