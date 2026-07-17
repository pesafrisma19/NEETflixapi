
const HEADERS = {
  "accept": "application/json",
  "user-agent": "Dart/3.9 (dart:io)"
};

async function testApi() {
  try {
    // 1. Cari anime
    const searchUrl = 'https://apps.animekita.org/api/v1.2.5/search.php?keyword=one%20piece&page=1&per_page=5';
    const searchRes = await fetch(searchUrl, { headers: HEADERS });
    const searchJson = await searchRes.json();
    console.log("=== HASIL SEARCH ===");
    console.log(JSON.stringify(searchJson.data?.[0]?.result?.[0], null, 2));
    
    // 2. Ambil detail series-nya (misal one-piece)
    if (searchJson.data?.[0]?.result?.[0]?.url) {
      const slug = searchJson.data[0].result[0].url.split('/').filter(Boolean).pop();
      const infoUrl = `https://apps.animekita.org/api/v1.2.5/series.php?url=${slug}`;
      const infoRes = await fetch(infoUrl, { headers: HEADERS });
      
      const infoText = await infoRes.text();
      // Parse aman
      const start = infoText.indexOf('{');
      const startArr = infoText.indexOf('[');
      let idx = Math.min(start !== -1 ? start : 9999, startArr !== -1 ? startArr : 9999);
      const infoJson = JSON.parse(infoText.slice(idx));
      
      console.log("\n=== HASIL DETAIL SERIES ===");
      // Hapus list chapter biar ngga kepanjangan di console
      const detail = infoJson.data?.[0];
      if (detail) {
        detail.chapter = `[Array of ${detail.chapter?.length || 0} episodes]`;
        console.log(JSON.stringify(detail, null, 2));
      }
    }
  } catch(e) {
    console.error("Error:", e);
  }
}

testApi();
