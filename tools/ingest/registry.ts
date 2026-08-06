/**
 * Builds the narrator registry from whatever books have been ingested.
 *
 * The registry is global — a narrator is one node whether he turns up in one
 * book or nine — so it is rebuilt from every `books/<slug>/index.json` each
 * time a book is added. That keeps books independent of one another: ingesting
 * Muslim does not require re-parsing Bukhari.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_BIO_HADITHS,
  PROPHET_ID,
  bioShardFor,
  collectorId,
  type BookFile,
  type BookSummary,
  type NarratorBio,
  type NarratorBioShard,
  type NarratorGrade,
  type NarratorIndexEntry,
  type NarratorIndexFile,
  CORPUS_FORMAT_VERSION,
} from '../../src/corpus/types.js';
import { findBook } from './books.js';
import { namedAsWoman } from './rijal/gender.js';
import type { WorkEntries } from './rijal/entries.js';
import { assignGenerations, type GenerationResult } from './generations.js';
import type { KunyaEntry } from './isnad/maps.js';
import type { RijalDatabase } from './rijal/db.js';
import { writeJson } from './emit.js';

/** One bio shard per ~400 narrators, so an open never pulls more than a page. */
function shardCount(narrators: number): number {
  return Math.max(1, Math.ceil(narrators / 400));
}

interface Accumulator {
  id: string;
  /** Every surface form seen for this narrator, with counts. */
  surfaces: Map<string, number>;
  /** Depth from the Prophet at each appearance. */
  depths: number[];
  hadiths: string[];
  books: Map<string, number>;
  total: number;
  /** Appearances matched cleanly to a biography, and those that were close calls. */
  clear: number;
  uncertain: number;
}

export interface RegistryResult {
  narratorCount: number;
  bioShards: number;
}

export function rebuildRegistry(
  dataDir: string,
  books: BookSummary[],
  db: RijalDatabase,
  kunya: Map<string, KunyaEntry>,
  normaliseKey: (s: string) => string,
  works: WorkEntries[] = [],
): RegistryResult {
  const acc = new Map<string, Accumulator>();

  const touch = (id: string): Accumulator => {
    let entry = acc.get(id);
    if (!entry) {
      entry = {
        id,
        surfaces: new Map(),
        depths: [],
        hadiths: [],
        books: new Map(),
        total: 0,
        clear: 0,
        uncertain: 0,
      };
      acc.set(id, entry);
    }
    return entry;
  };

  const record = (id: string, depth: number, hadithId: string, book: string) => {
    const entry = touch(id);
    entry.total++;
    entry.depths.push(depth);
    entry.books.set(book, (entry.books.get(book) ?? 0) + 1);
    if (entry.hadiths.length < MAX_BIO_HADITHS) entry.hadiths.push(hadithId);
  };

  const chains: { path: string[]; toProphet: boolean }[] = [];

  for (const summary of books) {
    const book = JSON.parse(
      readFileSync(join(dataDir, summary.dir, 'index.json'), 'utf8'),
    ) as BookFile;
    for (const hadith of book.hadiths) {
      if (hadith.chain.length) {
        chains.push({
          path: [PROPHET_ID, ...hadith.chain, collectorId(book.slug)],
          toProphet: hadith.toProphet,
        });
      }
      if (!hadith.chain.length) continue;
      record(PROPHET_ID, 0, hadith.id, book.slug);
      hadith.chain.forEach((id, i) => record(id, i + 1, hadith.id, book.slug));
      record(collectorId(book.slug), hadith.chain.length + 1, hadith.id, book.slug);
    }
    for (const [id, forms] of Object.entries(book.surfaces ?? {})) {
      const entry = touch(id);
      for (const [surface, count] of Object.entries(forms)) {
        entry.surfaces.set(surface, (entry.surfaces.get(surface) ?? 0) + count);
      }
    }
    for (const [id, [clear, uncertain]] of Object.entries(book.identification ?? {})) {
      const entry = touch(id);
      entry.clear += clear;
      entry.uncertain += uncertain;
    }
  }

  // Generations are settled across the whole corpus before anything is
  // written, so every book agrees on where a narrator stands.
  const tabaqa = new Map<string, number>();
  const died = new Map<string, number>();
  for (const id of acc.keys()) {
    if (!id.startsWith('r')) continue;
    const profile = db.get(Number(id.slice(1)));
    if (!profile) continue;
    if (profile.tabaqa != null) tabaqa.set(id, profile.tabaqa);
    if (profile.diedAH != null) died.set(id, profile.diedAH);
  }
  const generations = assignGenerations({ chains, tabaqa, died });
  generations.gen.set(PROPHET_ID, 0);
  generations.source.set(PROPHET_ID, 'chains');
  console.log(
    `  generations: ${generations.counts.chains} from chains, ${generations.counts.tabaqa} from ṭabaqa, ` +
      `${generations.counts.inferred} inferred, ${generations.counts.position} by position`,
  );

  const shards = shardCount(acc.size);
  const index: NarratorIndexEntry[] = [];
  const bios: NarratorBioShard[] = Array.from({ length: shards }, (_, shard) => ({
    formatVersion: CORPUS_FORMAT_VERSION,
    shard,
    bios: {},
  }));

  for (const entry of acc.values()) {
    const { indexEntry, bio } = describe(entry, db, kunya, normaliseKey, generations, works);
    index.push(indexEntry);
    bios[bioShardFor(entry.id, shards)].bios[entry.id] = bio;
  }

  // Teacher/student links are only meaningful between people in the corpus.
  const present = new Set(index.map((e) => e.id));
  for (const shard of bios) {
    for (const bio of Object.values(shard.bios)) {
      bio.teachers = bio.teachers?.filter((id) => present.has(id));
      bio.students = bio.students?.filter((id) => present.has(id));
      if (!bio.teachers?.length) delete bio.teachers;
      if (!bio.students?.length) delete bio.students;
    }
  }

  index.sort((a, b) => b.n - a.n);

  const indexFile: NarratorIndexFile = {
    formatVersion: CORPUS_FORMAT_VERSION,
    bioShards: shards,
    narrators: index,
  };
  writeJson(join(dataDir, 'narrators', 'index.json'), indexFile);
  for (const shard of bios) {
    writeJson(join(dataDir, 'narrators', `bio-${shard.shard}.json`), shard);
  }

  return { narratorCount: index.length, bioShards: shards };
}

