import axios from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function test() {
  const url = 'https://otakudesu.blog/anime/1piece-sub-indo/';
  const res = await axios.get(url, {
    httpsAgent: agent,
    headers: {
      'User-Agent': 'Mozilla/5.0'
    }
  });
  const $ = cheerio.load(res.data);
  const infozingle = $('.venser .fotoanime .infozin .infozingle p').toArray().map(el => $(el).text().trim());
  const synopsis = $('.venser .fotoanime .sinopc p').toArray().map(el => $(el).text().trim()).join('\n');
  const image = $('.venser .fotoanime img').attr('src');
  
  console.log('Image:', image);
  console.log('Infozingle:', infozingle);
  console.log('Synopsis:', synopsis);
}
test();
