/**
 * Corpus ingester.
 *
 *   npm run ingest -- --list              show the catalogue and what is in
 *   npm run ingest -- bukhari             add or refresh one book
 *   npm run ingest -- bukhari muslim      …or several
 *   npm run ingest -- --all               everything in the catalogue
 *   npm run ingest -- --registry          rebuild the registry only
 *
 * For each book it fetches the text, parses every isnad, resolves the names
 * against the rijal database, and writes `public/data/books/<slug>/`. It then
 * rebuilds the global narrator registry across all ingested books.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CORPUS_FORMAT_VERSION,
  TEXT_CHUNK_SIZE,
  type BookFile,
  type Chapter,
  type CorpusManifest,
  type BookSummary,
  type HadithRecord,
  type HadithText,
  type TextChunkFile,
} from '../../src/corpus/types.js';
import { BOOKS, HADITH_JSON_BASE, HADITH_JSON_TAG, ITQAN_BASE, findBook, type BookDefinition } from './books.js';
import { writeJson } from './emit.js';
import { fetchJson, mapLimit, type FetchOptions } from './fetch.js';
import { normaliseKey, stripDiacritics } from './isnad/arabic.js';
import { loadKunyaMap, loadRelativeMaps } from './isnad/maps.js';
import { parseIsnad } from './isnad/parse.js';
import { RijalDatabase } from './rijal/db.js';
import { rebuildRegistry } from './registry.js';
import { rebuildSearchIndex } from './search.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DATA_DIR = join(ROOT, 'public', 'data');
const CACHE_DIR = join(ROOT, '.cache');
const RIJAL_DIR = join(CACHE_DIR, 'rijal');
const MAPS_DIR = join(CACHE_DIR, 'maps');

const SOURCES: CorpusManifest['sources'] = [
  {
    id: 'hadith-json',
    title: 'hadith-json',
    url: `https://github.com/AhmedBaset/hadith-json/tree/${HADITH_JSON_TAG}`,
    note: 'Arabic text and English translation of the collections, scraped from sunnah.com.',
  },
  {
    id: 'itqan',
    title: 'Itqan — rijal database',
    url: 'https://github.com/R3GENESI5/Itqan',
    note: "115,735 narrator profiles consolidated from 22 classical works of ʿilm ar-rijāl, al-Albānī's rulings on the four Sunan, and the kinship/kunya lookup tables.",
  },
];

// --- upstream shapes -------------------------------------------------------

interface UpstreamHadith {
  id: number;
  idInBook: number;
  chapterId: number;
  arabic: string;
  english?: { narrator?: string; text?: string };
}

interface UpstreamBook {
  metadata: { arabic: { title: string; author: string }; english: { title: string; author: string } };
  chapters?: { id: number; arabic: string; english: string }[];
  hadiths: UpstreamHadith[];
}

interface ItqanHadith {
  id: number;
  arabic?: string;
  grade?: string;
}

interface ItqanChapter {
  [index: string]: ItqanHadith;
}

// --- ingestion -------------------------------------------------------------

async function ingestBook(
  book: BookDefinition,
  db: RijalDatabase,
  maps: ReturnType<typeof loadRelativeMaps>,
  options: FetchOptions,
): Promise<BookSummary> {
  process.stdout.write(`  fetching ${book.slug} … `);
  const upstream = await fetchJson<UpstreamBook>(`${HADITH_JSON_BASE}/${book.path}`, options);
  console.log(`${upstream.hadiths.length} hadiths`);

  const grades = book.gradesFrom
    ? await fetchGrades(book, upstream.hadiths, upstream.chapters ?? [], options)
    : new Map<number, string>();

  const chapters: Chapter[] = (upstream.chapters ?? []).map((c) => ({
    id: c.id,
    en: c.english,
    ar: c.arabic,
  }));

  const records: HadithRecord[] = [];
  const texts: Record<string, HadithText>[] = [];
  const attested = (name: string) => db.isAttested(name);

  let chainCount = 0;
  const narrators = new Set<string>();
  const identification: Record<string, [number, number]> = {};
  const surfaces: Record<string, Record<string, number>> = {};

  upstream.hadiths.forEach((h, i) => {
    const parsed = parseIsnad(h.arabic, { maps, attested });
    const resolutions = db.resolveChain(parsed.names, parsed.reachedProphet);

    // Parsed compiler-first; stored in transmission order, so the graph reads
    // Prophet → … → compiler.
    const chain: string[] = [];
    for (let k = resolutions.length - 1; k >= 0; k--) {
      const r = resolutions[k];
      const id = r.profile ? `r${r.profile.id}` : `u:${normaliseKey(r.surface)}`;
      // A narrator repeated back-to-back adds a self-loop, not a link.
      if (chain.length && chain[chain.length - 1] === id) continue;
      chain.push(id);
      narrators.add(id);
      const tally = (identification[id] ??= [0, 0]);
      tally[r.ambiguous ? 1 : 0]++;
      const seen = (surfaces[id] ??= {});
      seen[r.surface] = (seen[r.surface] ?? 0) + 1;
    }

    if (chain.length) chainCount++;

    const chunk = Math.floor(i / TEXT_CHUNK_SIZE);
    if (!texts[chunk]) texts[chunk] = {};
    const id = `${book.slug}:${h.idInBook}`;
    texts[chunk][id] = {
      ar: h.arabic || undefined,
      en: h.english?.text || undefined,
      by: h.english?.narrator || undefined,
    };

    records.push({
      id,
      ref: h.idInBook,
      chapterId: h.chapterId,
      grade: grades.get(h.id),
      chain,
      toProphet: parsed.reachedProphet,
      t: chunk,
    });
  });

  const dir = join('books', book.slug);
  let bytes = 0;
  texts.forEach((chunkTexts, chunk) => {
    const file: TextChunkFile = { formatVersion: CORPUS_FORMAT_VERSION, chunk, texts: chunkTexts };
    bytes += writeJson(join(DATA_DIR, dir, `text-${chunk}.json`), file);
  });

  const summary: BookSummary = {
    slug: book.slug,
    titleEn: book.titleEn,
    titleAr: book.titleAr,
    authorEn: book.authorEn,
    authorAr: book.authorAr,
    authorDiedAH: book.authorDiedAH || undefined,
    gradedBy: book.gradedBy,
    hadithCount: records.length,
    chainCount,
    narratorCount: narrators.size,
    ordinalBase: 0,
    dir,
    textChunks: texts.length,
    bytes: 0,
    ingestedAt: new Date().toISOString(),
  };

  const bookFile: BookFile = {
    ...summary,
    formatVersion: CORPUS_FORMAT_VERSION,
    chapters,
    hadiths: records,
    identification,
    surfaces,
  };
  bytes += writeJson(join(DATA_DIR, dir, 'index.json'), bookFile);
  summary.bytes = bytes;

  const pct = ((chainCount / Math.max(records.length, 1)) * 100).toFixed(1);
  console.log(
    `  ${book.slug}: ${chainCount}/${records.length} chains (${pct}%), ${narrators.size} narrators, ${(bytes / 1e6).toFixed(1)} MB`,
  );
  return summary;
}

/**
 * Tidy a grade's spelling without touching what it says.
 *
 * The same ruling arrives written four ways — `Da'if`, `Da’if`, `Daif`,
 * `Da if` — because the apostrophe transliterating the ʿayn survives
 * inconsistently. Left alone they are four different verdicts to anything
 * counting or colouring them.
 *
 * Only orthography is unified. Rulings that differ in substance are left
 * alone even when they look similar: `Da'if` and `Da'if in chain` say
 * different things, and merging them would put words in the critic's mouth.
 */
