import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Write JSON, creating parent directories. Compact — these files ship. */
export function writeJson(path: string, value: unknown): number {
  mkdirSync(dirname(path), { recursive: true });
  const body = JSON.stringify(value);
  writeFileSync(path, body);
  return Buffer.byteLength(body);
}

/**
 * Delete the numbered files a rebuild no longer writes.
 *
 * Every shard count here is derived from the size of the corpus, and until now
 * the corpus only ever grew, so a rebuild overwrote all of them and the
 * question never came up. Taking a collection out shrinks it: 8,123 narrators
 * sharded into 21, 7,589 into 19, and the last two sat there afterwards holding
 * biographies of people no longer in the registry. Nothing would have served
 * them — the manifest says how many there are, and the loader asks for that
 * many — but they would have been deployed, and a stale file that is merely
 * unreachable is one edit away from being read.
 */
export function pruneShards(dir: string, prefix: string, kept: number): number {
  if (!existsSync(dir)) return 0;
  let removed = 0;
  for (const name of readdirSync(dir)) {
    const at = name.startsWith(prefix) && name.endsWith('.json')
      ? Number(name.slice(prefix.length, -'.json'.length))
      : NaN;
    if (!Number.isInteger(at) || at < kept) continue;
    rmSync(join(dir, name));
    removed++;
  }
  return removed;
}
