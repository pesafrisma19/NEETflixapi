const axios = require('axios');
const cheerio = require('cheerio');

axios.get('https://otakudesu.blog/episode/wpoiec-episode-116-sub-indo/', {headers: {'User-Agent': 'Mozilla/5.0'}})
  .then(r => {
    const nonce = r.data.match(/"nonce":"([^"]+)"/);
    console.log("Nonce:", nonce ? nonce[1] : null);
    const action = r.data.match(/"action":"([^"]+)"/);
    console.log("Action:", action ? action[1] : null);
  }).catch(console.error);