function normaliseGrade(raw: string): string | undefined {
  const text = raw
    .replace(/[‘’ʻʼ`´]/g, "'")
    // Upstream carries the odd doubled mark of its own, before anything here
    // touches it.
    .replace(/'{2,}/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/[,;]\s*$/, '')
    .trim();

  // A grade has to read as one. Upstream carries the occasional stray number
  // where a verdict should be.
  if (!/[a-z]/i.test(text)) return undefined;

  // A trailing \b after the optional apostrophe would be wrong in both of the
  // rules below, and wrong in the same quiet way: there is no word boundary
  // between an apostrophe and the end of a string, so the pattern backtracks,
  // matches the bare word, and leaves the original mark sitting after the
  // replacement — turning `Mawdu'` into `Maudu''` rather than `Maudu'`.
  return text
    .replace(/\bDa'?\s?if\b/gi, (m) => (m[0] === 'd' ? "da'if" : "Da'if"))
    .replace(/\bMawdu'?/gi, "Maudu'")
    .replace(/\bMaudu(?!')/g, "Maudu'");
}

/**
 * Arabic reduced to its bare letters, for deciding whether two copies of the
 * same hadith are the same hadith. Vowel marks, punctuation and the honorific
 * glyphs differ between the two sources for reasons that have nothing to do
 * with which report it is.
 */
function letters(text: string): string {
  return stripDiacritics(text).replace(/[^\u0621-\u064A]/gu, '');
}

/**
 * Per-hadith gradings, which Itqan stores a chapter at a time.
 *
 * There is no shared identifier to join on. Itqan numbers each chapter file
 * from one — both its `id` and its `idInBook` are positions within that file,
 * not within the book — while the text source numbers hadiths globally across
 * every collection. Joining those two directly, which is what this did, lines
 * chapter-local counters up against global ids: it matched nothing at all
 * except in Ṣaḥīḥ al-Bukhārī, where the global numbering happens to start at
 * one, and there it matched the wrong hadiths in every chapter after the first.
 *
 * So the two are paired by position within a chapter, and — because position
 * is an assumption rather than a key — every pair is checked against the Arabic
 * before it is believed. A chapter whose lengths disagree, or whose text does
 * not line up, is dropped entire rather than half-trusted.
 */
async function fetchGrades(
  book: BookDefinition,
  ours: UpstreamHadith[],
  chapters: { id: number }[],
  options: FetchOptions,
): Promise<Map<number, string>> {
  const grades = new Map<number, string>();
  const ids = chapters.length ? chapters.map((c) => c.id) : [1];
  process.stdout.write(`  gradings for ${book.slug} (${ids.length} chapters) … `);

  const mine = new Map<number, UpstreamHadith[]>();
  for (const h of ours) {
    const list = mine.get(h.chapterId);
    if (list) list.push(h);
    else mine.set(h.chapterId, [h]);
  }

  let missing = 0;
  let mismatched = 0;
  await mapLimit(ids, 8, async (chapterId) => {
    let data: ItqanChapter;
    try {
      data = await fetchJson<ItqanChapter>(
        `${ITQAN_BASE}/app/data/sunni/${book.gradesFrom}/${chapterId}.json`,
        options,
      );
    } catch {
      missing++;
      return;
    }

    const theirs = Object.values(data).filter(
      (entry): entry is ItqanHadith => !!entry && typeof entry === 'object',
    );
    const chapter = mine.get(chapterId) ?? [];
    if (theirs.length !== chapter.length) {
      mismatched++;
      return;
    }
    if (theirs.some((entry, i) => letters(entry.arabic ?? '') !== letters(chapter[i].arabic))) {
      mismatched++;
      return;
    }

    theirs.forEach((entry, i) => {
      const grade = entry.grade ? normaliseGrade(entry.grade) : undefined;
      if (grade) grades.set(chapter[i].id, grade);
    });
  });

  console.log(
    `${grades.size} graded` +
      `${missing ? `, ${missing} chapters unavailable` : ''}` +
      `${mismatched ? `, ${mismatched} chapters did not line up and were skipped` : ''}`,
  );
  return grades;
}

// --- manifest --------------------------------------------------------------

function readManifest(): CorpusManifest {
  const path = join(DATA_DIR, 'manifest.json');
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8')) as CorpusManifest;
  return {
    formatVersion: CORPUS_FORMAT_VERSION,
    generatedAt: new Date().toISOString(),
    narratorCount: 0,
    bioShards: 0,
    books: [],
    sources: SOURCES,
  };
}

// --- entry point -----------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const refresh = args.includes('--refresh');
  const slugs = args.filter((a) => !a.startsWith('--'));

  if (args.includes('--list') || (!slugs.length && !args.includes('--all') && !args.includes('--registry'))) {
    const manifest = readManifest();
    const ingested = new Set(manifest.books.map((b) => b.slug));
    console.log('\n  Catalogue (● ingested, ○ available)\n');
    for (const book of BOOKS) {
      const mark = ingested.has(book.slug) ? '●' : '○';
      const summary = manifest.books.find((b) => b.slug === book.slug);
      const detail = summary ? `  ${summary.chainCount}/${summary.hadithCount} chains` : '';
      console.log(`  ${mark} ${book.slug.padEnd(22)} ${book.titleEn.padEnd(32)}${detail}`);
    }
    console.log(`\n  ${manifest.books.length} of ${BOOKS.length} books ingested, ${manifest.narratorCount} narrators\n`);
    return;
  }

  const targets = args.includes('--all') ? BOOKS : slugs.map((slug) => {
    const book = findBook(slug);
    if (!book) throw new Error(`Unknown book "${slug}". Run with --list to see the catalogue.`);
    return book;
  });

  if (!existsSync(RIJAL_DIR)) {
    throw new Error(`Rijal database not found in ${RIJAL_DIR}. Run: npm run rijal:fetch`);
  }

  console.log('\n  Loading rijal database …');
  const t0 = Date.now();
  const db = RijalDatabase.load(RIJAL_DIR);
  console.log(`  ${db.size.toLocaleString()} narrator profiles (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);

  const maps = loadRelativeMaps(MAPS_DIR);
  const kunya = loadKunyaMap(MAPS_DIR);
  const options: FetchOptions = { cacheDir: join(CACHE_DIR, 'http'), refresh };

  const manifest = readManifest();
  for (const book of targets) {
    const summary = await ingestBook(book, db, maps, options);
    const at = manifest.books.findIndex((b) => b.slug === book.slug);
    if (at >= 0) manifest.books[at] = summary;
    else manifest.books.push(summary);
  }

  // Books not touched this run still contribute narrators to the registry.
  manifest.books = manifest.books.filter((b) =>
    existsSync(join(DATA_DIR, b.dir, 'index.json')),
  );
  manifest.books.sort((a, b) => (a.authorDiedAH ?? 9999) - (b.authorDiedAH ?? 9999));

  // The search index numbers hadiths across the whole corpus, so the bases
  // have to be settled before it is built — and rewritten into the book files,
  // which the app reads them from.
  let ordinal = 0;
  for (const book of manifest.books) {
    book.ordinalBase = ordinal;
    ordinal += book.hadithCount;
    const path = join(DATA_DIR, book.dir, 'index.json');
    const file = JSON.parse(readFileSync(path, 'utf8')) as BookFile;
    if (file.ordinalBase !== book.ordinalBase) {
      file.ordinalBase = book.ordinalBase;
      writeJson(path, file);
    }
  }

  console.log('\n  Rebuilding narrator registry …');
  const { narratorCount, bioShards } = rebuildRegistry(DATA_DIR, manifest.books, db, kunya, normaliseKey);

  console.log('  Rebuilding search index …');
  const search = rebuildSearchIndex(DATA_DIR, manifest.books);
  console.log(
    `  ${search.terms.toLocaleString()} terms over ${search.docs.toLocaleString()} hadiths`,
  );

  manifest.formatVersion = CORPUS_FORMAT_VERSION;
  manifest.generatedAt = new Date().toISOString();
  manifest.narratorCount = narratorCount;
  manifest.bioShards = bioShards;
  manifest.search = search;
  manifest.sources = SOURCES;
  writeJson(join(DATA_DIR, 'manifest.json'), manifest);

  const total = manifest.books.reduce((sum, b) => sum + b.hadithCount, 0);
  const onDisk = manifest.books.reduce((sum, b) => sum + b.bytes, 0);
  console.log(
    `  ${narratorCount.toLocaleString()} narrators across ${manifest.books.length} books, ` +
      `${total.toLocaleString()} hadiths, ${(onDisk / 1e6).toFixed(1)} MB\n`,
  );
}

main().catch((error) => {
  console.error(`\n  ingest failed: ${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
