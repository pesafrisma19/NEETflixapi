const axios = require('axios');
const cheerio = require('cheerio');

axios.get('https://komiku.org/the-wandering-knights-survival-manual-chapter-40/')
  .then(res => {
    const $ = cheerio.load(res.data);
    const images = [];
    $('#readerarea img, .reader-area img, .main-reading-area img').each((i, el) => {
      const src = $(el).attr('data-src') || $(el).attr('src');
      if (src) images.push(src);
    });

    if (images.length === 0) {
      $('img').each((i, el) => {
        const src = $(el).attr('data-src') || $(el).attr('src');
        const alt = $(el).attr('alt') || '';
        if (src && (alt.toLowerCase().includes('chapter') || src.includes('/uploads/'))) {
          images.push(src);
        }
      });
    }
    console.log(images.slice(-5));
  })
  .catch(console.error);
