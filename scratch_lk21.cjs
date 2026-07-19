const axios = require('axios');
const fs = require('fs');
const cheerio = require('cheerio');

async function scrapeEpisode() {
    const epUrl = 'https://dramamu.lk21.de/agent-kim-reactivated-season-1-episode-1-2026';
    const { data } = await axios.get(epUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    fs.writeFileSync('lk21_ep_detail.html', data);
    
    const $ = cheerio.load(data);
    console.log('Player div:', $('.gmr-player').length);
    console.log('Iframes:', $('iframe').map((i,el)=>$(el).attr('src')).get());
    console.log('Tabs:', $('ul.muvipro-player-tabs li a').map((i,el)=>$(el).attr('href')).get());
}
scrapeEpisode();
