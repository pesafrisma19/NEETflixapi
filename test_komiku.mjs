import { getLatestComics, searchComics, getComicInfo, getComicChapter } from './src/sources/komiku.js';

async function runTests() {
  console.log("--- Testing getLatestComics ---");
  try {
    const latest = await getLatestComics(1);
    console.log(`Found ${latest.length} latest comics.`);
    if (latest.length > 0) {
      console.log("Sample:", latest[0]);
    }
  } catch(e) {
    console.error(e);
  }

  console.log("\n--- Testing searchComics ---");
  try {
    const search = await searchComics("solo", 1);
    console.log(`Found ${search.length} search results.`);
    if (search.length > 0) {
      console.log("Sample:", search[0]);
    }
  } catch(e) {
    console.error(e);
  }
}

runTests();
