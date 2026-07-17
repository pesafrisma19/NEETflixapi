import axios from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function test() {
  const url = 'https://otakudesu.blog/?s=one+piece&post_type=anime';
  const res = await axios.get(url, {
    httpsAgent: agent,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const $ = cheerio.load(res.data);
  const firstResult = $('.chivsrc li').first().html();
  console.log(firstResult);
}
test();
