/**
 * Matching a narrator in this corpus to his entry in a classical work.
 *
 * The obvious join is the one Itqan already carries — each profile cites an
 * `entry_id` per work — and it does not hold. Against Taqrīb al-Tahdhīb its
 * 8,975 citations use only 8,104 distinct ids, and a fifth of them land on a
 * different man: profile «أحمد بن أبي بكر … أبو مصعب الزهري» against the entry
 * for «عبد الرحمن بن عبد الله بن عمر». That is their join being approximate,
 * and an approximate join is not something to quote a biography through.
 *
 * So the alignment is made here, from the names, and it is made to fail loudly
 * rather than quietly:
 *
 * - a profile matches an entry only through one of its **recorded namings**,
 *   matched **in order from the first word of the entry**, because Taqrīb
 *   writes the name first and judges after it;
 * - the match must be **unique** — where two entries answer a name equally
 *   well, both are dropped, since `الزهري` is one name and several men;
 * - and it must be **corroborated**, by the ṭabaqa the entry states or the year
 *   of death it gives. Both are printed in the entry itself and both are held
 *   independently on the profile, so they check the match rather than restating
 *   it.
 *
 * What this buys is that a wrong entry is mostly a *missing* entry. Quoting one
 * man's life under another man's name is the one failure that would make this
 * feature worse than showing nothing.
 */

import { normaliseKey } from '../isnad/arabic.js';
import { parseTabaqa } from './sources.js';
import { HEAD_WORDS, headOf, type Biography } from './openiti.js';

/** Fewer words than this and a name is not evidence of anything. */
const MIN_WORDS = 2;

/**
 * How much name it takes to accept a match nothing else confirms. Five words of
 * a nasab — `مالك بن انس بن مالك بن` — belong to one man; three belong to
 * several, and one of them will be the wrong one.
 */
const LONE_NAME_WORDS = 5;

export interface Candidate {
  /** Profile id. */
  id: number;
  namings: string[];
  tabaqatAr?: string;
  diedRaw?: string;
}

export interface Alignment {
  id: number;
  entry: Biography;
  /** Words of the name matched against the head of the entry. */
  matched: number;
  /** The entry states the ṭabaqa the database holds for him. */
  tabaqaAgrees: boolean;
  /** The entry states the year of death the database holds for him. */
  deathAgrees: boolean;
}

/** `من العاشرة`, `من كبار التابعين` — the ṭabaqa as Taqrīb states it. */
const TABAQA_IN_ENTRY = /(?:^|\s)من\s+((?:\S+\s+){0,3}\S+)(?=\s|$)/g;

/**
 * Companionship, which Taqrīb states in words rather than by ṭabaqa: `صحابي`,
 * `له صحبة`, `صحابية`. It is the first ṭabaqa, and saying so lets a Companion's
 * entry corroborate like anyone else's.
 */
const COMPANION_IN_ENTRY = /(?:^|\s)(?:صحاب[يى]ه?|له\s+صحبه?|مخضرم)(?=\s|$)/;

/** `مات سنة ست وأربعين` and the like; the year is written out in words. */
const DEATH_IN_ENTRY = /مات\s+سنة\s+([^\d]{0,40})/;

const UNITS: Record<string, number> = {
  احدي: 1, واحده: 1, اثنتين: 2, ثلاث: 3, اربع: 4, خمس: 5, ست: 6, سبع: 7,
  ثمان: 8, تسع: 9, عشر: 10, عشره: 10,
};
const TENS: Record<string, number> = {
  عشرين: 20, ثلاثين: 30, اربعين: 40, خمسين: 50, ستين: 60,
  سبعين: 70, ثمانين: 80, تسعين: 90,
};
const HUNDREDS: Record<string, number> = {
  ماىه: 100, مايه: 100, مايتين: 200, ماىتين: 200, ثلاثماىه: 300, ثلاثمايه: 300,
};

/**
 * The year an entry gives, from the words it gives it in.
 *
 * Read loosely on purpose: this only ever has to agree or fail to agree with a
 * year already held, so a reading that comes out short is a match not made
 * rather than a wrong one.
 */
export function yearInWords(phrase: string): number | undefined {
  let units = 0;
  let tens = 0;
  let hundreds = 0;
  let seen = false;
  for (const raw of normaliseKey(phrase).split(' ').filter(Boolean)) {
    // Arabic attaches the conjunction to the word — `ثلاث وسبعين`, `ومائة` —
    // so the wāw has to come off before the number can be read. Reading it as
    // part of the word ended every year at its units digit, and a year of `3`
    // against a death in `73` looks like two different men.
    const word = raw.length > 2 && raw.startsWith('و') ? raw.slice(1) : raw;
    if (UNITS[word] !== undefined) {
      // `اثنتين وقيل ثلاث وتسعين` offers two readings; the later one wins, and
      // the caller compares against every year the database holds anyway.
      units = UNITS[word];
      seen = true;
    } else if (TENS[word] !== undefined) {
      tens = TENS[word];
      seen = true;
    } else if (HUNDREDS[word] !== undefined) {
      hundreds = HUNDREDS[word];
      seen = true;
    }
  }
  const year = units + tens + hundreds;
  return seen && year > 0 ? year : undefined;
}

/**
 * Whether two years can be the same year.
 *
 * Taqrīb routinely drops the century — al-Zuhrī `مات سنة خمس وعشرين`, meaning
 * 125 — so a reading under a hundred is a year whose century was not written,
 * and only its last two digits can be held against the record. The couple of
 * years' slack is for the sources disagreeing, which they constantly do.
 */
