/**
 * The rijal database: 115,735 narrator profiles consolidated from 22 classical
 * works of `ilm ar-rijal`, plus the machinery for deciding which of them a
 * name in an isnad refers to.
 *
 * Matching is the hard part. Isnads name people the way a room of specialists
 * would — `سفيان`, `الزهري`, `ابن شهاب` — and hundreds of profiles can share a
 * surface form. We therefore resolve a chain as a whole rather than name by
 * name: unambiguous links are fixed first, then their teacher/student records
 * and ṭabaqa are used to choose between the candidates for the rest.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NarratorGrade, RijalVerdict } from '../../../src/corpus/types.js';
import { normaliseKey, parseDeathYear, stripDiacritics } from '../isnad/arabic.js';
import { RIJAL_WORKS, parseTabaqa } from './sources.js';

const GRADE_FILES: { file: string; grade: NarratorGrade }[] = [
  { file: 'profiles_companion.json', grade: 'companion' },
  { file: 'profiles_reliable.json', grade: 'reliable' },
  { file: 'profiles_mostly_reliable.json', grade: 'mostly_reliable' },
  { file: 'profiles_weak.json', grade: 'weak' },
  { file: 'profiles_abandoned.json', grade: 'abandoned' },
  { file: 'profiles_fabricator.json', grade: 'fabricator' },
  { file: 'profiles_unknown.json', grade: 'unknown' },
];

export interface RijalProfile {
  id: number;
  fullNameAr: string;
  kunya?: string;
  laqab?: string;
  nasab?: string;
  city?: string;
  tabaqatAr?: string;
  tabaqa?: number;
  grade: NarratorGrade;
  gradeAr?: string;
  diedRaw?: string;
  diedAH?: number;
  namings: string[];
  verdicts: RijalVerdict[];
  teachers: number[];
  students: number[];
  /** How many classical works carry an entry — a proxy for prominence. */
  weight: number;
  /**
   * A claim of companionship was set aside because his own ṭabaqa or death
   * year ruled it out. Worth saying: a transmitter left unassessed because his
   * one recorded verdict was that claim is not the same as one nobody judged.
   */
  companionshipRejected: boolean;
}

export interface Resolution {
  /** The profile chosen, if any. */
  profile?: RijalProfile;
  /** The surface form this resolution was made from. */
  surface: string;
  /**
   * The chosen profile did not separate clearly from the runners-up. The
   * identification is still the best available reading, but it is a reading
   * rather than a fact, and the UI says so.
   */
  ambiguous: boolean;
  /** How many profiles carried the matched surface form. */
  candidates: number;
}

const IGNORED_VALUES = new Set(['', '-', 'nan', 'null', 'none']);

/**
 * The last of the Companions died around 110 AH. A margin past that leaves room
 * for the disputed long-lived cases without admitting the second century.
 */
const LAST_COMPANION_AH = 120;

/**
 * Read a verdict from the Arabic where no English grade was recorded.
 *
 * The merged database carries the critics' own words far more often than it
 * carries a machine-readable grade, and those words are a fixed vocabulary:
 * ثقة, صدوق, ضعيف, متروك. Negations are tested first, since ليس بثقة contains
 * the word it denies.
 */
export function gradeFromArabic(text: string | undefined): NarratorGrade | undefined {
  if (!text) return undefined;
  const t = stripDiacritics(text);
  if (/كذاب|وضاع|يضع الحديث|متهم بالكذب|دجال/.test(t)) return 'fabricator';
  if (/متروك|ذاهب الحديث|ليس بثقة|ليس بشيء|هالك/.test(t)) return 'abandoned';
  if (/مجهول|لا يعرف|لا يُعرف|مستور/.test(t)) return 'unknown';
  if (/ضعيف|لين|سيء الحفظ|ليس بالقوي|واه|منكر الحديث/.test(t)) return 'weak';
  if (/صدوق|لا بأس به|ليس به بأس|مقبول|صالح الحديث/.test(t)) return 'mostly_reliable';
  if (/ثقة|ثقه|ثبت|حافظ|متقن|حجة|وثقوه|وثق|إمام/.test(t)) return 'reliable';
  return undefined;
}

/** Preferred when several works grade a transmitter differently. */
const GRADE_RANK: NarratorGrade[] = [
  'reliable',
  'mostly_reliable',
  'weak',
  'abandoned',
  'fabricator',
];

