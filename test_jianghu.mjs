import axios from 'axios'; async function test() {
  try {
    const query = \query { Media(search: \\
      A
Portrait
of
Jianghu\\, type: ANIME) { id title { romaji english native } synonyms seasonYear episodes }
  } \; const res = await axios.post('https://graphql.anilist.co', { query }); console.log(JSON.stringify(res.data, null, 2));
} catch (e) { console.error('ERROR:', e.message); } } test();
