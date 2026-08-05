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

import {
  AR_LETTERS,
  stripDiacritics,
  stripEditorial,
  stripHonorifics,
  normaliseKey,
} from './arabic.js';

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
  /**
   * He is named somewhere in the report, even where the chain did not run into
   * him.
   *
   * Weaker evidence than `reachedProphet`, and kept apart from it for that
   * reason. A report that says `قال رسول الله` is his however the isnad reads;
   * one that never names him at all has stopped at a Companion or a Follower,
   * and stopping is the whole content of mawqūf and maqṭūʿ.
   */
  namesProphet: boolean;
  /** Parsing stopped early at a tahwil (ح) marking a second parallel chain. */
  truncatedAtTahwil: boolean;
  /**
   * Indices `i` where somebody stood between `names[i - 1]` and `names[i]` and
   * was dropped, so those two are *not* a hearing.
   *
   * The isnad named a person by their relation — `عن أخيه`, `عن مولاه` — and no
   * lookup table can turn that into a man. The link cannot be drawn, but the
   * step is real and one narrator longer than it looks, which is exactly what a
   * reader counting the chain needs told.
   */
  gaps: number[];
}

// Alef and ya variants are spelled inconsistently across editions, so the
// patterns accept the alternatives rather than normalising the text first
// (normalising would merge the preposition على into the name علي).
const A = '[أاإآ]';
const Y = '[يى]';
/*
  Word boundaries are drawn around letters, not around the Arabic block: the
  block also holds the script's punctuation, so a range across all of it reads
  `وقال،` as one unbroken word and no boundary fires. Editions attach that
  comma directly to the word, which is how `قال عبد أخبرني وقال، الآخران` left
  `وقال` standing in a chain as if it were a man.
*/
const AR = AR_LETTERS;

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

/**
 * Words and punctuation that terminate a narrator span.
 *
 * The speech verbs take an optional و/ف, which editions attach directly:
 * `وقال الآخران` is the compiler noting what his other teachers said, and
 * without the prefix here the whole phrase was read as the next narrator —
 * that one shape alone accounted for 121 chains.
 */
const SEGMENT_END_RE = new RegExp(
  `[،؛,\\n"«»]|(?<![${AR}])(?:[وف]?(?:قال|قالت|قالوا|يقول|تقول|يقولون|يحدث|تحدث|كان|كانت|قر${A}|سمعته)|${A}نه|${A}نها|${A}نهم|${A}ن|بينا|بينما)(?![${AR}])`,
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
    'رجلا',
    'رجلين',
    // `عن الثقة` is a critic declining to name his source, not a name.
    'الثقه',
    'ثقه',
    'بذلك',
    'بلغه',
    'بلغني',
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
  // `عن قوله` is "about his statement", not "from Qawluhu". The preposition
  // that carries a chain is the same word that asks after a wording, and
  // nobody is named for an act of speech — so these end a span wherever they
  // appear in it.
  'قول',
  'قوله',
  'قولها',
  'قولهم',
  'قولك',
  'حديثه',
  'حديثها',
  'حديثهم',
  'يزعم',
  'فاذا',
  'حدثه',
  'مع',
  'الي',
  'الا',
  'او',
]);

/**
 * Everything above, as whole spans, for the rijal database to refuse as well.
 *
 * A handful of upstream profiles were sliced out of the prose around them and
 * carry a function word as their entire name — one is filed under `قوله`, with
 * Abū Ḥanīfa's biography still inside it. That made the word *attested*, and an
 * attested span is one this parser will accept as a name however little it
 * looks like one, which is how `سألت يحيى بن يحيى عن قوله` — "I asked Yaḥyā
 * about his wording" — put Abū Ḥanīfa in a chain of transmission.
 */
export const NON_NAME_SPANS = new Set(
  [...NOT_A_NAME, ...NARRATIVE_TOKENS].map(normaliseKey),
);

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
/*
  A cap on how long a span can be and still read as a name. Nine was too tight:
  `عبد الرحمن بن عبد الله بن عبد الرحمن بن أبي صعصعة` is eleven words and a
  perfectly ordinary nasab, and rejecting it ended the chain two narrators early
  — in Bukhari 19, before Abū Saʿīd al-Khudrī and before the Prophet. Twelve
  still refuses the matn, which the narrative tokens and the attestation check
  catch anyway.
*/
const MAX_NAME_WORDS = 12;

