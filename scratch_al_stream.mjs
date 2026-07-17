async function parseSafeJson(text) {
  const start = text.indexOf('{');
  const startArr = text.indexOf('[');
  let idx = -1;
  if (start === -1) idx = startArr;
  else if (startArr === -1) idx = start;
  else idx = Math.min(start, startArr);
  if (idx === -1) throw new Error("Response bukan JSON valid");
  return JSON.parse(text.slice(idx));
}

async function test() {
  const id = "al-24930-0";
  const url = `https://apps.animekita.org/api/v1.2.5/series/episode/data.php?url=${encodeURIComponent(id)}`;
  console.log('Fetching:', url);
  const res = await fetch(url, {
    headers: {
      "accept": "application/json",
      "user-agent": "Dart/3.9 (dart:io)"
    }
  });
  const text = await res.text();
  console.log('Response text:', text.substring(0, 500));
}
test();
