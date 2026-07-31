/** Cached HTTP fetching. Re-running the ingester never re-downloads a source. */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface FetchOptions {
  cacheDir: string;
  /** Ignore any cached copy and fetch afresh. */
  refresh?: boolean;
  /** Network attempts before giving up. */
  retries?: number;
}

function cachePath(cacheDir: string, url: string): string {
  const hash = createHash('sha1').update(url).digest('hex').slice(0, 16);
  const name = url.split('/').slice(-2).join('_').replace(/[^\w.-]/g, '_');
  return join(cacheDir, `${name}-${hash}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchCached(url: string, options: FetchOptions): Promise<string> {
  const { cacheDir, refresh = false, retries = 4 } = options;
  mkdirSync(cacheDir, { recursive: true });
  const path = cachePath(cacheDir, url);
  if (!refresh && existsSync(path)) return readFileSync(path, 'utf8');

  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) await sleep(2000 * 2 ** (attempt - 1));
    try {
      const response = await fetch(url);
      if (!response.ok) {
        // A 404 will not fix itself; anything else might.
        if (response.status === 404) throw new Error(`404 Not Found: ${url}`);
        lastError = new Error(`HTTP ${response.status} for ${url}`);
        continue;
      }
      const body = await response.text();
      writeFileSync(path, body);
      return body;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('404')) throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
}

export async function fetchJson<T>(url: string, options: FetchOptions): Promise<T> {
  return JSON.parse(await fetchCached(url, options)) as T;
}

/** Run `worker` over `items` with a bounded number in flight. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}