/**
 * Decide whether a profile filed under "companion" really belongs there.
 *
 * The merged database takes companionship from an entry in Ibn Ḥajar's
 * al-Iṣāba, but that work catalogues everyone who was *claimed* as a Companion
 * — including those it goes on to reject — so the bucket over-collects. Where a
 * profile's own ṭabaqa or death year contradicts the claim, the grade is
 * re-read from the other works that assessed him. Ibn Ḥajar putting a man in
 * ṭabaqa 1 is, conversely, as direct a statement of companionship as there is.
 */
function reconcileCompanionship(
  grade: NarratorGrade,
  tabaqa: number | undefined,
  diedAH: number | undefined,
  verdicts: RijalVerdict[],
): NarratorGrade {
  if (grade === 'companion') {
    const impossible =
      (tabaqa != null && tabaqa > 1) || (diedAH != null && diedAH > LAST_COMPANION_AH);
    if (!impossible) return grade;
    for (const candidate of GRADE_RANK) {
      if (verdicts.some((v) => v.gradeEn === candidate)) return candidate;
    }
    return 'unknown';
  }
  // Ṭabaqa 1 is al-ṣaḥāba; nothing else needs to agree.
  if (tabaqa === 1) return 'companion';
  if (grade === 'unknown') {
    for (const candidate of GRADE_RANK) {
      if (verdicts.some((v) => v.gradeEn === candidate)) return candidate;
    }
  }
  return grade;
}

function clean(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  if (IGNORED_VALUES.has(text.toLowerCase())) return undefined;
  return text;
}

export class RijalDatabase {
  private readonly profiles = new Map<number, RijalProfile>();
  /** Normalised surface form -> profile ids carrying it. */
  private readonly byName = new Map<string, number[]>();

  get size(): number {
    return this.profiles.size;
  }

  static load(cacheDir: string): RijalDatabase {
    const db = new RijalDatabase();
    for (const { file, grade } of GRADE_FILES) {
      const raw = JSON.parse(readFileSync(join(cacheDir, file), 'utf8')) as Record<string, any>;
      for (const entry of Object.values(raw)) db.add(entry, grade);
    }
    return db;
  }

  private add(entry: any, grade: NarratorGrade): void {
    const id = Number(entry.id);
    if (!Number.isFinite(id) || this.profiles.has(id)) return;

    const verdicts: RijalVerdict[] = [];
    for (const [key, value] of Object.entries(entry.classical_sources ?? {})) {
      const source = value as any;
      const gradeAr = clean(source?.grade_ar);
      let gradeEn = clean(source?.grade_en) as NarratorGrade | undefined;
      if (!gradeAr && (!gradeEn || gradeEn === 'unknown')) continue;
      // Most entries carry the critic's wording but no machine-readable grade.
      if (!gradeEn || gradeEn === 'unknown') gradeEn = gradeFromArabic(gradeAr) ?? gradeEn;
      const work = RIJAL_WORKS[key];
      verdicts.push({
        key,
        work: work?.work ?? key,
        author: work?.author,
        gradeEn,
        gradeAr,
      });
    }
    // al-Dhahabī's own one-word verdict is carried outside classical_sources.
    const dhahabi = clean(entry.dhahabi);
    if (dhahabi && !verdicts.some((v) => v.key === 'kashif')) {
      verdicts.push({
        key: 'dhahabi',
        work: 'al-Dhahabī',
        gradeAr: dhahabi,
        gradeEn: gradeFromArabic(dhahabi),
      });
    }

    const namings: string[] = [];
    const seen = new Set<string>();
    for (const naming of [entry.full_name, ...(entry.namings ?? [])]) {
      const value = clean(naming);
      if (!value) continue;
      const key = normaliseKey(value);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      namings.push(value);
    }

    const tabaqa =
      typeof entry.generation === 'number'
        ? entry.generation
        : parseTabaqa(entry.tabaqat, normaliseKey);
    const diedAH = parseDeathYear(entry.death);

    const profile: RijalProfile = {
      id,
      fullNameAr: clean(entry.full_name) ?? namings[0] ?? '',
      kunya: clean(entry.kunya),
      laqab: clean(entry.laqab),
      nasab: clean(entry.nasab),
      city: clean(entry.city),
      tabaqatAr: clean(entry.tabaqat),
      tabaqa,
      grade: reconcileCompanionship(grade, tabaqa, diedAH, verdicts),
      companionshipRejected:
        grade === 'companion' &&
        ((tabaqa != null && tabaqa > 1) || (diedAH != null && diedAH > LAST_COMPANION_AH)),
      gradeAr: clean(entry.grade_ar),
      diedRaw: clean(entry.death),
      diedAH,
      namings,
      verdicts,
      teachers: Array.isArray(entry.teachers) ? entry.teachers.map(Number) : [],
      students: Array.isArray(entry.students) ? entry.students.map(Number) : [],
      weight: verdicts.length + (Number(entry.id_score) || 0) / 100,
    };

    this.profiles.set(id, profile);
    for (const naming of namings) {
      const key = normaliseKey(naming);
      const bucket = this.byName.get(key);
      if (bucket) bucket.push(id);
      else this.byName.set(key, [id]);
    }
  }

