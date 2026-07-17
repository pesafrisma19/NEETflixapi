import axios from "axios";

function unpack(p, a, c, k, e, d) {
  while (c--) {
    if (k[c]) {
      p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
    }
  }
  return p;
}

async function test() {
  try {
    const r = await axios.get("https://odvidhide.com/embed/6xhp3ye7xmra", {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    
    // Extract eval block
    // The format is: eval(function(p,a,c,k,e,d){...}(p,a,c,k,e,d))
    // we want to capture the arguments p, a, c, k, e, d
    const match = r.data.match(/return p}\('(.*?)',(\d+),(\d+),'(.*?)'\.split\('\|'\)/);
    if (match) {
      const p = match[1];
      const a = parseInt(match[2]);
      const c = parseInt(match[3]);
      const k = match[4].split('|');
      
      const unpacked = unpack(p, a, c, k, 0, {});
      console.log("Unpacked length:", unpacked.length);
      
      const mp4Match = unpacked.match(/(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/i);
      const m3u8Match = unpacked.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i) || unpacked.match(/file:\s*["'](.*?)["']/);
      
      if (mp4Match) console.log("MP4:", mp4Match[1]);
      if (m3u8Match) console.log("M3U8:", m3u8Match[1]);
    } else {
      console.log("No match found for unpack.");
      
      // Try direct match in HTML
      const m3u8Direct = r.data.match(/file:\s*["'](.*?)["']/);
      if (m3u8Direct) console.log("Direct:", m3u8Direct[1]);
    }
  } catch(e) {
    console.error(e);
  }
}
test();
