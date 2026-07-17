import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAPPINGS_FILE = path.join(__dirname, '..', '..', 'mappings.json');

export function getMapping(anilistId, source = "animelovers") {
  try {
    if (!fs.existsSync(MAPPINGS_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(MAPPINGS_FILE, 'utf8'));
    return data?.[source]?.[String(anilistId)] || null;
  } catch (err) {
    console.error("Error reading mappings.json:", err.message);
    return null;
  }
}

export function setMapping(anilistId, sourceSlug, source = "animelovers") {
  try {
    let data = {};
    if (fs.existsSync(MAPPINGS_FILE)) {
      data = JSON.parse(fs.readFileSync(MAPPINGS_FILE, 'utf8'));
    }
    if (!data[source]) data[source] = {};
    data[source][String(anilistId)] = sourceSlug;
    fs.writeFileSync(MAPPINGS_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error("Error writing mappings.json:", err.message);
    return false;
  }
}