  get(id: number): RijalProfile | undefined {
    return this.profiles.get(id);
  }

  /** Is this surface form attested anywhere in the biographical literature? */
  isAttested(name: string): boolean {
    return this.candidatesFor(name) !== undefined;
  }

  /**
   * Find the profiles a surface form could denote. Isnads carry names with
   * incidental material around them (`الحميدي عبد الله بن الزبير`), so we look
   * for the longest contiguous run of words that the literature attests.
   */
  private candidatesFor(name: string): { ids: number[]; key: string } | undefined {
    let words = normaliseKey(name).split(' ').filter(Boolean);
    words = stripTitles(words);
    if (!words.length) return undefined;

    // A one-word name is only ever matched as itself. Falling back to a single
    // word of a longer name is what turns `ابن عمر` into a different ʿUmar and
    // `أبي هريرة` into Ubayy ibn Kaʿb, so shorter spans need two words.
    const floor = words.length === 1 ? 1 : 2;

    for (let span = words.length; span >= floor; span--) {
      // Trailing words first: nisbas and epithets are appended more often
      // than honorifics are prepended.
      for (const [start, run] of spansOfLength(words, span)) {
        // `بن` joins a name, it never bounds one. `ابن` does begin a name —
        // `ابن عباس` — but only where the surface itself begins.
        if (run[0] === 'بن' || run[run.length - 1] === 'بن') continue;
        if (run[0] === 'ابن' && start > 0) continue;
        const key = run.join(' ');
        for (const variant of kunyaVariants(key)) {
          const ids = this.byName.get(variant);
          if (ids) return { ids, key: variant };
        }
      }
    }
    return undefined;
  }

