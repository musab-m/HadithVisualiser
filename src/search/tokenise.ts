/**
 * Tokeniser for the full-text index.
 *
 * Shared by the builder (tools/ingest) and the browser, because an index is
 * only searchable if queries are broken up exactly the way the documents were.
 *
 * Arabic needs more than case folding. The same word appears with and without
 * vowel marks, with أ / ا / إ used interchangeably, with ة or ه, and with
 * conjunctions and the article fused onto the front — الأعمال, وأعمال and
 * بالأعمال are the same word for a reader looking for a wording. We strip that
 * surface variation off rather than attempt real morphology: the goal is to
 * find corroborating narrations, not to lemmatise.
 */

// Written as escapes rather than literal marks: a range that gets mangled
// here silently strips Arabic letters instead of vowel signs, and the only
// symptom is a tokeniser that returns nothing.
const DIACRITICS =
  /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g;
const TATWEEL = /\u0640/g;
const ARABIC = /[\u0600-\u06FF]/;

/** Function words that appear in nearly every hadith and select nothing. */
const ARABIC_STOPWORDS = new Set([
  'من',
  'عن',
  'على',
  'في',
  'الي',
  'ان',
  'انه',
  'انها',
  'ما',
  'لا',
  'له',
  'لهم',
  'به',
  'بها',
  'هو',
  'هي',
  'هذا',
  'هذه',
  'ذلك',
  'التي',
  'الذي',
  'الذين',
  'كان',
  'كانت',
  'قال',
  'قالت',
  'قد',
  'ثم',
  'او',
  'اذا',
  'الا',
  'حتي',
  'كل',
  'بن',
  'ابن',
  'الله',
  'حدثنا',
  'حدثني',
  'اخبرنا',
  'اخبرني',
  'سمعت',
  'رسول',
  'النبي',
  'صلي',
  'عليه',
  'وسلم',
  'رضي',
  'عنه',
  'عنها',
  // The same function words with a fused conjunction, which the prefix strip
  // leaves alone because they are too short to shorten safely.
  'ولا',
  'وان',
  'وما',
  'وهو',
  'وهي',
  'وفي',
  'ومن',
  'وعن',
  'وقال',
  'وقد',
  'فقال',
  'فلا',
  'فان',
  'وكان',
  'ليس',
  'وليس',
]);

const ENGLISH_STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'at',
  'by',
  'for',
  'from',
  'with',
  'that',
  'this',
  'these',
  'those',
  'is',
  'was',
  'were',
  'are',
  'be',
  'been',
  'has',
  'have',
  'had',
  'it',
  'its',
  'he',
  'she',
  'they',
  'them',
  'his',
  'her',
  'their',
  'we',
  'us',
  'our',
  'you',
  'your',
  'i',
  'me',
  'my',
  'as',
  'so',
  'if',
  'then',
  'than',
  'but',
  'not',
  'no',
  'said',
  'says',
  'narrated',
  'allah',
  'messenger',
  'prophet',
  'reported',
]);

/** Fold the orthographic variation that makes one word look like several. */
export function normaliseArabic(word: string): string {
  return word
    .replace(DIACRITICS, '')
    .replace(TATWEEL, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');
}

/**
 * Strip the clitics Arabic fuses onto the front of a word — the article ال and
 * the single-letter conjunctions and prepositions — but only where enough word
 * is left afterwards to still mean something.
 */
function stripPrefixes(word: string): string {
  let out = word;
  // و/ف/ب/ك/ل carry no content of their own when fused.
  if (out.length > 4 && /^[وفبكل]/.test(out)) out = out.slice(1);
  if (out.length > 4 && out.startsWith('ال')) out = out.slice(2);
  return out;
}

/** Split text into the index's terms, in order, with duplicates preserved. */
export function tokenise(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  // Vowel marks are combining marks, not letters, so they have to come off
  // before the split — otherwise every harakat reads as a word boundary and
  // a fully vowelled text shatters into two- and three-letter fragments.
  const plain = text.replace(DIACRITICS, '').replace(TATWEEL, '');
  for (const raw of plain.split(/[^\p{L}\p{N}]+/u)) {
    if (!raw) continue;
    // Verse and page numbers carried by the translations are not wording.
    if (!/\p{L}/u.test(raw)) continue;
    if (ARABIC.test(raw)) {
      const word = stripPrefixes(normaliseArabic(raw));
      if (word.length < 3 || ARABIC_STOPWORDS.has(word)) continue;
      out.push(word);
    } else {
      const word = raw.toLowerCase();
      if (word.length < 3 || ENGLISH_STOPWORDS.has(word)) continue;
      out.push(word);
    }
  }
  return out;
}

/**
 * Adjacent pairs of terms. Indexing these lets a phrase be matched without
 * storing a position for every occurrence: `الأعمال بالنيات` is the pair, and
 * a document containing both words far apart will not carry it.
 */
export function bigrams(terms: string[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < terms.length; i++) out.push(`${terms[i - 1]} ${terms[i]}`);
  return out;
}

/** Stable shard assignment for a term. */
export function shardFor(term: string, shards: number): number {
  let h = 2166136261;
  for (let i = 0; i < term.length; i++) {
    h ^= term.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % shards;
}
