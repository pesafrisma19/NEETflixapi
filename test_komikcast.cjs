const axios = require('axios');

axios.get('https://v3.komikcast.fit/assets/pVuYYKS2.js')
  .then(res => {
    const js = res.data;
    // Look for string literals that might be API paths (e.g. "/api/v1/..." or "v1/..." or "series/")
    const paths = js.match(/(?:\"|\')(\/[a-zA-Z0-9\-\/]+)(?:\"|\')/g);
    if (paths) {
        const uniquePaths = [...new Set(paths.map(p => p.replace(/\"|\'/g, '')))];
        const apiPaths = uniquePaths.filter(p => p.includes('api') || p.includes('komik') || p.includes('series') || p.includes('project'));
        console.log("Possible API paths:");
        console.log(apiPaths);
    }
  })
  .catch(console.error);
