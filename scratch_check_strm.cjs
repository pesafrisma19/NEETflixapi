const axios = require('axios');
const cheerio = require('cheerio');

async function checkNextjsData() {
    try {
        const { data: movieData } = await axios.get('https://lk21.strm.web.id/movie/agent-kim-reactivated-2026', {
            validateStatus: () => true,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        const $ = cheerio.load(movieData);
        const nextDataRaw = $('#__NEXT_DATA__').html();
        
        if (nextDataRaw) {
            console.log("Found __NEXT_DATA__!");
            const nextData = JSON.parse(nextDataRaw);
            // Print the first few keys or look for 'stream', 'video', 'iframe'
            const strData = JSON.stringify(nextData);
            if (strData.includes('.mp4')) console.log("Contains .mp4");
            if (strData.includes('.m3u8')) console.log("Contains .m3u8");
            if (strData.includes('iframe')) console.log("Contains iframe");
            
            // Let's dump it to a file so we can inspect it manually if needed
            require('fs').writeFileSync('strm_next_data.json', JSON.stringify(nextData, null, 2));
            console.log("Dumped to strm_next_data.json");
        } else {
            console.log("No __NEXT_DATA__ found. It might be using App Router.");
            // App Router uses a different script tag structure for hydration
            const scripts = [];
            $('script').each((i, el) => {
                const content = $(el).html();
                if (content && (content.includes('.mp4') || content.includes('.m3u8') || content.includes('http'))) {
                    scripts.push(content.substring(0, 200));
                }
            });
            console.log("Scripts containing URLs:", scripts.length);
        }

    } catch (err) {
        console.error("Error:", err.message);
    }
}
checkNextjsData();
