/**
 * Querying the full-text index from the browser.
 *
 * A query is matched loosely on purpose. Someone looking for a wording is
 * asking "where else was this reported", and translations vary — insisting
 * that every word be present would hide exactly the corroborating narrations
 * the question is about. So a hadith qualifies on most of the query's words,
 * and the adjacent pairs decide the order, which puts the narrations carrying
 * the phrase itself at the top.
 */

import type { BookFile, SearchShardFile, SearchSummary } from '../corpus/types';
import { bigrams, shardFor, tokenise } from './tokenise';

const BASE = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/data`;

const shards = new Map<number, Promise<SearchShardFile>>();

function loadShard(shard: number): Promise<SearchShardFile> {
  let existing = shards.get(shard);
  if (!existing) {
    existing = fetch(`${BASE}/search/shard-${shard}.json`).then((response) => {
      if (!response.ok) throw new Error(`Could not load search shard ${shard}`);
      return response.json() as Promise<SearchShardFile>;
    });
    shards.set(shard, existing);
  }
  return existing;
}

/** Postings are stored as ascending gaps; walk them back to ordinals. */
function decode(deltas: number[]): number[] {
  const out = new Array<number>(deltas.length);
  let running = 0;
  for (let i = 0; i < deltas.length; i++) {
    running += deltas[i];
    out[i] = running;
  }
  return out;
}

export interface SearchResult {
  /** The query as the index understands it. */
  terms: string[];
  /** Terms that appear nowhere in the corpus, or everywhere and so were dropped. */
  unindexed: string[];
  /** Matching hadith ids, best first. */
  ids: string[];
  /** How many hadiths matched, before any cap. */
  total: number;
  /** Of those, how many carry the query as a phrase rather than scattered words. */
  phrase: number;
}

/** Beyond this the list stops being something a person reads. */
const MAX_RESULTS = 2000;

/** How much of a multi-word query a hadith has to carry to count. */
const MATCH_FRACTION = 0.6;

export async function search(
  query: string,
  summary: SearchSummary,
  books: Map<string, BookFile>,
): Promise<SearchResult> {
  const terms = [...new Set(tokenise(query))];
  const empty: SearchResult = { terms, unindexed: [], ids: [], total: 0, phrase: 0 };
  if (!terms.length) return empty;

  const pairs = [...new Set(bigrams(tokenise(query)))];
  const wanted = [...terms, ...pairs];
  const needed = new Set(wanted.map((term) => shardFor(term, summary.shards)));
  const loaded = new Map<number, SearchShardFile>();
  await Promise.all(
    [...needed].map(async (shard) => loaded.set(shard, await loadShard(shard))),
  );

  const postingsFor = (term: string): number[] | undefined => {
    const shard = loaded.get(shardFor(term, summary.shards));
    const deltas = shard?.postings[term];
    return deltas ? decode(deltas) : undefined;
  };

  // How many of the query's words each hadith carries.
  const hits = new Map<number, number>();
  const unindexed: string[] = [];
  let usable = 0;
  for (const term of terms) {
    const postings = postingsFor(term);
    if (!postings) {
      unindexed.push(term);
      continue;
    }
    usable++;
    for (const ordinal of postings) hits.set(ordinal, (hits.get(ordinal) ?? 0) + 1);
  }
  if (!usable) return { ...empty, unindexed };

  // Pairs are the phrase signal, and weigh more than a word on its own.
  const phrases = new Map<number, number>();
  for (const pair of pairs) {
    const postings = postingsFor(pair);
    if (!postings) continue;
    for (const ordinal of postings) phrases.set(ordinal, (phrases.get(ordinal) ?? 0) + 1);
  }

  // Most of the words, not all. The same statement is often transmitted with
  // a word changed — `بالنية` for `بالنيات`, a different English rendering —
  // and demanding every term would hide exactly the corroborations being
  // looked for. The pair scoring below still floats the exact wording to top.
  const threshold = Math.max(1, Math.ceil(usable * MATCH_FRACTION));

  const scored: { ordinal: number; score: number }[] = [];
  let phrase = 0;
  for (const [ordinal, matched] of hits) {
    if (matched < threshold) continue;
    const pairsHit = phrases.get(ordinal) ?? 0;
    if (pairsHit) phrase++;
    scored.push({ ordinal, score: matched + pairsHit * 2 });
  }
  scored.sort((a, b) => b.score - a.score || a.ordinal - b.ordinal);

  const locate = ordinalLocator(books);
  const ids: string[] = [];
  for (const { ordinal } of scored.slice(0, MAX_RESULTS)) {
    const id = locate(ordinal);
    if (id) ids.push(id);
  }

  return { terms, unindexed, ids, total: scored.length, phrase };
}

/**
 * Ordinals run across the whole corpus in manifest order; each book records
 * where its own run starts. Resolve by binary search over those starts.
 */
function ordinalLocator(books: Map<string, BookFile>): (ordinal: number) => string | undefined {
  const ordered = [...books.values()].sort((a, b) => a.ordinalBase - b.ordinalBase);
  return (ordinal: number) => {
    let low = 0;
    let high = ordered.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (ordered[mid].ordinalBase <= ordinal) low = mid;
      else high = mid - 1;
    }
    const book = ordered[low];
    if (!book) return undefined;
    return book.hadiths[ordinal - book.ordinalBase]?.id;
  };
}