/** Trim a raw span down to something that could be a name. */
function cleanName(span: string): string {
  // A comma inside a span is an artefact of the scrape, not a boundary — the
  // span was cut at a real one before it got here. Left in, `ابن، وهب` is a
  // different name from `ابن وهب` and matches nobody.
  let name = stripEditorial(stripHonorifics(span)).replace(/[،,]/gu, ' ');
  name = name.replace(/^(?:و|ف|ثم|قد)\s+/u, '');
  name = name.replace(/\s+(?:قال|قالت|رحمه|يقول)\s*$/u, '');
  // Adverbs an editor appends when the same narrator recurs.
  name = name.replace(/\s+(?:[أا]يضا|جميعا|معا|كلاهما|كلهم)\s*$/u, '');
  name = name.replace(/^\s*عن\s+/u, '');
  name = name.replace(/\s+و\s*$/u, '');
  return name.trim();
}

/**
 * A span that ends on a word which governs the one after it: `ابن`, `بن`,
 * `أبو`, `عبد`. No name ends here, so whatever follows belongs to it.
 */
const DANGLING_RE = new RegExp(
  `(?:^|\\s)(?:بن|${A}بن|${A}ب[وي]|${A}م|عبد|بنت|ذو|ذي)\\s*$`,
  'u',
);

/**
 * Cut the span where the name ends — stepping over a comma dropped inside one.
 *
 * The scraped editions print `عَنِ ابْنِ، شِهَابٍ` and `حَدَّثَنَا مُوسَى بْنُ،
 * إِسْمَاعِيلَ`: the comma lands between a word and the word it governs. Cut
 * there and the chain gains a narrator called `ابن` — 96 chains ran through
 * that one — while the man himself goes unnamed. A verb is a real ending and
 * still stops the span; only a comma is stepped over, and only when the span
 * cannot possibly have ended.
 */
function cutSegment(segment: string): string {
  let from = 0;
  for (let hops = 0; hops < 4; hops++) {
    const at = segment.slice(from).search(SEGMENT_END_RE);
    if (at < 0) break;
    const cut = from + at;
    const head = segment.slice(0, cut);
    if (!DANGLING_RE.test(head)) return head;
    if (!/^[،,]/u.test(segment.slice(cut))) return head;
    from = cut + 1;
  }
  return segment;
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
  if (!text) {
    return {
      names: [],
      reachedProphet: false,
      namesProphet: false,
      truncatedAtTahwil: false,
      gaps: [],
    };
  }
  const namesProphet = PROPHET_RE.test(text);
  text = rewriteBackward(text);

  // Collect every transmission verb first; a narrator span runs from the end
  // of one verb to the start of the next.
  const verbs: { start: number; end: number }[] = [];
  VERB_RE.lastIndex = 0;
  for (let m = VERB_RE.exec(text); m; m = VERB_RE.exec(text)) {
    verbs.push({ start: m.index, end: m.index + m[0].length });
  }

  const names: string[] = [];
  const gaps: number[] = [];
  let reachedProphet = false;
  let truncatedAtTahwil = false;
  /** Somebody was named between the last name taken and the next one. */
  let dropped = false;

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

    segment = cutSegment(segment);

    let name = cutTrailingPhrase(cleanName(segment));

    const kin = resolveKin(name, names, maps);
    if (kin === null) {
      // An unresolvable kin reference is a real gap in the chain, not the
      // end of it — keep walking, and remember that the next link crosses him.
      dropped = names.length > 0;
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

    if (dropped) gaps.push(names.length);
    dropped = false;
    names.push(name);

    if (prophetAt > 0) {
      reachedProphet = true;
      break;
    }
    if (truncatedAtTahwil) break;
  }

  return { names, reachedProphet, namesProphet, truncatedAtTahwil, gaps };
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
