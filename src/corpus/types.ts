/**
 * Corpus schema — shared by the ingestion pipeline (tools/ingest) and the web app.
 *
 * The corpus is a set of independently generated artefacts under `public/data`:
 *
 *   manifest.json             catalogue of every ingested book + global counts
 *   books/<slug>/index.json   a book's hadiths and their parsed isnad chains
 *   books/<slug>/text-K.json  the hadith texts, chunked, fetched when read
 *   narrators/index.json      lightweight registry: what the 3D graph needs
 *   narrators/bio-NN.json     sharded full biographies, fetched on demand
 *   search/shard-K.json       inverted index over the text, fetched per query
 *
 * Chains and text are separate so the graph can open the whole corpus without
 * pulling tens of megabytes of prose. Adding a book only ever writes a new
 * `books/<slug>/` directory and rewrites the narrator registry + manifest, so
 * books can be ingested one at a time.
 */

export const CORPUS_FORMAT_VERSION = 1;

/** Grade buckets used by `ilm ar-rijal` for a transmitter's reliability. */
export type NarratorGrade =
  | 'companion'
  | 'reliable'
  | 'mostly_reliable'
  | 'weak'
  | 'abandoned'
  | 'fabricator'
  | 'unknown';

export const NARRATOR_GRADES: NarratorGrade[] = [
  'companion',
  'reliable',
  'mostly_reliable',
  'weak',
  'abandoned',
  'fabricator',
  'unknown',
];

/** Special graph endpoints that are not ordinary transmitters. */
export const PROPHET_ID = 'prophet';
export const collectorId = (bookSlug: string) => `collector:${bookSlug}`;

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export interface CorpusManifest {
  formatVersion: number;
  generatedAt: string;
  /** Total unique narrators in the registry across all ingested books. */
  narratorCount: number;
  /** Number of narrator bio shards (`narrators/bio-0.json` … `bio-N.json`). */
  bioShards: number;
  /** Full-text index, absent until the index has been built. */
  search?: SearchSummary;
  books: BookSummary[];
  sources: SourceAttribution[];
}

export interface SearchSummary {
  /** Number of `search/shard-K.json` files. */
  shards: number;
  /** Hadiths in the index — the ordinal space runs 0 … docs-1. */
  docs: number;
  /** Distinct terms indexed, single words and adjacent pairs together. */
  terms: number;
}

/**
 * One shard of the inverted index: term → the ordinals of the hadiths carrying
 * it, delta-encoded and ascending, so the common case of a long posting list
 * stores small numbers.
 */
export interface SearchShardFile {
  formatVersion: number;
  shard: number;
  postings: Record<string, number[]>;
}

export interface SourceAttribution {
  id: string;
  title: string;
  url: string;
  note: string;
}

export interface BookSummary {
  slug: string;
  titleEn: string;
  titleAr: string;
  authorEn: string;
  authorAr: string;
  /** Compiler's death year, hijri. */
  authorDiedAH?: number;
  /**
   * Whose ruling the per-hadith grades in this collection are.
   *
   * Travels with the book rather than with each hadith: one critic graded the
   * whole collection, so repeating the attribution fifty-two hundred times
   * would only make the file bigger. Absent where the collection carries no
   * gradings — and a grade must never be shown without it, since an
   * unattributed "ḍaʿīf" invites the reader to take it as settled fact.
   */
  gradedBy?: { work: string; author: string };
  /** Hadiths ingested from this book. */
  hadithCount: number;
  /** Of those, how many yielded a usable isnad chain. */
  chainCount: number;
  /** Unique narrators appearing in this book's chains. */
  narratorCount: number;
  /**
   * This book's first hadith in the corpus-wide ordinal numbering the search
   * index uses. Assigned in manifest order and rewritten whenever the index is
   * rebuilt, so the two can never disagree.
   */
  ordinalBase: number;
  /** Directory holding this book's artefacts, relative to the data root. */
  dir: string;
  /** Number of `text-K.json` chunks written for this book. */
  textChunks: number;
  bytes: number;
  ingestedAt: string;
}

// ---------------------------------------------------------------------------
// Books & hadiths
// ---------------------------------------------------------------------------

export interface BookFile extends BookSummary {
  formatVersion: number;
  chapters: Chapter[];
  hadiths: HadithRecord[];
  /**
   * Per narrator, how many appearances in this book were a clear match against
   * the rijal database versus a close call: `[clear, uncertain]`.
   */
  identification: Record<string, [number, number]>;
  /**
   * Per narrator, the surface forms this book's chains name them by, with
   * counts. Held once per book rather than once per hadith — the same handful
   * of spellings recurs thousands of times.
   */
  surfaces: Record<string, Record<string, number>>;
}

export interface Chapter {
  id: number;
  en: string;
  ar: string;
}