/** The most frequent surface form, as the label to show on the node. */
function commonestSurface(surfaces: Map<string, number>): string | undefined {
  let best: string | undefined;
  let bestCount = -1;
  for (const [surface, count] of surfaces) {
    if (count > bestCount || (count === bestCount && surface.length > (best?.length ?? 0))) {
      best = surface;
      bestCount = count;
    }
  }
  return best;
}

/** Median, so one stray chain cannot drag a narrator out of his generation. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function describe(
  entry: Accumulator,
  db: RijalDatabase,
  kunya: Map<string, KunyaEntry>,
  normaliseKey: (s: string) => string,
  generations: GenerationResult,
  works: WorkEntries[],
): { indexEntry: NarratorIndexEntry; bio: NarratorBio } {
  const gen = generations.gen.get(entry.id) ?? median(entry.depths);
  const gf = generations.source.get(entry.id) ?? 'position';
  const sub = generations.sub.get(entry.id) ?? 0.5;
  const books: Record<string, number> = {};
  for (const [slug, count] of entry.books) books[slug] = count;
  const base = { id: entry.id, hadiths: entry.hadiths, books, verdicts: [] as NarratorBio['verdicts'] };

  if (entry.id === PROPHET_ID) {
    return {
      indexEntry: {
        id: entry.id,
        ar: 'النبي ﷺ',
        en: 'The Prophet Muhammad ﷺ',
        grade: 'companion',
        gen: 0,
        gf: 'chains',
        sub: 0,
        n: entry.total,
        r: true,
      },
      bio: {
        ...base,
        fullNameAr: 'محمد بن عبد الله ﷺ',
        fullNameEn: 'Muḥammad ibn ʿAbd Allāh ﷺ',
        diedRaw: '11 AH',
        note: 'The origin of every chain in the corpus. Reports are traced back to him through the transmitters shown above.',
      },
    };
  }

  if (entry.id.startsWith('collector:')) {
    const slug = entry.id.slice('collector:'.length);
    const book = findBook(slug);
    return {
      indexEntry: {
        id: entry.id,
        ar: book?.authorAr ?? slug,
        en: book?.authorEn ?? slug,
        grade: 'reliable',
        gen,
        gf,
        sub,
        n: entry.total,
        r: true,
      },
      bio: {
        ...base,
        fullNameAr: book?.authorAr,
        fullNameEn: book?.authorEn,
        diedRaw: book?.authorDiedAH ? `${book.authorDiedAH} AH` : undefined,
        note: book
          ? `Compiler of ${book.titleEn}. Every chain in that collection ends with him.`
          : undefined,
      },
    };
  }

  const surface = commonestSurface(entry.surfaces) ?? entry.id;

  if (entry.id.startsWith('r')) {
    const profile = db.get(Number(entry.id.slice(1)));
    if (profile) {
      const kunyaHit = kunya.get(normaliseKey(surface)) ?? kunya.get(normaliseKey(profile.fullNameAr));
      const uncertain = entry.uncertain > entry.clear;
      return {
        indexEntry: {
          id: entry.id,
          ar: displayName(surface, profile.fullNameAr),
          en: kunyaHit?.en,
          grade: profile.grade,
          gen,
          gf,
          sub,
          d: profile.diedAH,
          n: entry.total,
          r: true,
          ...(uncertain ? { amb: true } : {}),
          ...(namedAsWoman(profile) ? { w: true } : {}),
        },
        bio: {
          ...base,
          fullNameAr: profile.fullNameAr,
          fullNameEn: kunyaHit?.en,
          kunya: profile.kunya,
          laqab: profile.laqab,
          nasab: profile.nasab,
          city: profile.city,
          tabaqatAr: profile.tabaqatAr,
          gradeAr: profile.gradeAr,
          diedRaw: profile.diedRaw,
          note:
            kunyaHit?.note ??
            (profile.companionshipRejected && profile.grade === 'unknown'
              ? 'The one assessment on record for him was a claim of companionship, which his ṭabaqa and death year rule out — al-Iṣāba lists everyone the claim was made for, including those it rejects. That leaves this database with no grading of his reliability; it does not mean the critics passed over him.'
              : uncertain
                ? 'The chains name this transmitter briefly, and more than one figure in the rijal literature fits. This is the best reading of the name, not a settled identification.'
                : undefined),
          // What each work actually says about him, where he could be matched
          // to an entry in it with confidence. The verdict phrase stays as it
          // was; the entry is the sentence it was taken from.
          verdicts: profile.verdicts.map((verdict) => {
            const work = works.find((w) => w.key === verdict.key);
            const found = work?.aligned.get(profile.id);
            return found
              ? {
                  ...verdict,
                  entryAr: found.text,
                  entryNo: found.n,
                  edition: work!.edition,
                }
              : verdict;
          }),
          variants: [...entry.surfaces.keys()],
          teachers: profile.teachers.map((id) => `r${id}`),
          students: profile.students.map((id) => `r${id}`),
        },
      };
    }
  }

  // Named in the isnad but not matched to a biography.
  const kunyaHit = kunya.get(normaliseKey(surface));
  return {
    indexEntry: {
      id: entry.id,
      ar: surface,
      en: kunyaHit?.en,
      grade: 'unknown' as NarratorGrade,
      gen,
      gf,
      sub,
      n: entry.total,
      r: false,
      // All there is to go on here is what the isnad called her.
      ...(namedAsWoman({ fullNameAr: kunyaHit?.real ?? surface }) ? { w: true } : {}),
    },
    bio: {
      ...base,
      fullNameAr: kunyaHit?.real ?? surface,
      fullNameEn: kunyaHit?.en,
      note:
        kunyaHit?.note ??
        'Read from the chain text but not matched to an entry in the rijal literature, so no grading is shown.',
      variants: [...entry.surfaces.keys()],
    },
  };
}

/**
 * Prefer the isnad's own wording when the biographical full name is unusable
 * (the merged database occasionally carries a bare nisba as a full name), and
 * prefer the full name when it is genuinely more informative.
 */
function displayName(surface: string, fullName: string): string {
  const surfaceWords = surface.split(/\s+/).length;
  const fullWords = fullName.split(/\s+/).length;
  if (!fullName) return surface;
  if (fullWords < surfaceWords) return surface;
  // Long lineages are for the biography panel, not for a label in 3D.
  if (fullWords > 6) return surface;
  return fullName;
}
