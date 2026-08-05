/**
 * Matching a name someone half-remembers.
 *
 * Two passes, and the second only because the first cannot reach far enough.
 *
 * `fold` is ordinary normalisation: case, the Latin marks a transliteration
 * carries (ʿAbd, Muḥammad), the Arabic vowel signs, and the letter forms that
 * vary between editions — أ ا إ, ى ي, ة ه. It is what makes `عائشه` typed
 * quickly find `عَائِشَة`.
 *
 * `skeleton` is for the other direction. Only 84 of the 8,123 narrators carry
 * an English name — the compilers and a few famous kunyas — so `abu hurayra`
 * has to reach the Arabic itself, and the only thing a transliteration reliably
 * agrees on is the consonants. Hurayra, Huraira, Hurairah differ in every vowel
 * and in none of the rest, so both sides are reduced to `bhrr` and compared
 * there.
 */

/**
 * Combining marks, as escapes rather than as themselves: a range written
 * literally here is one editor's normalisation away from swallowing letters,
 * and it does so silently — names simply stop matching.
 */
const ARABIC_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const LATIN_MARKS = /[̀-ͯ]/g;

export function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(LATIN_MARKS, '')
    .replace(ARABIC_MARKS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ة/g, 'ه')
    .replace(/[ʿʾʻʼ'’`´\-–—.,:;()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Arabic letters as the Latin they are usually transliterated with. */
const ROMAN: Record<string, string> = {
  'ا': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j',
  'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'dh', 'ر': 'r',
  'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd',
  'ط': 't', 'ظ': 'z', 'ع': '', 'غ': 'gh', 'ف': 'f',
  'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
  'ه': 'h', 'و': 'w', 'ي': 'y', 'ء': '',
};

/** The consonants of a folded name, with everything vowel-like gone. */
export function skeleton(folded: string): string {
  let out = '';
  for (const ch of folded) out += ROMAN[ch] ?? (/[a-z]/.test(ch) ? ch : '');
  // w and y go with the vowels: they are Arabic's long vowels as often as its
  // consonants, and no two transliterations agree on which. Spaces go too —
  // Arabic writes `عبد الله` as two words and the transliterations as one.
  // Doubled letters collapse last: a shadda is one letter in Arabic and two in
  // every transliteration of it, so Umm Salama and أم سلمة only meet as `mslm`.
  return (
    out
      .replace(/[^a-z]/g, '')
      .replace(/[aeiouwy]/g, '')
      .replace(/(.)\1+/g, '$1')
      // The definite article, which survives as a bare `l`. It is attached in
      // `الزهري`, hyphenated in `al-Zuhrī` and absent in `zuhri`, and all three
      // are the same man. Both sides lose it, so a name that really begins with
      // lām loses it on both sides too and still matches itself.
      .replace(/^l/, '')
  );
}

/**
 * A skeleton this short matches half the corpus, so it is only trusted when the
 * query it came from was long enough to have meant something: `aisha` is two
 * consonants and a real search, `abu` is one and is not.
 */
export const MIN_SKELETON = 2;
const MIN_QUERY = 4;

/**
 * How well a name answers a query: 0 the whole name, 1 its start, 2 anywhere
 * inside it, then the same three again on the consonants alone — 3, 4, 5 — and
 * -1 for no answer at all.
 *
 * The consonant tiers have to stay apart. `umm salama` and `muslim` reduce to
 * the same `mslm`, and Muslim carries 7,457 chains to her 233; ranked together
 * and sorted by weight, the compiler buries her. Being *exactly* those
 * consonants beats merely beginning with them.
 */
export function rankName(
  needle: string,
  bones: string,
  candidate: { ar: string; en: string; bones: string },
): number {
  if (candidate.ar === needle || candidate.en === needle) return 0;
  if (candidate.ar.startsWith(needle) || candidate.en.startsWith(needle)) return 1;
  if (candidate.ar.includes(needle) || candidate.en.includes(needle)) return 2;
  if (!boneworthy(needle, bones)) return -1;
  if (candidate.bones === bones) return 3;
  if (candidate.bones.startsWith(bones)) return 4;
  if (candidate.bones.includes(bones)) return 5;
  return -1;
}

/**
 * What to sort the results by.
 *
 * Not the tier: a chain of consonants matched exactly against a narrator with
 * one hadith is a worse answer than the same consonants inside the name of one
 * with six thousand. `abu hurayra` reduces to `bhr`, which is exactly Abū Baḥr
 * (7 chains) and merely the start of Abū Hurayra (5,944) — and it means Abū
 * Hurayra. So weight leads and the tier is a penalty against it, sized to be
 * worth about a factor of ten in chains per step down.
 */
const PENALTY = [0, 0.3, 0.8, 1.0, 1.4, 2.0];

export function scoreName(rank: number, chains: number): number {
  return Math.log10(1 + chains) - (PENALTY[rank] ?? 2.5);
}

/** Whether the consonants of this query are worth matching on at all. */
export function boneworthy(needle: string, bones: string): boolean {
  return bones.length >= MIN_SKELETON && needle.replace(/\s+/g, '').length >= MIN_QUERY;
}
