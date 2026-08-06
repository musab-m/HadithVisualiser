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
 *   writes the name first and judges after it, and the fullest name wins;
 * - the match must be **unique** — where two entries answer a name equally
 *   well, both are dropped, since `الزهري` is one name and several men;
 * - the ṭabaqa and the death year the entry states **veto** a match, they do
 *   not vouch for one. Silence is not evidence: Taqrīb gives Anas ibn Mālik no
 *   ṭabaqa at all while a different Anas is called `صحابي` outright, so
 *   rewarding agreement handed the Prophet's servant to the wrong Companion.
 *   A *stated* ṭabaqa that contradicts the record is another matter — that is
 *   two men;
 * - and a match nothing corroborates needs five words of name behind it.
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
  /**
   * The rest of the identity — nasab, laqab, kunya, town — used only to part
   * two entries that answer the name equally well.
   */
  marks?: (string | undefined)[];
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

/**
 * How old he was, which Taqrīb often gives straight after the year he died:
 * `مات سنة سبع عشرة وله ثمانون سنة`. Read on, and the age is added to the year
 * — 7 + 10 + 80 — and the entry then contradicts the record and is thrown out.
 * That is how ʿUmar ibn al-Ḥakam ibn Thawbān lost his own entry to the man
 * printed after him.
 */
const AGE_AFTER_DEATH = /\s(?:وله|وهو\s+ابن|عن)\s/;

