// Minimal local JSON file storage. No database: each collection is one JSON
// file under server/data/, read/written whole (this app has a single local
// user, so there's no concurrency to worry about). Writes are atomic
// (write to a temp file, then rename) so a crash mid-write can't corrupt data.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, '..', 'data');

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readJson(fileName, fallback) {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, fileName);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

export async function writeJson(fileName, data) {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, fileName);
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}