  /**
   * Resolve a whole chain at once, in compiler-first order.
   *
   * Pass one takes every name with a single candidate. Pass two scores the
   * remaining names against the profiles already fixed around them, using the
   * teacher/student records and the fact that ṭabaqa falls as a chain runs
   * back towards the Prophet.
   */
  resolveChain(names: string[], reachedProphet = false): Resolution[] {
    const found = names.map((name) => this.candidatesFor(name));
    const out: Resolution[] = names.map((surface, i) => ({
      surface,
      ambiguous: false,
      candidates: found[i]?.ids.length ?? 0,
    }));

    for (let i = 0; i < names.length; i++) {
      const hit = found[i];
      if (hit && hit.ids.length === 1) out[i].profile = this.profiles.get(hit.ids[0]);
    }

    // Two sweeps: names fixed by the first give the second more to go on.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < names.length; i++) {
        const hit = found[i];
        if (!hit || hit.ids.length === 1) continue;

        let best: RijalProfile | undefined;
        let bestScore = -Infinity;
        let runnerUp = -Infinity;

        for (const id of hit.ids) {
          const candidate = this.profiles.get(id);
          if (!candidate) continue;
          const score = this.score(candidate, i, out, hit.key, reachedProphet);
          if (score > bestScore) {
            runnerUp = bestScore;
            bestScore = score;
            best = candidate;
          } else if (score > runnerUp) {
            runnerUp = score;
          }
        }

        // Always take the best reading — refusing to choose would split one
        // narrator into a node per spelling and destroy the graph. Flag it
        // when the choice was close, so the panel can qualify it.
        out[i].profile = best;
        out[i].ambiguous = bestScore - runnerUp < CLEAR_MARGIN;
      }
    }

    return out;
  }

  /** Score how well a candidate fits position `i` of a partially fixed chain. */
  private score(
    candidate: RijalProfile,
    i: number,
    chain: Resolution[],
    key: string,
    reachedProphet: boolean,
  ): number {
    let score = 0;

    // The last link of a chain that reaches the Prophet heard the report from
    // him, which makes that person a Companion by definition — and rules out
    // the later namesakes that crowd the index.
    if (reachedProphet && i === chain.length - 1) {
      if (candidate.grade === 'companion') score += 6;
      if (candidate.diedAH != null && candidate.diedAH > LAST_COMPANION_AH) score -= 12;
    }

    // The strongest non-contextual signal: the matched span is what this
    // person is actually called, not a patronymic buried in someone else's
    // lineage. `أبو سلمة بن عبد الرحمن` names Abū Salama, not his father.
    //
    // It only counts for someone the classical literature actually discusses.
    // The merged database also holds bare stubs whose whole "full name" is the
    // alias itself, and without this guard they win every alias outright.
    const fullKey = normaliseKey(candidate.fullNameAr);
    if (candidate.verdicts.length) {
      if (fullKey === key) score += 8;
      else if (fullKey.startsWith(`${key} `)) score += 6;
    }

    // Index artefacts: a name is not a name if it carries a catalogue number.
    if (/\d/.test(candidate.fullNameAr)) score -= 10;

    // A transmitter the sources name many ways, and record with a lineage, is
    // a figure they were interested in — and the likelier referent of a bare
    // alias like `ابن عباس`.
    score += Math.min(candidate.namings.length, 20) * 0.15;
    if (candidate.fullNameAr.split(/\s+/).length >= 4) score += 2;

    // Direct teacher/student evidence from the biographical records. The chain
    // is compiler-first, so chain[i+1] taught chain[i].
    const earlier = chain[i + 1]?.profile; // closer to the Prophet: a teacher
    const later = chain[i - 1]?.profile; // closer to the compiler: a student
    if (earlier && candidate.teachers.includes(earlier.id)) score += LINK_EVIDENCE;
    if (earlier && earlier.students.includes(candidate.id)) score += LINK_EVIDENCE;
    if (later && candidate.students.includes(later.id)) score += LINK_EVIDENCE;
    if (later && later.teachers.includes(candidate.id)) score += LINK_EVIDENCE;

    // Ṭabaqa must fall as the chain runs back towards the Prophet.
    if (candidate.tabaqa != null) {
      if (earlier?.tabaqa != null) score += candidate.tabaqa > earlier.tabaqa ? 4 : -6;
      if (later?.tabaqa != null) score += candidate.tabaqa < later.tabaqa ? 4 : -6;
    }

    // Death years must be compatible with the same ordering.
    if (candidate.diedAH != null) {
      if (earlier?.diedAH != null) score += candidate.diedAH > earlier.diedAH ? 2 : -4;
      if (later?.diedAH != null) score += candidate.diedAH < later.diedAH ? 2 : -4;
    }

    // Only as a tie-break: the better-attested figure is the likelier referent.
    return score + Math.min(candidate.weight, 8) / 10;
  }
}

/**
 * Honorific titles an isnad may prefix to a name. They are never part of what
 * the biographical dictionaries index the person under.
 */
const TITLES = [
  ['امير', 'المومنين'],
  ['ام', 'المومنين'],
  ['الامام'],
  ['الحافظ'],
  ['الشيخ'],
  ['سيدنا'],
  ['مولانا'],
];

function stripTitles(words: string[]): string[] {
  for (const title of TITLES) {
    if (
      words.length > title.length &&
      title.every((word, i) => words[i] === word)
    ) {
      return words.slice(title.length);
    }
  }
  return words;
}

/**
 * Spans of a given length, ordered so that trimming the end is tried before
 * trimming the front.
 */
function spansOfLength(words: string[], span: number): [number, string[]][] {
  const runs: [number, string[]][] = [];
  for (let start = 0; start + span <= words.length; start++) {
    runs.push([start, words.slice(start, start + span)]);
  }
  return runs;
}

/**
 * A kunya is declined by case — `أبو` nominative, `أبي` genitive, `أبا`
 * accusative — but indexed under one form. Try the alternatives.
 */
function kunyaVariants(key: string): string[] {
  if (key.startsWith('ابي ') || key.startsWith('ابا ')) {
    return [key, `ابو ${key.slice(4)}`];
  }
  if (key.startsWith('ابو ')) {
    return [key, `ابي ${key.slice(4)}`];
  }
  return [key];
}

/** Score contributed by one corroborating teacher/student record. */
const LINK_EVIDENCE = 10;

/** How far ahead the winner must be for the identification to count as clear. */
const CLEAR_MARGIN = 3;


