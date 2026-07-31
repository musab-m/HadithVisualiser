/**
 * Fetches corpus artefacts, once each. Books, text chunks and biography shards
 * are all loaded lazily so opening the app costs one small manifest and the
 * narrator registry, whatever the size of the corpus.
 */

import {
  bioShardFor,
  type BookFile,
  type CorpusManifest,
  type HadithText,
  type NarratorBio,
  type NarratorBioShard,
  type NarratorIndexEntry,
  type NarratorIndexFile,
  type TextChunkFile,
} from './types';

const BASE = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/data`;

const inflight = new Map<string, Promise<unknown>>();

/** De-duplicated JSON fetch: two callers asking at once share one request. */
function load<T>(path: string): Promise<T> {
  const existing = inflight.get(path);
  if (existing) return existing as Promise<T>;
  const request = fetch(`${BASE}/${path}`).then((response) => {
    if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`);
    return response.json() as Promise<T>;
  });
  inflight.set(path, request);
  return request;
}

export function loadManifest(): Promise<CorpusManifest> {
  return load<CorpusManifest>('manifest.json');
}

export async function loadNarratorIndex(): Promise<Map<string, NarratorIndexEntry>> {
  const file = await load<NarratorIndexFile>('narrators/index.json');
  return new Map(file.narrators.map((entry) => [entry.id, entry]));
}

export function loadBook(slug: string): Promise<BookFile> {
  return load<BookFile>(`books/${slug}/index.json`);
}

export async function loadText(slug: string, chunk: number): Promise<Record<string, HadithText>> {
  const file = await load<TextChunkFile>(`books/${slug}/text-${chunk}.json`);
  return file.texts;
}

export async function loadBio(id: string, shards: number): Promise<NarratorBio | undefined> {
  const file = await load<NarratorBioShard>(`narrators/bio-${bioShardFor(id, shards)}.json`);
  return file.bios[id];
}
