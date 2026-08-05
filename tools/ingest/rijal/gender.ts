/**
 * Whether a narrator is *named* as a woman.
 *
 * The rijal database has no field for this — none of the 115,735 profiles
 * records a sex — so it is read off how the literature names people, which in
 * Arabic is explicit far more often than not:
 *
 *   بنت   daughter of, where a man's name has بن
 *   أم    Umm, the kunya women carry and the name many are known by
 *   أم المؤمنين · صحابية  said of a woman in so many words
 *
 * The one trap is a man named through a woman. Yaʿlā ibn Umayya is also called
 * `يعلى بن منية بنت غزوان` — after his mother — so a bare search for بنت makes
 * him a woman, and he carries 33 chains. Hence the rule below is not "does the
 * name contain بنت" but "does بنت come before بن": whichever marker names *this*
 * person comes first, and the other belongs to a parent further along.
 *
 * This finds 208 of the 8,084 narrators in the corpus, on 4,860 chains. It is a
 * reading of the name and is labelled as one wherever it is offered.
 */

const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;

/** Enough normalisation to compare a word, not enough to change one. */
function plain(text: string | undefined): string {
  return (text ?? '')
    .replace(DIACRITICS, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim();
}

const DAUGHTER = 'بنت';
const SON = ['بن', 'ابن'];
const UMM = /^ام\s/;
const SAID_OF_A_WOMAN = /ام المؤمنين|صحابيه/;

export function namedAsWoman(profile: {
  fullNameAr?: string;
  kunya?: string;
  tabaqatAr?: string;
  gradeAr?: string;
}): boolean {
  const name = plain(profile.fullNameAr);
  const words = name.split(/\s+/);

  const daughter = words.indexOf(DAUGHTER);
  if (daughter >= 0) {
    const son = Math.min(
      ...SON.map((word) => {
        const at = words.indexOf(word);
        return at < 0 ? Infinity : at;
      }),
    );
    if (daughter < son) return true;
  }

  if (UMM.test(name)) return true;
  if (UMM.test(plain(profile.kunya))) return true;
  return SAID_OF_A_WOMAN.test(`${plain(profile.tabaqatAr)} ${plain(profile.gradeAr)}`);
}
