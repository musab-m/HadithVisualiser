/** Arabic text utilities shared by the isnad parser and the rijal matcher. */

/**
 * Combining marks: harakat, tanwin, superscript alef, Quranic annotation signs.
 *
 * Written as escapes rather than as the marks themselves. A range that slips
 * here strips Arabic letters instead of vowel signs, and nothing announces it —
 * names simply stop matching.
 */
const DIACRITICS =
  /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g;
const TATWEEL = /\u0640/g;

/**
 * Arabic *letters*, as a character-class body.
 *
 * Deliberately not the Arabic block: that also carries the script's own
 * punctuation — the comma ، is U+060C — and treating punctuation as part of a
 * word makes `ابن، وهب` a different name from `ابن وهب` and puts a word
 * boundary in the wrong place.
 */
export const AR_LETTERS = 'ء-غـ-يٮ-ۓەۥۦۮۯۺ-ۿ';

/** Strip vowel marks and the kashida used for typographic stretching. */
export function stripDiacritics(text: string): string {
  return text.replace(DIACRITICS, '').replace(TATWEEL, '');
}

/**
 * Aggressive form used only as a lookup key: collapses the orthographic
 * variation that makes the same name in two books look like two names.
 */
export function normaliseKey(text: string): string {
  return stripDiacritics(text)
    .replace(/[آأإٱ]/g, 'ا') // آ أ إ ٱ -> ا
    .replace(/ى/g, 'ي') // ى -> ي
    .replace(/ة/g, 'ه') // ة -> ه
    .replace(/ؤ/g, 'و') // ؤ -> و
    .replace(/ئ/g, 'ي') // ئ -> ي
    .replace(new RegExp(`[^${AR_LETTERS}\\s]`, 'gu'), ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Honorific formulae, removed before a span is treated as a name. */
const HONORIFICS: RegExp[] = [
  /\s*صلى\s*الله\s*عليه\s*و\s*(?:آله\s*و\s*)?سلم\s*/g,
  /\s*صلعم\s*/g,
  /\s*رض[يى]\s*الله\s*(?:تعالى\s*)?عنه[مان]*\s*/g,
  /\s*عليه[ما]*\s*السلام\s*/g,
  /\s*رحمه\s*الله\s*/g,
  /\s*عز\s*و\s*جل\s*/g,
  /\s*تبارك\s*و\s*تعالى\s*/g,
  /[ؐ-ؔﷺﷻ۝]/g, // ؐ ؑ ؒ ؓ ﷺ ﷻ
];

export function stripHonorifics(text: string): string {
  let out = text;
  for (const re of HONORIFICS) out = out.replace(re, ' ');
  return out.replace(/\s+/g, ' ').trim();
}

/** Editorial marks: dashes, brackets, quotes and the ﴿ ﴾ verse markers. */
export function stripEditorial(text: string): string {
  return text
    .replace(/[،؛]/g, '،')
    .replace(/[«»"'‘’“”()\[\]{}﴿﴾]/g, ' ')
    .replace(/\s*[-–—ـ]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract a hijri death year from the assorted prose forms the sources use. */
export function parseDeathYear(raw: unknown): number | undefined {
  if (raw == null) return undefined;
  const text = String(raw);
  // Arabic-Indic digits to ASCII.
  const ascii = text.replace(/[٠-٩]/g, (d) =>
    String(d.charCodeAt(0) - 0x0660),
  );
  const match = ascii.match(/\d{1,4}(?:\.\d+)?/);
  if (!match) return undefined;
  const year = Math.round(Number(match[0]));
  // Reject obvious non-years: the corpus tops out well before 1500 AH.
  if (!Number.isFinite(year) || year <= 0 || year > 1500) return undefined;
  return year;
}
