import lk21 from './src/sources/lk21.js';

async function run() {
    console.log("=== GET HOME DATA ===");
    const home = await lk21.getHomeData();
    console.log(`Terbaru: ${home.data.filmTerbaru.length}, Unggulan: ${home.data.seriesUnggulan.length}`);
    
    console.log("\n=== SEARCH 'SPIDER-MAN' ===");
    const search = await lk21.searchMovies('spider-man');
    if (search.status === "success") {
        console.log(`Found: ${search.data.length}`);
        console.log(search.data.slice(0, 2));
    } else {
        console.log("Search error:", search);
    }

    console.log("\n=== GET DETAILS ===");
    const id = home.data.seriesUnggulan[0].id;
    console.log(`Fetching details for: ${id}`);
    const detail = await lk21.getMovieDetails(id);
    console.log(`Title: ${detail.data.title}`);
    console.log(`Episodes: ${detail.data.episodes.length}`);
    
    if (detail.data.episodes.length > 0) {
        console.log("\n=== GET STREAM ===");
        const epId = detail.data.episodes[0].id;
        console.log(`Fetching stream for: ${epId}`);
        const stream = await lk21.getMovieStream(epId);
        console.log(`Iframe: ${stream.data.iframe}`);
    } else if (detail.data.iframe) {
        console.log(`Iframe: ${detail.data.iframe}`);
    } else {
        console.log(`No iframe found.`);
    }
}
run();
