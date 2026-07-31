/**
 * Lookup tables for the references an isnad makes to people it does not name:
 * `عن أبيه` ("from his father"), `عن جده`, `عن أمه`, `عن عمه`.
 *
 * Vendored from the Itqan project, which compiled them from Ibn Ḥajar's
 * Taqrīb al-Tahdhīb. Keys are the narrator doing the transmitting; values are
 * the relative meant.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normaliseKey } from './arabic.js';
import type { RelativeMaps } from './parse.js';

/** Kunya (`أبو هريرة`) to the person's given name and a one-line note. */
export interface KunyaEntry {
  real?: string;
  en?: string;
  note?: string;
}

function loadStringMap(path: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!existsSync(path)) return map;
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith('_') || typeof value !== 'string') continue;
    map.set(normaliseKey(key), value);
  }
  return map;
}

export function loadRelativeMaps(dir: string): RelativeMaps {
  return {
    father: loadStringMap(join(dir, 'isnad_father_map.json')),
    grandfather: loadStringMap(join(dir, 'isnad_grandfather_map.json')),
    mother: loadStringMap(join(dir, 'isnad_mother_map.json')),
    grandmother: loadStringMap(join(dir, 'isnad_grandmother_map.json')),
    uncle: loadStringMap(join(dir, 'isnad_uncle_map.json')),
  };
}

export function loadKunyaMap(dir: string): Map<string, KunyaEntry> {
  const map = new Map<string, KunyaEntry>();
  const path = join(dir, 'isnad_kunya_map.json');
  if (!existsSync(path)) return map;
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith('_') || typeof value !== 'object' || value === null) continue;
    map.set(normaliseKey(key), value as KunyaEntry);
  }
  return map;
}