export interface HadithRecord {
  /** Globally unique, `<bookSlug>:<ref>`. */
  id: string;
  /** Number within the book, as printed. */
  ref: number;
  chapterId?: number;
  /** Authenticity grading of the hadith itself, where the source provides one. */
  grade?: string;
  /**
   * Narrator ids in transmission order: index 0 heard it closest to the
   * Prophet, the last entry is the compiler's immediate teacher. The full
   * displayed path is PROPHET → chain[0] → … → chain[n] → collector.
   */
  chain: string[];
  /** The chain explicitly reached the Prophet ﷺ rather than running out. */
  toProphet: boolean;
  /** Index of the `text-K.json` chunk holding this hadith's text. */
  t: number;
}

/** Number of hadiths per text chunk. */
export const TEXT_CHUNK_SIZE = 400;

export interface HadithText {
  /** Arabic as transmitted: isnad followed by matn. */
  ar?: string;
  /** English translation. */
  en?: string;
  /** The "Narrated X:" attribution line from the English edition. */
  by?: string;
}

export interface TextChunkFile {
  formatVersion: number;
  chunk: number;
  texts: Record<string, HadithText>;
}

// ---------------------------------------------------------------------------
// Narrators
// ---------------------------------------------------------------------------

/** Registry entry — small, loaded up-front for every narrator in the corpus. */
export interface NarratorIndexEntry {
  id: string;
  /** Short label for the node, Arabic. */
  ar: string;
  /** Short label for the node, transliterated/English where known. */
  en?: string;
  grade: NarratorGrade;
  /**
   * Generation: 0 the Prophet, 1 the Companions, rising with distance. Settled
   * once for the whole corpus at ingest, so a narrator does not move when the
   * selection changes. Drives the vertical axis of the 3D layout.
   */
  gen: number;
  /** What settled it — see GENERATION_SOURCE_LABEL. */
  gf: GenerationSource;
  /** Position within the generation, 0 (senior) to 1 (junior), by death year. */
  sub: number;
  /** Death year in hijri, when known. */
  d?: number;
  /** Number of ingested hadiths this narrator appears in. */
  n: number;
  /** True when matched against the rijal database rather than parsed-only. */
  r: boolean;
  /** Set when most appearances were a close call between similar profiles. */
  amb?: boolean;
  /**
   * Named as a woman — read off `بنت`, an `أم` kunya, or the literature saying
   * so. See `tools/ingest/rijal/gender.ts` for what that does and does not
   * catch; it is a reading of the name, and the interface says so.
   */
  w?: boolean;
}

/** How a narrator's generation was arrived at. */
export type GenerationSource = 'chains' | 'tabaqa' | 'inferred' | 'position';

export const GENERATION_SOURCE_LABEL: Record<GenerationSource, string> = {
  chains: 'from the chains he appears in',
  tabaqa: "from Ibn Ḥajar's ṭabaqa",
  inferred: 'from the generations of those he transmitted with',
  position: 'from his position in chains that do not reach the Prophet',
};

export interface NarratorIndexFile {
  formatVersion: number;
  bioShards: number;
  narrators: NarratorIndexEntry[];
}

/** Full biography — lives in a shard, fetched when a narrator is opened. */
export interface NarratorBio {
  id: string;
  fullNameAr?: string;
  fullNameEn?: string;
  kunya?: string;
  laqab?: string;
  nasab?: string;
  city?: string;
  tabaqatAr?: string;
  gradeAr?: string;
  /** Death, as written in the source (may be prose, e.g. "in the caliphate of…"). */
  diedRaw?: string;
  /** Free-text note, where a curated one exists. */
  note?: string;
  /** Per-source verdicts from the classical rijal literature. */
  verdicts: RijalVerdict[];
  /** Name variants as they surface inside isnads. */
  variants?: string[];
  /** Narrator ids, restricted to those present in the ingested corpus. */
  teachers?: string[];
  students?: string[];
  /** Hadith ids this narrator appears in (capped — see MAX_BIO_HADITHS). */
  hadiths: string[];
  /** Per-book appearance counts. */
  books: Record<string, number>;
}

export interface RijalVerdict {
  /** Source key, e.g. `taqrib`. */
  key: string;
  /** Human-readable work title. */
  work: string;
  /** Author of the work. */
  author?: string;
  gradeEn?: NarratorGrade;
  gradeAr?: string;
}

export interface NarratorBioShard {
  formatVersion: number;
  shard: number;
  bios: Record<string, NarratorBio>;
}

/** Cap on hadith ids stored per narrator, to keep shards bounded. */
export const MAX_BIO_HADITHS = 500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stable shard assignment for a narrator id. */
export function bioShardFor(id: string, shards: number): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % shards;
}

export const GRADE_LABEL: Record<NarratorGrade, string> = {
  companion: 'Companion',
  reliable: 'Reliable',
  mostly_reliable: 'Mostly reliable',
  weak: 'Weak',
  abandoned: 'Abandoned',
  fabricator: 'Accused of forgery',
  unknown: 'Unassessed',
};

/** Palette shared by the 3D scene, the legend and the biography panel. */
export const GRADE_COLOR: Record<NarratorGrade, string> = {
  companion: '#d8b26a',
  reliable: '#4fc9a3',
  mostly_reliable: '#63b3e8',
  weak: '#e0a458',
  abandoned: '#e0685f',
  fabricator: '#c8496b',
  unknown: '#7d8496',
};
