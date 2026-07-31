/**
 * Isnad parser.
 *
 * Classical hadith texts open with the chain of transmission before the matn
 * (the report itself). The chain is expressed with a small, stable vocabulary
 * of transmission verbs:
 *
 *   حدثنا فلان، قال: أخبرنا فلان، عن فلان، عن فلان، أن رسول الله ﷺ قال: …
 *
 * We walk those verbs, take the span after each one as a narrator, and stop
 * when the chain reaches the Prophet ﷺ or when a span stops looking like a
 * name — which is how we detect that the isnad has ended and the matn has
 * begun. The result is the isnad in *compiler-first* order (the compiler's own
 * teacher first, the Companion last); the ingester reverses it for display.
 *
 * This is a heuristic over unstructured prose, not a parse of a formal grammar.
 * Every parsed surface form is kept alongside the resolved chain so the UI can
 * always show what a reading was based on.
 */

import { stripDiacritics, stripEditorial, stripHonorifics, normaliseKey } from './arabic.js';

/** Lookup tables for `عن أبيه` / `عن جده` style references. */
export interface RelativeMaps {
  father: Map<string, string>;
  grandfather: Map<string, string>;
  mother: Map<string, string>;
  grandmother: Map<string, string>;
  uncle: Map<string, string>;
}

export const EMPTY_RELATIVE_MAPS: RelativeMaps = {
  father: new Map(),
  grandfather: new Map(),
  mother: new Map(),
  grandmother: new Map(),
  uncle: new Map(),
};

export interface ParsedIsnad {
  /** Surface forms in compiler-first order. */
  names: string[];
  /** The chain explicitly reached the Prophet ﷺ. */
  reachedProphet: boolean;
  /** Parsing stopped early at a tahwil (ح) marking a second parallel chain. */
  truncatedAtTahwil: boolean;
}

// Alef and ya variants are spelled inconsistently across editions, so the
// patterns accept the alternatives rather than normalising the text first
// (normalising would merge the preposition على into the name علي).
const A = '[أاإآ]';
const Y = '[يى]';
const AR = '؀-ۿ';

/**
 * `أن فلانا أخبره` and `أن فلانا قال` put the narrator *before* the verb.
 * Rewriting them into the ordinary `عن فلان` form lets the single forward
 * scan below handle them.
 */
const BACKWARD_RE = new RegExp(
  `(?<![${AR}])(?:${A}ن|${A}نه)\\s+([^،؛\\n]{3,60}?)\\s*،?\\s*(?:${A}خبره|${A}خبرهم|${A}خبرها|حدثه|حدثهم|حدثها|قال|قالت)(?![${AR}])`,
  'gu',
);

/**
 * `أن فلانا قال` is a transmission link only when the subject is a person the
 * chain is passing through. In the matn the same shape introduces the story's
 * cast (`أن الحارث بن هشام سأل رسول الله`), so the capture has to read as a
 * bare name before we rewrite it.
 */
function rewriteBackward(text: string): string {
  return text.replace(BACKWARD_RE, (match, subject: string) => {
    const name = cleanName(subject);
    if (!name || PROPHET_RE.test(name) || !looksLikeName(name)) return match;
    return `عن ${name}، `;
  });
}

const VERB_SOURCES = [
  'حدثنا',
  'حدثني',
  'حدثتنا',
  'حدثتني',
  `${A}خبرنا`,
  `${A}خبرني`,
  `${A}خبرتنا`,
  `${A}خبرتني`,
  `${A}نب${A}نا`,
  `${A}نب${A}ني`,
  'سمعت',
  'سمعنا',
  'سمع',
  'ثنا',
  `قر${A}ت على`,
  `بلغني عن`,
  `بلغه عن`,
  'عن',
];

// The optional و/ف picks up `وأخبرني` and `فحدثنا`, which editions attach
// directly to the verb.
const VERB_RE = new RegExp(
  `(?<![${AR}])[وف]?(?:${VERB_SOURCES.join('|')})(?![${AR}])\\s*[:؛]?\\s*`,
  'gu',
);

/** Words and punctuation that terminate a narrator span. */
const SEGMENT_END_RE = new RegExp(
  `[،؛,\\n"«»]|(?<![${AR}])(?:قال|قالت|قالوا|${A}نه|${A}نها|${A}نهم|${A}ن|يقول|تقول|يحدث|تحدث|يقولون|كان|كانت|قر${A}|سمعته|بينا|بينما)(?![${AR}])`,
  'u',
);

