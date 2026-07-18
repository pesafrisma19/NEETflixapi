import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MANUAL_FILE = path.join(__dirname, 'manual_check.json');
const MAPPINGS_FILE = path.join(__dirname, 'mappings.json');

const app = express();
app.use(express.json());

// API AnimeLovers untuk mengambil gambar & info dari slug
const BASE = "https://apps.animekita.org/api/v1.2.5";
const HEADERS = {
  "accept": "application/json",
  "user-agent": "Dart/3.9 (dart:io)"
};

async function getAnimekitaInfo(slug) {
  try {
    const url = `${BASE}/series.php?url=${encodeURIComponent(slug)}`;
    const res = await fetch(url, { headers: HEADERS });
    const text = await res.text();
    const start = text.indexOf('{');
    const startArr = text.indexOf('[');
    let idx = -1;
    if (start === -1) idx = startArr;
    else if (startArr === -1) idx = start;
    else idx = Math.min(start, startArr);
    if (idx === -1) return null;
    
    const json = JSON.parse(text.slice(idx));
    if (json.data && json.data.length > 0) {
      return json.data[0];
    }
  } catch (err) {
    console.error("Gagal fetch Animekita:", err.message);
  }
  return null;
}

app.get('/api/list', (req, res) => {
  if (!fs.existsSync(MANUAL_FILE)) return res.json({ list: [] });
  const manualList = JSON.parse(fs.readFileSync(MANUAL_FILE, 'utf-8'));
  res.json({ list: manualList });
});

app.get('/api/info', async (req, res) => {
  const info = await getAnimekitaInfo(req.query.slug);
  res.json(info ? {
    title: info.judul,
    image: info.cover,
    synopsis: info.sinopsis,
    status: info.status,
    total_episode: info.total_episode || info.chapter?.length || '?'
  } : null);
});

app.post('/api/action', (req, res) => {
  const { action, id, slug } = req.body;
  if (!fs.existsSync(MANUAL_FILE)) return res.json({ success: false });
  
  let manualList = JSON.parse(fs.readFileSync(MANUAL_FILE, 'utf-8'));
  let mappings = {};
  if (fs.existsSync(MAPPINGS_FILE)) {
    mappings = JSON.parse(fs.readFileSync(MAPPINGS_FILE, 'utf-8'));
  }
  if (!mappings.animelovers) mappings.animelovers = {};

  if (action === 'save') {
    mappings.animelovers[String(id)] = slug;
    manualList = manualList.filter(item => item.slug !== slug);
    fs.writeFileSync(MAPPINGS_FILE, JSON.stringify(mappings, null, 2));
    fs.writeFileSync(MANUAL_FILE, JSON.stringify(manualList, null, 2));
  } else if (action === 'delete') {
    manualList = manualList.filter(item => item.slug !== slug);
    fs.writeFileSync(MANUAL_FILE, JSON.stringify(manualList, null, 2));
  }

  res.json({ success: true });
});

app.get('/', (req, res) => {
  res.send(htmlTemplate);
});

