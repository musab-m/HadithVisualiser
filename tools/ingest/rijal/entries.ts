/**
 * Loading a classical work and matching its entries to the corpus.
 *
 * The pieces are elsewhere — `works.ts` says where each text lives and which
 * edition it is, `openiti.ts` reads the entries out of it, `align.ts` decides
 * which entry is which man — and this puts them together once per work, at
 * ingest, so the registry can hang the text on the narrator it belongs to.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanEntry, parseBiographies } from './openiti.js';
import { alignAll, type Candidate } from './align.js';
import { WORK_SOURCES, fileOf } from './works.js';
import type { RijalDatabase } from './db.js';

export interface WorkEntries {
  key: string;
  edition: string;
  /** Profile id → the entry the work gives him. */
  aligned: Map<number, { n: number; text: string }>;
}

/**
 * Read every work whose text has been fetched, and align it to the profiles
 * this corpus actually uses.
 *
 * Restricted to those profiles on purpose: aligning all 115,735 would take
 * longer and answer a question nobody asked, since a narrator who appears in no
 * chain is never opened.
 */
export function readEntries(
  cacheDir: string,
  db: RijalDatabase,
  profileIds: Iterable<number>,
): WorkEntries[] {
  const candidates: Candidate[] = [];
  for (const id of profileIds) {
    const profile = db.get(id);
    if (!profile) continue;
    candidates.push({
      id,
      namings: [profile.fullNameAr, ...profile.namings].filter(Boolean),
      tabaqatAr: profile.tabaqatAr,
      diedRaw: profile.diedRaw,
    });
  }

  const out: WorkEntries[] = [];
  for (const source of WORK_SOURCES) {
    const path = join(cacheDir, 'works', fileOf(source));
    // A work that has not been fetched is simply one the panel says less
    // about; it is not a reason to fail an ingest.
    if (!existsSync(path)) continue;

    const entries = parseBiographies(readFileSync(path, 'utf8'));
    const aligned = new Map<number, { n: number; text: string }>();
    for (const [id, match] of alignAll(entries, candidates)) {
      aligned.set(id, { n: match.entry.n, text: cleanEntry(match.entry.text) });
    }
    out.push({ key: source.key, edition: source.edition, aligned });
    console.log(
      `  ${source.key}: ${entries.length.toLocaleString()} entries, ${aligned.size.toLocaleString()} matched to narrators in the corpus`,
    );
  }
  return out;
}