/**
 * Prepositions that never begin a narrator's name but often trail one
 * (`عمر بن الخطاب على المنبر`). Only cut on these once a word has been seen,
 * so the name علي is never mistaken for the preposition على.
 */
const TRAILING_CUT_RE = new RegExp(
  `(?<![${AR}])(?:على|في|عند|وهو|وهي|يومئذ|حين|لما|حتى|منذ|قبل|بعد)(?![${AR}])`,
  'u',
);

/** References to the Prophet ﷺ — the terminal node of every chain. */
const PROPHET_RE = new RegExp(
  `(?<![${AR}])(?:رسول\\s+الله|النب${Y}|نب${Y}\\s+الله|رسول\\s+رب)(?![${AR}])`,
  'u',
);

/** Tahwil: the compiler's mark that a second, parallel chain follows. */
const TAHWIL_RE = new RegExp(`(?<![${AR}])ح(?![${AR}])`, 'u');

/** Spans that are grammar or anonymity, not identifiable transmitters. */
const NOT_A_NAME = new Set(
  [
    'الله',
    'رسول',
    'النبي',
    'نبي',
    'ذلك',
    'هذا',
    'هذه',
    'كان',
    'قال',
    'غير',
    'بعض',
    'رجل',
    'رجال',
    'قوم',
    'ناس',
    'امراه',
    'اصحاب',
    'اصحابه',
    'جماعه',
    'شيخ',
    'غيره',
    'غيرهم',
    'نحوه',
    'مثله',
    'هؤلاء',
    'واحد',
    'اخرين',
    'نفر',
    'اناس',
  ].map(normaliseKey),
);

/**
 * Function words that do not occur inside a transmitter's name. Their presence
 * means the span is narrative — i.e. we have crossed into the matn.
 */
const NARRATIVE_TOKENS = new Set([
  'التي',
  'الذي',
  'الذين',
  'ثم',
  'اذا',
  'اذ',
  'لم',
  'لن',
  'قد',
  'كل',
  'منه',
  'اليه',
  'عليه',
  'لهم',
  'ايكم',
  'انا',
  'نحن',
  'هم',
  'ارسل',
  'فقال',
  'فقلت',
  'قلت',
  'يزعم',
  'فاذا',
  'حدثه',
  'مع',
  'الي',
  'الا',
  'او',
]);

/** Kin references that need the preceding narrator to resolve. */
const KIN: Record<string, keyof RelativeMaps> = {
  ابيه: 'father',
  ابي: 'father',
  جده: 'grandfather',
  جدي: 'grandfather',
  امه: 'mother',
  امي: 'mother',
  جدته: 'grandmother',
  جدتي: 'grandmother',
  عمه: 'uncle',
  عمي: 'uncle',
};

/** Kin words we cannot resolve to a person; the link is dropped. */
const UNRESOLVABLE_KIN = new Set(
  [
    'اخيه',
    'اخي',
    'اخته',
    'اختي',
    'خاله',
    'خالي',
    'خالته',
    'ابنه',
    'ابني',
    'ابنته',
    'زوجها',
    'زوجته',
    'مولاه',
    'مولاي',
    'مولاته',
    'مولاها',
    'عمته',
  ].map(normaliseKey),
);

const MAX_CHAIN = 16;
const MAX_NAME_WORDS = 9;

/** Trim a raw span down to something that could be a name. */
function cleanName(span: string): string {
  let name = stripEditorial(stripHonorifics(span));
  name = name.replace(/^(?:و|ف|ثم|قد)\s+/u, '');
  name = name.replace(/\s+(?:قال|قالت|رحمه|يقول)\s*$/u, '');
  // Adverbs an editor appends when the same narrator recurs.
  name = name.replace(/\s+(?:[أا]يضا|جميعا|معا|كلاهما|كلهم)\s*$/u, '');
  name = name.replace(/^\s*عن\s+/u, '');
  name = name.replace(/\s+و\s*$/u, '');
  return name.trim();
}

/** Cut a trailing prepositional phrase, but never at the first word. */
function cutTrailingPhrase(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  for (let i = 1; i < words.length; i++) {
    if (TRAILING_CUT_RE.test(words[i]) && TRAILING_CUT_RE.exec(words[i])?.[0] === words[i]) {
      return words.slice(0, i).join(' ');
    }
  }
  return name;
}

/** Does this span read as a person rather than as narrative prose? */
function looksLikeName(name: string): boolean {
  const key = normaliseKey(name);
  if (key.length < 3) return false;
  if (NOT_A_NAME.has(key)) return false;
  if (/\d/.test(key)) return false;
  const words = key.split(' ').filter(Boolean);
  if (words.length > MAX_NAME_WORDS) return false;
  for (const w of words) if (NARRATIVE_TOKENS.has(w)) return false;
  return true;
}