const htmlTemplate = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>NEETflix - Advanced Mapping Assistant</title>
  <style>
    :root { --bg: #0f172a; --panel: #1e293b; --text: #f8fafc; --accent: #3b82f6; --accent-hover: #2563eb; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 15px; height: 100vh; display: flex; flex-direction: column; box-sizing: border-box; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; background: var(--panel); padding: 15px 20px; border-radius: 12px; }
    h1 { margin: 0; font-size: 24px; color: var(--accent); }
    .badge { background: #ef4444; padding: 5px 10px; border-radius: 20px; font-weight: bold; }
    
    .container { display: flex; gap: 15px; flex: 1; overflow: hidden; }
    
    /* LEFT PANEL (List Anime) */
    .left-panel { flex: 1; background: var(--panel); padding: 15px; border-radius: 12px; display: flex; flex-direction: column; min-width: 300px; }
    .search-ak { display: flex; gap: 10px; margin-bottom: 15px; }
    .search-ak input { flex: 1; padding: 10px; border-radius: 8px; border: 1px solid #475569; background: #334155; color: white; }
    .list-ak { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
    .item-ak { padding: 10px; background: #334155; border-radius: 8px; cursor: pointer; transition: 0.2s; border: 2px solid transparent; }
    .item-ak:hover { background: #475569; }
    .item-ak.active { border-color: var(--accent); background: #1e3a8a; }
    .item-title { font-weight: bold; font-size: 14px; margin-bottom: 5px; }
    .item-slug { font-size: 11px; color: #94a3b8; }
    
    /* MIDDLE PANEL (Anime Info) */
    .mid-panel { flex: 1; background: var(--panel); padding: 15px; border-radius: 12px; display: flex; flex-direction: column; overflow-y: auto; }
    .animekita-info { text-align: center; }
    .animekita-info img { width: 100%; max-width: 250px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); margin-bottom: 15px; }
    .animekita-text h2 { margin-top: 0; color: #fbbf24; font-size: 20px; }
    .synopsis { font-size: 13px; color: #cbd5e1; line-height: 1.5; margin-top: 15px; text-align: left; }
    .controls { margin-top: auto; display: flex; gap: 10px; padding-top: 20px; }
    .btn { padding: 10px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; color: white; flex: 1; }
    .btn-delete { background: #ef4444; }
    
    /* RIGHT PANEL (AniList) */
    .right-panel { flex: 2; background: var(--panel); padding: 15px; border-radius: 12px; display: flex; flex-direction: column; }
    .search-al { display: flex; gap: 10px; margin-bottom: 15px; }
    .search-al input { flex: 1; padding: 10px; border-radius: 8px; border: 1px solid #475569; background: #334155; color: white; }
    .search-al button { padding: 10px 20px; border-radius: 8px; border: none; background: var(--accent); color: white; font-weight: bold; cursor: pointer; }
    
    .candidates-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; overflow-y: auto; padding-right: 5px; }
    .candidate-card { background: #334155; border-radius: 8px; overflow: hidden; cursor: pointer; transition: 0.2s; border: 2px solid transparent; }
    .candidate-card:hover { transform: translateY(-3px); box-shadow: 0 5px 15px rgba(0,0,0,0.5); border-color: #10b981; }
    .candidate-img-wrap { position: relative; padding-top: 140%; }
    .candidate-img-wrap img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; }
    .candidate-score { position: absolute; top: 5px; right: 5px; background: rgba(0,0,0,0.7); color: white; padding: 3px 6px; border-radius: 4px; font-weight: bold; font-size: 11px; }
    .candidate-info { padding: 8px; }
    .candidate-title { font-weight: bold; font-size: 12px; margin-bottom: 3px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .candidate-meta { font-size: 11px; color: #94a3b8; }
    
    .loading { text-align: center; padding: 20px; color: #94a3b8; }
  </style>
</head>
<body>

<div class="header">
  <h1>✨ NEETflix Advanced Mapping Assistant</h1>
  <div class="badge" id="counter">Tersisa: ...</div>
</div>

<div class="container">
  <!-- KIRI: Daftar Animekita -->
  <div class="left-panel">
    <h3 style="margin-top:0">Daftar Anime (AnimeLovers)</h3>
    <div class="search-ak">
      <input type="text" id="filterAk" placeholder="Cari judul spesifik disini..." oninput="renderList()">
    </div>
    <div class="list-ak" id="akList">
      <div class="loading">Memuat daftar...</div>
    </div>
  </div>
  
  <!-- TENGAH: Info Detail -->
  <div class="mid-panel" id="akDetail">
    <div style="text-align:center; color:#94a3b8; margin-top:50px;">
      Pilih anime dari daftar di sebelah kiri untuk melihat detail.
    </div>
  </div>
  
  <!-- KANAN: Pencarian AniList -->
  <div class="right-panel">
    <h3 style="margin-top:0">Pilih Kandidat dari AniList (Klik gambar)</h3>
    <div class="search-al">
      <input type="text" id="searchAl" placeholder="Cari manual di AniList..." onkeypress="if(event.key === 'Enter') searchAnilist()">
      <button onclick="searchAnilist()">Cari</button>
    </div>
    <div id="anilist-container" class="candidates-grid">
      <div style="text-align:center; color:#94a3b8; grid-column:1/-1; margin-top:50px;">
        Pilih anime dari kiri, atau cari manual.
      </div>
    </div>
  </div>
</div>

<script>
  let fullList = [];
  let currentItem = null;

  async function init() {
    const res = await fetch('/api/list');
    const data = await res.json();
    fullList = data.list || [];
    document.getElementById('counter').innerText = 'Tersisa: ' + fullList.length;
    renderList();
  }
  
  function renderList() {
    const filter = document.getElementById('filterAk').value.toLowerCase();
    const container = document.getElementById('akList');
    
    const filtered = fullList.filter(i => i.judul.toLowerCase().includes(filter));
    
    if(filtered.length === 0) {
      container.innerHTML = '<div style="padding:10px; color:#94a3b8">Tidak ada hasil.</div>';
      return;
    }
    
    // Tampilkan max 100 biar gak lag
    let html = '';
    filtered.slice(0, 100).forEach(item => {
      const isActive = currentItem && currentItem.slug === item.slug ? 'active' : '';
      // Escape petik biar aman di onclick
      const safeSlug = item.slug.replace(/'/g, "\\'");
      html += \`
        <div class="item-ak \${isActive}" onclick="selectItem('\${safeSlug}')">
          <div class="item-title">\${item.judul}</div>
          <div class="item-slug">\${item.slug}</div>
        </div>
      \`;
    });
    container.innerHTML = html;
  }

  async function selectItem(slug) {
    currentItem = fullList.find(i => i.slug === slug);
    renderList(); // Update active class
    
    // Tampilkan loading di detail & anilist
    document.getElementById('akDetail').innerHTML = '<div class="loading">Mengambil detail dari AnimeLovers...</div>';
    document.getElementById('anilist-container').innerHTML = '<div class="loading" style="grid-column:1/-1">Sedang mencari otomatis...</div>';
    
    // Fetch info AnimeLovers
    const res = await fetch('/api/info?slug=' + encodeURIComponent(slug));
    const info = await res.json();
    
    if(info) {
      document.getElementById('akDetail').innerHTML = \`
        <div class="animekita-info">
          <img src="\${info.image || 'https://via.placeholder.com/200x300?text=No+Image'}" alt="Poster">
          <div class="animekita-text">
            <h2>\${info.title}</h2>
            <div style="font-size:12px; color:#94a3b8; margin-bottom:10px;">ID: \${slug}</div>
            <div><span class="badge">\${info.status}</span> <span class="badge" style="background:#3b82f6">\${info.total_episode} Eps</span></div>
            <div class="synopsis">\${info.synopsis || 'Tidak ada sinopsis.'}</div>
          </div>
        </div>
        <div class="controls">
          <button class="btn btn-delete" onclick="doAction('delete')">🗑️ Hapus dari Antrean</button>
        </div>
      \`;
    } else {
      document.getElementById('akDetail').innerHTML = \`
        <div class="animekita-text">
          <h2>\${currentItem.judul}</h2>
          <div>ID: \${slug}</div>
          <div style="color:#ef4444; margin-top:10px;">Gagal memuat detail dari API Animekita.</div>
        </div>
        <div class="controls">
          <button class="btn btn-delete" onclick="doAction('delete')">🗑️ Hapus dari Antrean</button>
        </div>
      \`;
    }
    
    // Auto search di AniList
    let cleanTitle = currentItem.judul.replace(/\\s*(Season|S|Part)\\s*\\d+/gi, '').replace(/subtitle indonesia/gi, '').replace(/sub indo/gi, '').replace(/\\([^)]+\\)/g, '').trim();
    document.getElementById('searchAl').value = cleanTitle;
    searchAnilist(cleanTitle);
  }
  
  async function searchAnilist(query) {
    const search = query || document.getElementById('searchAl').value;
    if (!search) return;
    
    document.getElementById('anilist-container').innerHTML = '<div class="loading" style="grid-column:1/-1">Mencari di AniList...</div>';
    
    const gql = \`
      query ($search: String) {
        Page(page: 1, perPage: 16) {
          media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
            id
            title { romaji english }
            coverImage { large }
            format
            seasonYear
            episodes
            status
          }
        }
      }
    \`;
    
    try {
      const res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ query: gql, variables: { search } })
      });
      
      const data = await res.json();
      const media = data?.data?.Page?.media || [];
      
      if (media.length === 0) {
        document.getElementById('anilist-container').innerHTML = '<div class="loading" style="grid-column:1/-1">❌ Tidak ada hasil. Coba ubah kata kunci pencarian.</div>';
        return;
      }
      
      let html = '';
      media.forEach(m => {
        const title = m.title.english || m.title.romaji;
        const safeTitle = title.replace(/'/g, "\\\\'");
        
        html += \`
          <div class="candidate-card" onclick="saveMapping(\${m.id}, '\${safeTitle}')">
            <div class="candidate-img-wrap">
              <img src="\${m.coverImage.large}" alt="Cover">
              <div class="candidate-score">\${m.seasonYear || '?'}</div>
            </div>
            <div class="candidate-info">
              <div class="candidate-title" title="\${title}">\${title}</div>
              <div class="candidate-meta">\${m.format} • \${m.episodes ? m.episodes + ' Eps' : '? Eps'}</div>
            </div>
          </div>
        \`;
      });
      
      document.getElementById('anilist-container').innerHTML = html;
      
    } catch (e) {
      document.getElementById('anilist-container').innerHTML = '<div class="loading" style="grid-column:1/-1">Error: ' + e.message + '</div>';
    }
  }

  async function saveMapping(anilistId, anilistTitle) {
    if(!currentItem) return;
    if (!confirm(\`PASANGKAN?\\n\\nAnimekita: \${currentItem.judul}\\nAniList: \${anilistTitle}\`)) return;
    
    await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', id: anilistId, slug: currentItem.slug })
    });
    
    removeItemFromList();
  }
  
  async function doAction(action) {
    if(!currentItem) return;
    await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, slug: currentItem.slug })
    });
    removeItemFromList();
  }
  
  function removeItemFromList() {
    fullList = fullList.filter(i => i.slug !== currentItem.slug);
    document.getElementById('counter').innerText = 'Tersisa: ' + fullList.length;
    currentItem = null;
    document.getElementById('akDetail').innerHTML = '<div style="text-align:center; color:#94a3b8; margin-top:50px;">Anime berhasil diproses! Pilih anime lain dari daftar di sebelah kiri.</div>';
    document.getElementById('anilist-container').innerHTML = '';
    renderList();
  }

  init();
</script>
</body>
</html>
`;

app.listen(3000, () => {
  console.log('========================================================');
  console.log('✨ Aplikasi Web Asisten VERSI ADVANCED (Pencarian) berjalan!');
  console.log('👉 REFRESH BROWSER ANDA: http://localhost:3000');
  console.log('========================================================');
});