const UNITS: Record<string, number> = {
  احدي: 1, واحده: 1, اثنتين: 2, ثلاث: 3, اربع: 4, خمس: 5, ست: 6, سبع: 7,
  ثمان: 8, تسع: 9, عشر: 10, عشره: 10,
};
const TENS: Record<string, number> = {
  عشرين: 20, ثلاثين: 30, اربعين: 40, خمسين: 50, ستين: 60,
  سبعين: 70, ثمانين: 80, تسعين: 90,
};
/** The ten of the teens: `ثلاث عشرة`, `سبع عشرة`. */
const TEEN = new Set(['عشر', 'عشره']);

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
  let afterUnit = false;
  for (const raw of normaliseKey(phrase).split(' ').filter(Boolean)) {
    // Arabic attaches the conjunction to the word — `ثلاث وسبعين`, `ومائة` —
    // so the wāw has to come off before the number can be read. Reading it as
    // part of the word ended every year at its units digit, and a year of `3`
    // against a death in `73` looks like two different men.
    const attached = raw.length > 2 && raw.startsWith('و');
    const word = attached ? raw.slice(1) : raw;

    // `سبع عشرة` is seventeen, not seven and then ten: a unit standing directly
    // before `عشرة`, with no wāw between them, is the teens construction and
    // the two words are one number. Overwriting instead read it as ten, and
    // `مات سنة سبع عشرة` then contradicted a death on file in 117.
    if (TEEN.has(word) && afterUnit && !attached) {
      units += 10;
      afterUnit = false;
      continue;
    }
    afterUnit = false;

    if (UNITS[word] !== undefined) {
      // `اثنتين وقيل ثلاث وتسعين` offers two readings; the later one wins, and
      // the caller compares against every year the database holds anyway.
      units = UNITS[word];
      seen = true;
      afterUnit = true;
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

/**
 * Words that identify nobody. They stand in half the entries in the book, so
 * finding one in a tied entry and not in its rival is coincidence rather than
 * evidence, and a tie broken on coincidence is a wrong entry printed under a
 * man's name.
 */
const MARK_NOISE = new Set([
  'بن', 'ابن', 'ابو', 'ابي', 'ابا', 'ام', 'الله', 'عبد', 'مولاهم', 'مولي', 'مولاه',
  'ويقال', 'وقيل', 'يقال', 'وهو', 'هو', 'اسمه', 'وكان', 'ثم', 'من', 'في',
  // Ranks and offices. They say what a man did, not which man he was, and
  // `الحافظ` — ten entries in the whole of Taqrīb — is rare enough to look
  // decisive while deciding nothing: it handed Muʿallā ibn Asad the entry of
  // ʿAlī ibn al-Muthannā.
  'الحافظ', 'القاضي', 'الامام', 'الشيخ', 'الامير', 'الفقيه', 'المحدث', 'الزاهد',
  'العابد', 'الكاتب', 'الخليفه', 'القارئ', 'المقرئ',
]);

/** Shorter than this and a word is a fragment, not a name. */
const MARK_MIN = 3;

/**
 * How many entries a mark may appear in and still decide anything.
 *
 * `الأسدي` stands in hundreds of lives and `النصري` in a handful, and the two
 * are not the same evidence. Weighing them alike gave Ḥabīb ibn Abī Thābit —
 * `ثقة`, 160 chains — the entry of one Ḥabīb ibn al-Nuʿmān al-Asadī, `مقبول`,
 * on the strength of `الأسدي` alone. A mark commoner than this is treated as
 * saying nothing, because that is roughly what it says.
 */
const MARK_MAX_ENTRIES = 40;

/** The nasab, laqab, kunya and town, reduced to the words worth testing. */
function marksOf(candidate: Candidate): string[] {
  const out = new Set<string>();
  for (const field of candidate.marks ?? []) {
    for (const word of normaliseKey(field ?? '').split(' ')) {
      if (word.length >= MARK_MIN && !MARK_NOISE.has(word)) out.add(word);
    }
  }
  return [...out];
}

/**
 * Two entries answer the name equally well. Does the rest of the identity part
 * them?
 *
 * A mark counts only if it is **exclusive** — carried by this entry and not by
 * its rivals — and **rare** in the work. Sālim Sablān and Sālim ibn ʿAbd Allāh
 * ibn ʿUmar are both `سالم بن عبد الله`, both of the third ṭabaqa, and both
 * `المدني`; what separates them is that Taqrīb's 2177 also says `النصري`,
 * `الدوسي` and `المهري`, and 2176 says none of the three. `المدني` is carried
 * by both and decides nothing; it would decide nothing even if only one had it.
 *
 * Where two entries each carry something the other lacks, the evidence points
 * both ways, and that is still two men of one name: nothing is returned.
 */
function discriminate(
  tied: Alignment[],
  marks: string[],
  wordsOf: (entry: Biography) => Set<string>,
  rare: (mark: string) => boolean,
): Alignment | undefined {
  const telling = marks.filter(rare);
  if (!telling.length) return undefined;
  const groups = [...new Map(tied.map((a) => [a.entry, a])).values()];
  const carried = groups.map((a) => telling.filter((mark) => wordsOf(a.entry).has(mark)));

  let winner: Alignment | undefined;
  for (let i = 0; i < groups.length; i++) {
    const exclusive = carried[i].some((mark) =>
      carried.every((other, j) => j === i || !other.includes(mark)),
    );
    if (!exclusive) continue;
    if (winner) return undefined;
    winner = groups[i];
  }
  return winner;
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
  return hit ? yearInWords(hit[1].split(AGE_AFTER_DEATH)[0]) : undefined;
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
  const words = new Map<Biography, Set<string>>();
  for (const entry of entries) {
    tabaqat.set(entry, tabaqaOf(entry));
    deaths.set(entry, deathOf(entry));
    words.set(entry, new Set(normaliseKey(entry.text).split(' ')));
  }
  const wordsOf = (entry: Biography) => words.get(entry) ?? new Set<string>();

  // How many lives each word stands in, so a mark can be weighed by how much
  // of the book it fails to describe.
  const spread = new Map<string, number>();
  for (const set of words.values()) {
    for (const word of set) spread.set(word, (spread.get(word) ?? 0) + 1);
  }
  const rare = (mark: string) => (spread.get(mark) ?? 0) <= MARK_MAX_ENTRIES;

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
    let best = possible[0];

    /*
      Two different entries answering equally well is two men of one name —
      unless the rest of the identity parts them. The name alone leaves 951 of
      this corpus's narrators tied, and for many the tie is only in the first
      few words: the nasab that would settle it is sitting in the entry,
      unread.
    */
    const tied = possible.filter((a) => a.matched === best.matched);
    if (tied.some((a) => a.entry !== best.entry)) {
      const decided = discriminate(tied, marksOf(candidate), wordsOf, rare);
      if (!decided) continue;
      best = decided;
    }

    // Nothing corroborates it: only a long, distinctive name is evidence enough.
    if (!best.tabaqaAgrees && !best.deathAgrees && best.matched < LONE_NAME_WORDS) continue;
    out.set(candidate.id, best);
  }
  return out;
}
