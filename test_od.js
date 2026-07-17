import axios from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';

axios.get('https://otakudesu.blog/?s=One+Piece&post_type=anime', {
  httpsAgent: new https.Agent({ rejectUnauthorized: false })
}).then(res => {
  const $ = cheerio.load(res.data);
  $('.chizu li').each((i, el) => {
    console.log($(el).find('h2').text().trim());
  });
}).catch(console.error);
