/**
 * Downloads the rijal database and the kinship/kunya lookup tables into
 * `.cache/`, which the ingester reads from. About 124 MB, fetched once.
 *
 *   npm run rijal:fetch
 */

import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ITQAN_BASE } from './books.js';
import { WORK_SOURCES, fileOf, urlOf } from './rijal/works.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CACHE_DIR = join(ROOT, '.cache');

const PROFILES = [
  'profiles_companion.json',
  'profiles_reliable.json',
  'profiles_mostly_reliable.json',
  'profiles_weak.json',
  'profiles_abandoned.json',
  'profiles_fabricator.json',
  'profiles_unknown.json',
];

const MAPS = [
  'isnad_father_map.json',
  'isnad_grandfather_map.json',
  'isnad_grandmother_map.json',
  'isnad_mother_map.json',
  'isnad_uncle_map.json',
  'isnad_kunya_map.json',
];

async function download(url: string, path: string): Promise<void> {
  if (existsSync(path)) {
    console.log(`  · ${path.split('/').pop()} (cached, ${(statSync(path).size / 1e6).toFixed(1)} MB)`);
    return;
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = Buffer.from(await response.arrayBuffer());
      writeFileSync(path, body);
      console.log(`  ✓ ${path.split('/').pop()} (${(body.length / 1e6).toFixed(1)} MB)`);
      return;
    } catch (error) {
      if (attempt === 3) throw new Error(`${url}: ${error instanceof Error ? error.message : error}`);
    }
  }
}

async function main(): Promise<void> {
  const rijalDir = join(CACHE_DIR, 'rijal');
  const mapsDir = join(CACHE_DIR, 'maps');
  mkdirSync(rijalDir, { recursive: true });
  mkdirSync(mapsDir, { recursive: true });

  console.log('\n  Narrator profiles (ʿilm ar-rijāl)');
  for (const file of PROFILES) {
    await download(`${ITQAN_BASE}/app/data/rijal/${file}`, join(rijalDir, file));
  }

  console.log('\n  Classical works, read in full (OpenITI)');
  const worksDir = join(CACHE_DIR, 'works');
  mkdirSync(worksDir, { recursive: true });
  for (const source of WORK_SOURCES) {
    await download(urlOf(source), join(worksDir, fileOf(source)));
  }

  console.log('\n  Kinship and kunya lookup tables');
  for (const file of MAPS) {
    await download(`${ITQAN_BASE}/src/${file}`, join(mapsDir, file));
  }

  console.log('\n  Ready. Now run: npm run ingest -- --list\n');
}

main().catch((error) => {
  console.error(`\n  rijal:fetch failed: ${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
