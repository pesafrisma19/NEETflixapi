import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MANUAL_FILE = path.join(__dirname, 'manual_check.json');
const MAPPINGS_FILE = path.join(__dirname, 'mappings.json');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function fetchAniList(search) {
  const query = `
    query ($search: String) {
      Page(page: 1, perPage: 6) {
        media(search: $search, type: ANIME) {
          id
          title { romaji english native }
          format
          episodes
          seasonYear
          status
        }
      }
    }
  `;
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { search } })
  });
  
  if (!res.ok) {
    if (res.status === 429) {
      console.log("Terkena Rate Limit AniList! Menunggu 5 detik...");
      await new Promise(r => setTimeout(r, 5000));
      return fetchAniList(search); // Coba lagi
    }
    return [];
  }
  const data = await res.json();
  return data.data.Page.media;
}

// Helper membersihkan nama (seperti Season 2, Part 1, dll) untuk pencarian yang lebih baik
function cleanTitleForSearch(title) {
  let cleaned = title.replace(/\s*(Season|S|Part)\s*\d+/gi, '');
  cleaned = cleaned.replace(/subtitle indonesia/gi, '');
  cleaned = cleaned.replace(/sub indo/gi, '');
  cleaned = cleaned.replace(/[^a-zA-Z0-9\s]/g, ' ');
  return cleaned.trim();
}

async function run() {
  if (!fs.existsSync(MANUAL_FILE)) {
    console.log("Hore! File manual_check.json tidak ditemukan, artinya semua sudah beres!");
    process.exit(0);
  }
  
  let manualList = JSON.parse(fs.readFileSync(MANUAL_FILE, 'utf-8'));
  let mappings = {};
  if (fs.existsSync(MAPPINGS_FILE)) {
    mappings = JSON.parse(fs.readFileSync(MAPPINGS_FILE, 'utf-8'));
  }
  if (!mappings.animelovers) mappings.animelovers = {};

  if (manualList.length === 0) {
    console.log("Hore! Tidak ada anime tersisa di manual_check.json. Semua sudah dicek!");
    process.exit(0);
  }

  while (manualList.length > 0) {
    console.clear();
    const item = manualList[0];
    console.log("=========================================================");
    console.log(`Tersisa: ${manualList.length} anime untuk dicek manual`);
    console.log("=========================================================");
    console.log(`Judul Animekita : ${item.judul}`);
    console.log(`Slug / ID       : ${item.slug}`);
    console.log(`Catatan AI      : ${item.alasan}`);
    console.log("=========================================================\n");

    console.log("Sedang mencari di AniList...");
    let candidates = await fetchAniList(cleanTitleForSearch(item.judul));

    // Jika hasil bersih tidak dapat, coba pencarian judul mentah
    if (candidates.length === 0) {
        candidates = await fetchAniList(item.judul);
    }

    let resolved = false;
    while (!resolved) {
      if (candidates.length > 0) {
        console.log("\nKandidat dari AniList:");
        candidates.forEach((c, idx) => {
          const t = c.title.romaji || c.title.english || c.title.native;
          console.log(`[${idx + 1}] ${t} (${c.seasonYear || 'Tahun?'}) - Format: ${c.format} - Eps: ${c.episodes} - Status: ${c.status}`);
          console.log(`    Link: https://anilist.co/anime/${c.id}`);
        });
      } else {
        console.log("\n⚠️ Tidak ada kandidat ditemukan dengan judul ini.");
      }

      console.log("\n============== PILIHAN AKSI ==============");
      if (candidates.length > 0) console.log("[1-6] Pilih nomor kandidat yang benar");
      console.log("[s] Cari ulang dengan mengetik judul lain");
      console.log("[i] Masukkan ID AniList secara manual (ketik angkanya saja)");
      console.log("[d] Hapus anime ini dari antrean (Biarkan saja tak ter-mapping)");
      console.log("[x] Lewati anime ini sementara (taruh di urutan paling belakang)");
      console.log("[q] Simpan dan Keluar");
      console.log("==========================================");

      const ans = (await question("\nPilih aksi: ")).trim().toLowerCase();

      if (ans === 'q') {
        fs.writeFileSync(MANUAL_FILE, JSON.stringify(manualList, null, 2));
        fs.writeFileSync(MAPPINGS_FILE, JSON.stringify(mappings, null, 2));
        console.log("\nBerhasil disimpan! Sampai jumpa lagi.");
        process.exit(0);
      } else if (ans === 'x') {
        const skipped = manualList.shift();
        manualList.push(skipped);
        fs.writeFileSync(MANUAL_FILE, JSON.stringify(manualList, null, 2));
        resolved = true;
      } else if (ans === 'd') {
        manualList.shift();
        fs.writeFileSync(MANUAL_FILE, JSON.stringify(manualList, null, 2));
        resolved = true;
      } else if (ans === 's') {
        const newSearch = await question("Ketik judul pencarian baru: ");
        if (newSearch) {
          console.log("Mencari ulang...");
          candidates = await fetchAniList(newSearch);
        }
      } else if (ans === 'i') {
        const manualId = await question("Masukkan ID AniList: ");
        const numId = parseInt(manualId);
        if (numId) {
          mappings.animelovers[String(numId)] = item.slug;
          manualList.shift();
          fs.writeFileSync(MANUAL_FILE, JSON.stringify(manualList, null, 2));
          fs.writeFileSync(MAPPINGS_FILE, JSON.stringify(mappings, null, 2));
          console.log(`\n✅ BERHASIL! ID ${numId} -> ${item.slug}`);
          await new Promise(r => setTimeout(r, 800)); // Jeda sebentar biar user bisa baca suksesnya
          resolved = true;
        } else {
            console.log("\n❌ ID tidak valid, harus berupa angka.");
        }
      } else {
        const num = parseInt(ans);
        if (num >= 1 && num <= candidates.length) {
          const chosen = candidates[num - 1];
          mappings.animelovers[String(chosen.id)] = item.slug;
          manualList.shift();
          fs.writeFileSync(MANUAL_FILE, JSON.stringify(manualList, null, 2));
          fs.writeFileSync(MAPPINGS_FILE, JSON.stringify(mappings, null, 2));
          console.log(`\n✅ BERHASIL DIPASANGKAN: ID ${chosen.id} -> ${item.slug}`);
          await new Promise(r => setTimeout(r, 800)); // Jeda sebentar
          resolved = true;
        } else {
          console.log("\n❌ Pilihan tidak dikenali.");
        }
      }
    }
  }

  console.log("Selamat! Semua data manual_check.json sudah habis diselesaikan!");
  process.exit(0);
}

run();
