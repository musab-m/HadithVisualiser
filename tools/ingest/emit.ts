import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Write JSON, creating parent directories. Compact — these files ship. */
export function writeJson(path: string, value: unknown): number {
  mkdirSync(dirname(path), { recursive: true });
  const body = JSON.stringify(value);
  writeFileSync(path, body);
  return Buffer.byteLength(body);
}
