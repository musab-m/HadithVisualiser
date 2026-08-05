/**
 * Ways of dividing the corpus that the data can actually support.
 *
 * Two groups, and they are not equally certain, which is why they are kept
 * apart in the interface as well as here.
 *
 * The chain shapes are exact: they restate what the graph already draws, read
 * off the same generations and the same rule that colours the lines. A hadith
 * either has a step running back up a generation or it does not.
 *
 * The rulings are one critic's, and only where he gave one — a little over a
 * third of the corpus, all of it in the four Sunan.
 *
 * Deliberately absent: **marfūʿ, mawqūf and maqṭūʿ**. They look derivable —
 * whether the chain reached the Prophet, and which generation it stopped at —
 * and they are not. Checked against the cases where al-Albānī names the
 * category himself, that derivation agreed 31 times in 96, and on mawqūf 3
 * times in 21. The reason is that the parser can tell the Prophet is
 * *mentioned* but not that the report is *attributed* to him, which is the
 * whole distinction. A filter that wrong on a question this precise would be
 * worse than no filter.
 */

import type { HadithRecord, NarratorIndexEntry } from '../corpus/types';
import { pathOf } from './path';

/** Matches `SUBLEVEL_SPREAD` in the graph builder; see `positionOf`. */
const SUBLEVEL_SPREAD = 0.66;

/** How close two narrators must sit to count as contemporaries. */
const SAME_AGE = 0.02;

export interface Kind {
  id: string;
  label: string;
  /** The classical term, where there is one worth naming. */
  term?: string;
  hint: string;
}

export interface KindGroup {
  id: string;
  label: string;
  note: string;
  kinds: Kind[];
}

export const KIND_GROUPS: KindGroup[] = [
  {
    id: 'ruling',
    label: 'Ruled by al-Albānī',
    note: 'His rulings cover the four Sunan; a hadith he did not rule on matches none of these.',
    kinds: [
      { id: 'sahih', label: 'sound', term: 'ṣaḥīḥ', hint: 'including ṣaḥīḥ li-ghayrihi' },
      { id: 'hasan', label: 'good', term: 'ḥasan', hint: 'including ḥasan ṣaḥīḥ' },
      { id: 'daif', label: 'weak', term: 'ḍaʿīf', hint: 'including weak in the chain alone' },
      { id: 'munkar', label: 'denounced or anomalous', term: 'munkar · shādhdh', hint: '' },
      { id: 'mawdu', label: 'fabricated', term: 'mawḍūʿ', hint: '' },
    ],
  },
  {
    id: 'chain',
    label: 'The shape of the chain',
    note: 'Read from the chain itself, so these are exact — the same reading the graph is drawn from.',
    kinds: [
      {
        id: 'backward',
        label: 'a senior narrating from a junior',
        term: 'riwāyat al-akābir ʿan al-aṣāghir',
        hint: 'somewhere in the chain a narrator takes from a later generation',
      },
      {
        id: 'peer',
        label: 'transmission between contemporaries',
        term: 'riwāyat al-aqrān',
        hint: 'two narrators of the same generation, one from the other',
      },
      {
        id: 'high',
        label: 'a short chain',
        term: 'isnād ʿālī',
        hint: 'three narrators or fewer between the compiler and the Prophet',
      },
      {
        id: 'unreached',
        label: 'not traced to the Prophet',
        hint: 'the chain as parsed stops before him',
      },
    ],
  },
  {
    id: 'who',
    label: 'Who is in the chain',
    note: 'Read from how the literature names a narrator — bint, an umm kunya, or ṣaḥābiyya said outright. It finds 209 women; one named by neither would be missed.',
    kinds: [
      {
        id: 'women',
        label: 'a woman transmitted it',
        term: 'riwāyat al-nisāʾ',
        hint: 'somewhere in the chain, including the Companion at its head',
      },
    ],
  },
];

export const ALL_KINDS: Kind[] = KIND_GROUPS.flatMap((g) => g.kinds);

/**
 * Which ruling a grade string belongs to.
 *
 * Ordered by severity so a compound verdict lands on its heaviest term:
 * `Da'if Munkar` is denounced, not merely weak. `Hasan Sahih` is the exception
 * the sources treat as its own category and is counted under both, since a
 * reader looking for either would expect to find it.
 */
export function rulingsIn(grade: string): string[] {
  const text = grade.toLowerCase();
  if (/maudu|mawdu/.test(text)) return ['mawdu'];
  if (/munkar|shadh/.test(text)) return ['munkar'];

  const out: string[] = [];
  if (/da'if|daif|da if/.test(text)) out.push('daif');
  if (/hasan/.test(text)) out.push('hasan');
  if (/sahih/.test(text)) out.push('sahih');
  return out;
}

/** A narrator's place on the vertical axis, generation plus their rank in it. */
function positionOf(entry: NarratorIndexEntry | undefined): number | undefined {
  return entry ? entry.gen + (entry.sub ?? 0.5) * SUBLEVEL_SPREAD : undefined;
}

/**
 * Every kind a hadith belongs to.
 *
 * The chain is walked as the graph walks it — the Prophet, the narrators, then
 * the compiler — so what this reports and what the viewer can see are the same
 * thing.
 */
export function kindsOf(
  hadith: HadithRecord,
  bookSlug: string,
  narrators: Map<string, NarratorIndexEntry>,
): string[] {
  const kinds: string[] = [];

  if (hadith.grade) kinds.push(...rulingsIn(hadith.grade));
  if (!hadith.toProphet) kinds.push('unreached');
  // The compiler and the Prophet are not in `chain`, and neither is a woman.
  if (hadith.chain.some((id) => narrators.get(id)?.w)) kinds.push('women');
  if (!hadith.chain.length) return kinds;
  if (hadith.chain.length <= 3) kinds.push('high');

  // Walked as the graph walks it, from the one definition of the path, so a
  // count and the picture it describes can never disagree — including about
  // whether there is a step from the Prophet at all.
  let backward = false;
  let peer = false;
  for (const step of pathOf(hadith, bookSlug)) {
    const from = positionOf(narrators.get(step.from));
    const to = positionOf(narrators.get(step.to));
    if (from === undefined || to === undefined) continue;
    const drop = to - from;
    if (Math.abs(drop) <= SAME_AGE) peer = true;
    else if (drop < 0) backward = true;
  }
  if (backward) kinds.push('backward');
  if (peer) kinds.push('peer');

  return kinds;
}

/**
 * Whether a hadith survives the chosen filters.
 *
 * Within a group the choices widen — sound *or* good — and between groups they
 * narrow: sound, *and* carried by a short chain. That is how a reader reads a
 * row of tick boxes, and the alternative makes picking two rulings return
 * nothing at all.
 */
export function matchesKinds(chosen: Set<string>, kinds: string[]): boolean {
  if (!chosen.size) return true;
  const has = new Set(kinds);
  for (const group of KIND_GROUPS) {
    const wanted = group.kinds.filter((k) => chosen.has(k.id));
    if (!wanted.length) continue;
    if (!wanted.some((k) => has.has(k.id))) return false;
  }
  return true;
}
