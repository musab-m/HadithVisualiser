/**
 * Fetches corpus artefacts, once each. Books, text chunks and biography shards
 * are all loaded lazily so opening the app costs one small manifest and the
 * narrator registry, whatever the size of the corpus.
 *
 * Every artefact lives at a fixed path, and an ingest rewrites the contents of
 * those paths without changing one of them. A browser holding `bio-7.json` from
 * a previous corpus therefore has no reason to ask for it again, and will show
 * a narrator as the corpus described him a month ago — which is how a
 * biography that had gained an entry in Taqrīb went on rendering without one.
 *
 * So the two files fetched at boot are revalidated on every load, and
 * everything fetched after them is asked for under the stamp the manifest
 * carries. The lazy files are the large ones; keying them by the stamp is what
 * lets them be cached hard and still never be stale.
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

function fetchJson<T>(url: string, path: string, init?: RequestInit): Promise<T> {
  return fetch(url, init).then((response) => {
    if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`);
    return response.json() as Promise<T>;
  });
}

/**
 * The small files the app cannot start without.
 *
 * `no-cache` is not `no-store`: the copy on disk is kept and offered back with
 * its validator, so an unchanged corpus costs a 304 rather than the megabyte.
 */
function loadFresh<T>(path: string): Promise<T> {
  const existing = inflight.get(path);
  if (existing) return existing as Promise<T>;
  const request = fetchJson<T>(`${BASE}/${path}`, path, { cache: 'no-cache' });
  inflight.set(path, request);
  return request;
}

/**
 * Everything else, under the corpus stamp.
 *
 * These are all fetched in response to something the reader did — opening a
 * collection, a hadith, a narrator — so the manifest has long since arrived and
 * waiting on it costs nothing.
 */
function load<T>(path: string): Promise<T> {
  const existing = inflight.get(path);
  if (existing) return existing as Promise<T>;
  const request = loadManifest().then((manifest) =>
    fetchJson<T>(`${BASE}/${path}?v=${encodeURIComponent(manifest.generatedAt)}`, path),
  );
  inflight.set(path, request);
  return request;
}

export function loadManifest(): Promise<CorpusManifest> {
  return loadFresh<CorpusManifest>('manifest.json');
}

export async function loadNarratorIndex(): Promise<Map<string, NarratorIndexEntry>> {
  const file = await loadFresh<NarratorIndexFile>('narrators/index.json');
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