export interface ParseOptions {
  maps?: RelativeMaps;
  /**
   * Optional check against the rijal name vocabulary. Once a chain is under
   * way, a span that is attested nowhere in the biographical literature and
   * carries no Arabic name marker is taken as the start of the matn.
   */
  attested?: (name: string) => boolean;
}

/** `بن`/`بنت`, a kunya, a theophoric `عبد ال-`, or a nisba ending in ـي. */
function hasNameMarker(key: string): boolean {
  const words = key.split(' ').filter(Boolean);
  if (words.some((w) => w === 'بن' || w === 'ابن' || w === 'بنت')) return true;
  if (words[0] === 'ابو' || words[0] === 'ابي' || words[0] === 'ام') return true;
  if (words[0] === 'عبد') return true;
  return words.length === 1 && words[0].endsWith('ي') && words[0].startsWith('ال');
}

export function parseIsnad(arabic: string, options: ParseOptions = {}): ParsedIsnad {
  const maps = options.maps ?? EMPTY_RELATIVE_MAPS;
  const attested = options.attested;
  let text = stripHonorifics(stripDiacritics(arabic ?? ''));
  if (!text) return { names: [], reachedProphet: false, truncatedAtTahwil: false };
  text = rewriteBackward(text);

  // Collect every transmission verb first; a narrator span runs from the end
  // of one verb to the start of the next.
  const verbs: { start: number; end: number }[] = [];
  VERB_RE.lastIndex = 0;
  for (let m = VERB_RE.exec(text); m; m = VERB_RE.exec(text)) {
    verbs.push({ start: m.index, end: m.index + m[0].length });
  }

  const names: string[] = [];
  let reachedProphet = false;
  let truncatedAtTahwil = false;

  for (let i = 0; i < verbs.length && names.length < MAX_CHAIN; i++) {
    const from = verbs[i].end;
    const to = i + 1 < verbs.length ? verbs[i + 1].start : text.length;
    let segment = text.slice(from, to);

    // The Prophet ends the chain: everything past him is the matn.
    const prophetAt = segment.search(PROPHET_RE);
    if (prophetAt === 0) {
      reachedProphet = true;
      break;
    }
    if (prophetAt > 0) segment = segment.slice(0, prophetAt);

    const tahwilAt = segment.search(TAHWIL_RE);
    if (tahwilAt >= 0) {
      segment = segment.slice(0, tahwilAt);
      truncatedAtTahwil = true;
    }

    const endAt = segment.search(SEGMENT_END_RE);
    if (endAt >= 0) segment = segment.slice(0, endAt);

    let name = cutTrailingPhrase(cleanName(segment));

    const kin = resolveKin(name, names, maps);
    if (kin === null) {
      // An unresolvable kin reference is a real gap in the chain, not the
      // end of it — keep walking.
      continue;
    }
    name = kin;

    if (!looksLikeName(name)) {
      // In a well-formed isnad every transmission verb yields a name. A span
      // that does not is the strongest signal that the matn has started.
      if (names.length >= 2) break;
      continue;
    }

    // A span nobody in the biographical literature is called, with nothing
    // about it that reads as a name, ends the isnad rather than extending it.
    if (names.length >= 2 && attested) {
      const key = normaliseKey(name);
      if (!attested(name) && !hasNameMarker(key)) break;
    }

    // The same narrator repeated across a `قال` aside — collapse.
    if (names.length && normaliseKey(names[names.length - 1]) === normaliseKey(name)) continue;

    names.push(name);

    if (prophetAt > 0) {
      reachedProphet = true;
      break;
    }
    if (truncatedAtTahwil) break;
  }

  return { names, reachedProphet, truncatedAtTahwil };
}

/**
 * Turn `أبيه` / `جده` into the person meant, using the narrator that precedes
 * it in the chain. Returns `null` when the reference cannot be resolved and
 * the link should be dropped rather than guessed at.
 */
function resolveKin(name: string, sofar: string[], maps: RelativeMaps): string | null {
  const key = normaliseKey(name);
  if (UNRESOLVABLE_KIN.has(key)) return null;

  const kind = KIN[key];
  if (!kind) return name;
  const previous = sofar[sofar.length - 1];
  if (!previous) return null;
  return maps[kind].get(normaliseKey(previous)) ?? null;
}
