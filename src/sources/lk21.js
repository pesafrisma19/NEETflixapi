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
        const url = `https://gudangvape.com/search.php?s=${encodeURIComponent(keyword)}&page=${page}`;
        const { data } = await axios.get(url, { 
            headers: {
                ...getHeaders(),
                "Origin": LK21_BASE_URL,
                "Referer": LK21_BASE_URL + "/"
            }, 
            httpsAgent: agent 
        });
        
        const items = [];
        const seen = new Set();
        
        if (data && data.data && Array.isArray(data.data)) {
            data.data.forEach(item => {
                const id = item.slug;
                if (id && !seen.has(id)) {
                    seen.add(id);
                    items.push({
                        id: id,
                        title: item.title,
                        image: item.poster ? `https://poster.showcdnx.com/wp-content/uploads/${item.poster}` : null,
                        rating: item.rating ? item.rating.toString() : null,
                        episode: item.type === 'series' && item.episode ? `EPS ${item.episode}` : null
                    });
                }
            });
        }
        
        return {
            status: "success",
            data: items
        };
    } catch (error) {
        console.error("Error scraping LK21 Search:", error.message);
        return { status: "error", message: error.message };
    }
};

const getCategory = async (type, page = 1) => {
    try {
        let typePath = type;
        if (type === 'release') typePath = 'latest';
        else if (type === 'populer' || type === 'latest-series' || type === 'top-series-today') typePath = type;
        else if (!type.includes('/')) {
            // Assume it's a genre if no path is specified
            typePath = `genre/${type}`;
        }
        
        const url = page > 1 ? `${LK21_BASE_URL}/${typePath}/page/${page}/` : `${LK21_BASE_URL}/${typePath}/`;
        const { data } = await axios.get(url, { headers: getHeaders(), httpsAgent: agent });
        const $ = cheerio.load(data);
        
        const items = [];
        const seen = new Set();
        
        $('.search-item, .grid-archive .item, article').each((i, el) => {
            let title = $(el).find('a').attr('title');
            if (!title) title = $(el).find('.poster-title, h2, h3, h4').first().text().trim();
            let link = $(el).find('a').attr('href');
            let img = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');
            let rating = $(el).find('.rating').text().trim() || null;
            let ep = $(el).find('.episode').text().trim() || null;
            
            if (title && link && link.includes('/')) {
                try {
                    const parsedUrl = new URL(link, LK21_BASE_URL);
                    const id = parsedUrl.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
                    if (id && !id.startsWith('genre') && !id.startsWith('year') && !id.startsWith('country')) {
                        if (!seen.has(id)) {
                            seen.add(id);
                            items.push({ 
                                id, 
                                title, 
                                image: img, 
                                rating,
                                episode: ep
                            });
                        }
                    }
                } catch (e) {
                    // Invalid URL
                }
            }
        });

        // Determine if there's a next page by looking for the "Next" pagination link
        const hasNextPage = $('.pagination .next, .nav-previous a').length > 0;
        
        return {
            status: "success",
            data: items,
            hasNextPage
        };
    } catch (error) {
        console.error(`Error scraping LK21 Category (${type}):`, error.message);
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
        
        const genres = [];
        $('.tag-list .tag a[href*="/genre/"]').each((i, el) => {
            genres.push($(el).text().trim());
        });
        
        // Extract episodes if it's a series
        const episodes = [];
        const seenEps = new Set();
        
        // Check if LK21 provides the episode list neatly in JSON format
        const seasonDataText = $('#season-data').html();
        if (seasonDataText) {
            try {
                const seasonData = JSON.parse(seasonDataText);
                // seasonData is an object with season numbers as keys: {"1": [...episodes], "2": [...episodes]}
                for (const seasonNum in seasonData) {
                    const epArray = seasonData[seasonNum];
                    epArray.forEach(ep => {
                        const epId = ep.slug.replace(/https?:\/\/[^\/]+/, '').replace(/^\/+/, '').replace(/\/+$/, '');
                        if (!seenEps.has(epId)) {
                            seenEps.add(epId);
                            // We can format the title to be neat if it's too long, but let's just use their title or fallback
                            const niceTitle = `Season ${ep.s} Episode ${ep.episode_no}`;
                            episodes.push({ id: epId, title: niceTitle });
                        }
                    });
                }
            } catch(e) {
                console.error("Failed to parse season-data", e);
            }
        }
        
        // Fallback for older LK21 formats where episodes are just links
        if (episodes.length === 0) {
            $('a').each((i, el) => {
                const epLink = $(el).attr('href');
                const epTitle = $(el).text().trim();
                
                if (epLink && epTitle && (epTitle.toLowerCase().includes('episode') || epTitle.toLowerCase().match(/ep\s?\d+/) || epLink.toLowerCase().includes('episode') || epLink.toLowerCase().includes('-ep-'))) {
                    const epId = epLink.replace(/https?:\/\/[^\/]+/, '').replace(/^\/+/, '').replace(/\/+$/, '');
                    if (!seenEps.has(epId) && epId.length > 5 && !epId.startsWith('#') && !epId.startsWith('javascript')) {
                        seenEps.add(epId);
                        episodes.push({ id: epId, title: epTitle });
                    }
                }
            });
        }
        
        // Try to find iframe on this page (if it's a movie)
        const iframe = $('iframe').attr('src');
        
        return {
            status: "success",
            data: {
                title,
                synopsis,
                poster,
                genres,
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
    try {
        const detailUrl = `${LK21_BASE_URL}/${id}`;
        let { data } = await axios.get(detailUrl, { headers: getHeaders(), httpsAgent: agent });
        let $ = cheerio.load(data);
        
        const redirectUrl = $('#openNow').attr('href');
        if (redirectUrl) {
            const res = await axios.get(redirectUrl, { headers: getHeaders(), httpsAgent: agent });
            data = res.data;
            $ = cheerio.load(data);
        }
        
        let iframe = $('iframe').attr('src');
        if (iframe && iframe.startsWith('//')) {
            iframe = 'https:' + iframe;
        }

        // Try to bypass ads by fetching the raw .m3u8 from the player's internal API
        let streamUrl = iframe;
        if (iframe && (iframe.includes('playeriframe') || iframe.includes('p2p'))) {
            try {
                const urlParts = iframe.split('/');
                const videoId = urlParts[urlParts.length - 1];
                
                if (videoId) {
                    const payload = 'r=' + encodeURIComponent(new URL(iframe).origin + '/') + '&d=cloud.hownetwork.xyz';
                    const apiRes = await axios.post(`https://cloud.hownetwork.xyz/api2.php?id=${videoId}`, payload, {
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'User-Agent': 'Mozilla/5.0',
                            'Referer': 'https://cloud.hownetwork.xyz/video.php'
                        },
                        httpsAgent: agent
                    });
                    
                    if (apiRes.data && apiRes.data.file) {
                        streamUrl = apiRes.data.file;
                    }
                }
            } catch (err) {
                console.log("Failed to extract raw m3u8, falling back to iframe:", err.message);
            }
        }
        
        return {
            status: "success",
            data: {
                iframe: streamUrl
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
    getCategory,
    getMovieDetails,
    getMovieStream
};
