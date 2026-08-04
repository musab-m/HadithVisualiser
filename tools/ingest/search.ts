/**
 * Builds the full-text index.
 *
 * The point of searching this corpus is not to find a hadith — the numbers do
 * that — but to find every place a wording was reported, so the chains behind
 * it can be looked at together. That makes recall matter more than precision,
 * and makes the unit of interest a set of hadiths rather than a best match.
 *
 * The index is an ordinary inverted index over single words, plus the pairs of
 * adjacent words that recur. The pairs are what make a phrase query sharp
 * without storing a position for every occurrence: a hadith carrying `الأعمال`
 * and `بالنيات` in different sentences does not carry the pair. Pairs found in
 * only one or two hadiths are dropped — a wording reported that rarely needs no
 * help being narrowed down, and pairs would otherwise dominate the index.
 *
 * Ordinals are assigned across the whole corpus in manifest order, so this is
 * rebuilt whenever books are added, alongside the narrator registry.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CORPUS_FORMAT_VERSION,
  type BookFile,
  type BookSummary,
  type SearchShardFile,
  type SearchSummary,
  type TextChunkFile,
} from '../../src/corpus/types.js';
import { bigrams, shardFor, tokenise } from '../../src/search/tokenise.js';
import { writeJson } from './emit.js';

/** Enough shards that a query pulls a small slice of the index. */
const SHARDS = 64;

/**
 * Terms in more hadiths than this select nothing useful and cost the most to
 * ship. At 12% of the corpus a word is doing no narrowing.
 */
const MAX_DOCUMENT_FRACTION = 0.12;

/** Adjacent pairs are only worth storing once a wording actually recurs. */
const MIN_PAIR_DOCUMENTS = 3;

export function rebuildSearchIndex(dataDir: string, books: BookSummary[]): SearchSummary {
  const postings = new Map<string, number[]>();
  let ordinal = 0;

  const add = (term: string, at: number) => {
    const list = postings.get(term);
    // Documents arrive in ordinal order, so a repeat is the same hadith again.
    if (list) {
      if (list[list.length - 1] !== at) list.push(at);
    } else {
      postings.set(term, [at]);
    }
  };

  for (const summary of books) {
    const book = JSON.parse(
      readFileSync(join(dataDir, summary.dir, 'index.json'), 'utf8'),
    ) as BookFile;

    // Texts are chunked; read each chunk once and index the hadiths in it.
    const texts = new Map<string, string>();
    for (let chunk = 0; chunk < summary.textChunks; chunk++) {
      const file = JSON.parse(
        readFileSync(join(dataDir, summary.dir, `text-${chunk}.json`), 'utf8'),
      ) as TextChunkFile;
      for (const [id, text] of Object.entries(file.texts)) {
        texts.set(id, `${text.ar ?? ''}\n${text.en ?? ''}`);
      }
    }

    for (const hadith of book.hadiths) {
      const at = ordinal++;
      const terms = tokenise(texts.get(hadith.id) ?? '');
      for (const term of terms) add(term, at);
      const seen = new Set<string>();
      for (const pair of bigrams(terms)) {
        if (seen.has(pair)) continue;
        seen.add(pair);
        add(pair, at);
      }
    }
  }

  const docs = ordinal;
  const ceiling = Math.max(200, Math.floor(docs * MAX_DOCUMENT_FRACTION));

  const shards: SearchShardFile[] = Array.from({ length: SHARDS }, (_, shard) => ({
    formatVersion: CORPUS_FORMAT_VERSION,
    shard,
    postings: {},
  }));

  let kept = 0;
  for (const [term, list] of postings) {
    const isPair = term.includes(' ');
    // A pair carried by one or two hadiths adds an entry and finds nothing the
    // words alone miss; a wording reported that rarely needs no help being
    // narrowed down. Pairs are most of the index, so the floor matters.
    if (isPair && list.length < MIN_PAIR_DOCUMENTS) continue;
    if (list.length > ceiling) continue;
    kept++;
    // Delta encode: postings are ascending, and the gaps are far smaller than
    // the ordinals, which is most of the file size once gzipped.
    const deltas = new Array<number>(list.length);
    let previous = 0;
    for (let i = 0; i < list.length; i++) {
      deltas[i] = list[i] - previous;
      previous = list[i];
    }
    shards[shardFor(term, SHARDS)].postings[term] = deltas;
  }

  for (const shard of shards) {
    writeJson(join(dataDir, 'search', `shard-${shard.shard}.json`), shard);
  }

  return { shards: SHARDS, docs, terms: kept };
}
