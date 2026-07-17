import axios from 'axios';

async function test() {
  try {
    const res = await axios.post('http://localhost:4444/api/animelovers/episodes-by-title', {
      titles: ['One Piece'],
      year: 1999,
      format: 'TV'
    });
    console.log("Success:", res.data);
  } catch (err) {
    console.error("Error:", err.response?.status);
    console.error("Data:", err.response?.data);
  }
}
test();