export function sameYear(entry: number, held: number): boolean {
  if (Math.abs(entry - held) <= 2) return true;
  return entry < 100 && Math.abs((entry % 100) - (held % 100)) <= 2;
}

/** Every year a death notice mentions — they are often three or four. */
export function yearsIn(raw: string | undefined): number[] {
  return [...(raw ?? '').matchAll(/\d{1,3}/g)].map((m) => Number(m[0])).filter((n) => n > 0);
}

function tabaqaOf(entry: Biography): number | undefined {
  const key = normaliseKey(entry.text);
  if (COMPANION_IN_ENTRY.test(key)) return 1;
  TABAQA_IN_ENTRY.lastIndex = 0;
  for (let m = TABAQA_IN_ENTRY.exec(key); m; m = TABAQA_IN_ENTRY.exec(key)) {
    // `من الرابعة`, `من كبار التابعين`, `من رؤوس الطبقة السابعة` — the ordinal
    // can sit a word or three past the preposition.
    for (const word of m[1].split(' ')) {
      const found = parseTabaqa(word, normaliseKey);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function deathOf(entry: Biography): number | undefined {
  const hit = DEATH_IN_ENTRY.exec(entry.text);
  return hit ? yearInWords(hit[1]) : undefined;
}

/**
 * Index the entries by every leading run of their opening words, so a name can
 * be looked up by what it is rather than searched for.
 */
function index(entries: Biography[]): Map<string, Biography[]> {
  const by = new Map<string, Biography[]>();
  for (const entry of entries) {
    const head = headOf(entry.text);
    for (let take = MIN_WORDS; take <= head.length; take++) {
      const key = head.slice(0, take).join(' ');
      const bucket = by.get(key);
      if (bucket) bucket.push(entry);
      else by.set(key, [entry]);
    }
  }
  return by;
}

export function alignAll(entries: Biography[], candidates: Candidate[]): Map<number, Alignment> {
  const by = index(entries);
  const tabaqat = new Map<Biography, number | undefined>();
  const deaths = new Map<Biography, number | undefined>();
  for (const entry of entries) {
    tabaqat.set(entry, tabaqaOf(entry));
    deaths.set(entry, deathOf(entry));
  }

  const out = new Map<number, Alignment>();
  for (const candidate of candidates) {
    const wantTabaqa = parseTabaqa(candidate.tabaqatAr ?? '', normaliseKey);
    const wantYears = yearsIn(candidate.diedRaw);

    /*
      Every reading of every name he is recorded under, gathered before any is
      chosen. Taking the first long match instead cost Abū Hurayra his entry:
      the database opens his name «عبد الرحمن بن صخر», and so does the entry for
      an unknown of the ninth ṭabaqa from Raqqa, whose life would then have been
      printed under the most-narrated Companion in the corpus.
    */
    const found: Alignment[] = [];
    for (const naming of candidate.namings) {
      const words = normaliseKey(naming).split(' ').filter(Boolean);
      if (words.length < MIN_WORDS) continue;
      for (let take = Math.min(words.length, HEAD_WORDS); take >= MIN_WORDS; take--) {
        const bucket = by.get(words.slice(0, take).join(' '));
        if (!bucket?.length) continue;
        for (const entry of bucket) {
          found.push({
            id: candidate.id,
            entry,
            matched: take,
            tabaqaAgrees: wantTabaqa !== undefined && tabaqat.get(entry) === wantTabaqa,
            deathAgrees: (() => {
              const death = deaths.get(entry);
              return death !== undefined && wantYears.some((y) => sameYear(death, y));
            })(),
          });
        }
        break;
      }
    }
    if (!found.length) continue;

    /*
      What the entry states about the man is used to *rule entries out*, not to
      rank them up. Silence is not evidence: Taqrīb gives Anas ibn Mālik no
      ṭabaqa at all — «خادم رسول الله ﷺ … مشهور» — while the other Anas, of the
      Banū Qushayr, is called `صحابي` outright, so rewarding agreement handed
      the Prophet's servant's chains to a different Companion. A stated ṭabaqa
      that *contradicts* the one on file is another matter: that is two men.
    */
    const possible = found.filter((a) => {
      const tabaqa = tabaqat.get(a.entry);
      const death = deaths.get(a.entry);
      if (wantTabaqa !== undefined && tabaqa !== undefined && tabaqa !== wantTabaqa) return false;
      // A year is only a contradiction if the entry's is apart from *every*
      // year on file: the database records «90 هـ ، أو 91 هـ ، أو 92 هـ ، أو 93
      // هـ» and Taqrīb says «اثنتين وقيل ثلاث وتسعين», and those are the same
      // man disagreed about, not two men.
      if (death !== undefined && wantYears.length && !wantYears.some((y) => sameYear(death, y))) {
        return false;
      }
      return true;
    });
    if (!possible.length) continue;

    // The fullest name wins: `محمد بن مسلم بن عبيد الله بن عبد الله بن شهاب`
    // is al-Zuhrī and `محمد بن مسلم بن تدرس` is Abū al-Zubayr, and the first
    // three words of each are the same three words.
    possible.sort((a, b) => b.matched - a.matched);
    const best = possible[0];

    // Two different entries answering equally well is two men of one name.
    if (possible.some((a) => a.entry !== best.entry && a.matched === best.matched)) continue;

    // Nothing corroborates it: only a long, distinctive name is evidence enough.
    if (!best.tabaqaAgrees && !best.deathAgrees && best.matched < LONE_NAME_WORDS) continue;
    out.set(candidate.id, best);
  }
  return out;
}
