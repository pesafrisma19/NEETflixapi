const axios = require('axios');
const cheerio = require('cheerio');

axios.get('https://otakudesu.blog/episode/wpoiec-episode-116-sub-indo/', {headers: {'User-Agent': 'Mozilla/5.0'}})
  .then(r => {
    const $ = cheerio.load(r.data);
    $('.mirrorstream ul li a').each((i, el) => {
      console.log($(el).attr('data-content'));
    });
  }).catch(console.error);
