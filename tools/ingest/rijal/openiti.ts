/**
 * Reading the classical works themselves.
 *
 * The rijāl database gives one word of each critic's verdict — `ثقة حافظ` —
 * because that is all Itqan extracted. The works are published in full by
 * [OpenITI](https://github.com/OpenITI), machine-readable and in Arabic, and
 * this reads the entries out of them so a reader can see the sentence rather
 * than the word lifted out of it.
 *
 * OpenITI marks a biography with `### $` and continues it on `~~` lines:
 *
 *     ### $ 3 أحمد بن إبراهيم بن كثير بن زيد الدورقي النكري بضم النون البغدادي ثقة
 *     ~~حافظ من العاشرة مات سنة ست وأربعين م د ت ق
 *
 * `### $$$` marks a cross-reference — «أحمد بن إبراهيم التيمي صوابه إبراهيم بن
 * محمد» — which points at another entry rather than being one, so it is left
 * out.
 *
 * Only the versions OpenITI marks `.completed` carry this markup; the plain
 * ones are undifferentiated paragraphs. The version is recorded with the text
 * so what is shown can always be attributed to the edition it came from.
 */

import { normaliseKey } from '../isnad/arabic.js';

export interface Biography {
  /** The number the edition prints against the entry. */
  n: number;
  /** The entry as written, one line. */
  text: string;
}

const HEAD = /^### \$ (\d+)\s*(.*)$/;

export function parseBiographies(source: string): Biography[] {
  const out: Biography[] = [];
  let n: number | undefined;
  let buffer: string[] = [];

  const flush = () => {
    if (n !== undefined) {
      const text = buffer.join(' ').replace(/\s+/g, ' ').trim();
      if (text) out.push({ n, text });
    }
    n = undefined;
    buffer = [];
  };

  for (const line of source.split('\n')) {
    const head = HEAD.exec(line);
    if (head) {
      flush();
      n = Number(head[1]);
      buffer = [head[2]];
      continue;
    }
    // A continuation belongs to the entry; anything else ends it.
    if (n !== undefined && line.startsWith('~~')) buffer.push(line.slice(2));
    else if (n !== undefined && line.startsWith('#')) flush();
  }
  flush();
  return out;
}

/**
 * Page markers the scan carries — `ms239`, `PageV01P123` — which belong to the
 * printed edition rather than to what Ibn Ḥajar wrote.
 */
const PAGE = /\b(?:ms\d+|PageV\d+P\d+|Page\d+)\b/g;

export function cleanEntry(text: string): string {
  return text.replace(PAGE, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * The words an entry opens with, normalised, for matching against a name.
 *
 * Taqrīb writes the name first and the judgement after it, so the front of the
 * entry is the identification and everything past it is the assessment. Twelve
 * words is longer than any name the database holds and short enough that a
 * verdict never reaches back into it.
 */
export const HEAD_WORDS = 12;

export function headOf(text: string): string[] {
  return normaliseKey(cleanEntry(text)).split(' ').filter(Boolean).slice(0, HEAD_WORDS);
}
