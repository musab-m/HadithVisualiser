/**
 * Turns a selection of hadiths into the graph that gets drawn.
 *
 * Every hadith contributes one path — Prophet → transmitters → compiler — and
 * the graph is the union of those paths. Narrators shared between chains are
 * shared nodes, which is what makes the shape informative: the wide fans are
 * the transmitters everything passes through.
 */

import { NARRATOR_GRADES, type BookFile, type HadithRecord, type NarratorGrade, type NarratorIndexEntry } from '../corpus/types';
import { nodesOf, pathOf } from './path';

/** How a link sits relative to the generations it joins. */
export const LINK_FORWARD = 0;
/** Between contemporaries — riwāyat al-aqrān. */
export const LINK_PEER = 1;
/** From a later generation to an earlier one — riwāyat al-akābir ʿan al-aṣāghir. */
export const LINK_BACKWARD = 2;

export interface GraphData {
  /** Node index → narrator id. */
  ids: string[];
  index: Map<string, number>;
  /**
   * Layer: 0 is the Prophet, 1 the Companions, rising with distance.
   *
   * Read from the narrator registry, where it is settled once across the whole
   * corpus from the chains, Ibn Ḥajar's ṭabaqāt and the company each narrator
   * keeps. Deriving it here from the selection instead would move a man a
   * generation whenever a book was toggled, and would throw away everything
   * the biographical literature already knows about people the chains barely
   * mention. A selection that skips a generation now shows the gap, which is
   * itself worth seeing — it is an elevated chain.
   */
  gen: Int32Array;
  /**
   * Position within the generation, `gen` plus a fraction, ordered by death
   * year so the seniors of a generation sit above its juniors.
   */
  genExact: Float32Array;
  /**
   * How many selected hadiths pass through this narrator — hadiths, not
   * appearances. A chain that names someone twice is still one hadith through
   * them, and counting it twice would put the node's own figure at odds with
   * what isolating on them actually draws.
   */
  weight: Float32Array;
  /** Index into NARRATOR_GRADES. */
  grade: Uint8Array;
  /** Flat pairs of node indices. */
  edges: Uint32Array;
  /** How many selected hadiths run along each edge. */
  edgeWeight: Float32Array;
  /** Per edge: LINK_FORWARD, LINK_PEER or LINK_BACKWARD. */
  edgeKind: Uint8Array;
  /** Per edge: 1 where no chain attests the two ends hearing it directly. */
  edgeGap: Uint8Array;
  /** How many edges of each kind, for the legend. */
  linkCounts: { peer: number; backward: number; gap: number };
  /** Total hadiths represented. */
  hadithCount: number;
}

const GRADE_INDEX = new Map<NarratorGrade, number>(
  NARRATOR_GRADES.map((grade, i) => [grade, i]),
);

/**
 * Spread within one generation, as a fraction of the gap to the next. Kept
 * below 1 so a generation never bleeds into the one beneath it.
 */
const SUBLEVEL_SPREAD = 0.66;

/**
 * How close in position two narrators must be to count as contemporaries.
 * Narrators with no recorded death year all sit mid-band, so ties are common
 * and mean only that nothing separates them.
 */
const SAME_AGE = 0.02;



export function buildGraph(
  selection: { book: BookFile; hadiths: HadithRecord[] }[],
  narrators: Map<string, NarratorIndexEntry>,
): GraphData {
  const ids: string[] = [];
  const index = new Map<string, number>();
  /** Only a fallback now that generations come from the registry. */
  const depths: number[][] = [];
  const weights: number[] = [];
  /** The last hadith counted against each node, so none is counted twice. */
  const counted: number[] = [];

  const nodeFor = (id: string): number => {
    let at = index.get(id);
    if (at === undefined) {
      at = ids.length;
      index.set(id, at);
      ids.push(id);
      depths.push([]);
      weights.push(0);
      counted.push(-1);
    }
    return at;
  };

  const edgeWeights = new Map<number, number>();
  /*
    How many of an edge's occurrences were jumps over somebody unnamed. Held
    per edge rather than per hadith because the graph is a union: the same two
    men may be a hearing in one isnad and a jump in another, and if any chain
    attests them directly the link is real. Only an edge that is *never*
    attested directly is drawn as a gap.
  */
  const edgeGaps = new Map<number, number>();
  let hadithCount = 0;

  for (const { book, hadiths } of selection) {
    for (const hadith of hadiths) {
      if (!hadith.chain.length) continue;
      const ordinal = hadithCount++;

      nodesOf(hadith, book.slug).forEach((id, depth) => {
        const node = nodeFor(id);
        depths[node].push(depth);
        if (counted[node] !== ordinal) {
          counted[node] = ordinal;
          weights[node]++;
        }
      });

      for (const step of pathOf(hadith, book.slug)) {
        const from = nodeFor(step.from);
        const to = nodeFor(step.to);
        if (from === to) continue;
        // Pack the pair into one number: 2^22 node ids keeps the key inside
        // the exactly-representable integer range.
        const key = from * 4194304 + to;
        edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1);
        if (step.gap) edgeGaps.set(key, (edgeGaps.get(key) ?? 0) + 1);
      }
    }
  }

  const count = ids.length;
  const gen = new Int32Array(count);
  const genExact = new Float32Array(count);
  const weight = new Float32Array(count);
  const grade = new Uint8Array(count);

  for (let i = 0; i < count; i++) {
    const entry = narrators.get(ids[i]);
    // Fall back to the shortest position seen here only for a narrator the
    // registry has never met, which should not happen.
    gen[i] = entry?.gen ?? (depths[i].length ? Math.min(...depths[i]) : 0);
    genExact[i] = gen[i] + (entry?.sub ?? 0.5) * SUBLEVEL_SPREAD;
    weight[i] = weights[i];
    grade[i] = GRADE_INDEX.get(entry?.grade ?? 'unknown') ?? GRADE_INDEX.get('unknown')!;
  }

  const edges = new Uint32Array(edgeWeights.size * 2);
  const edgeWeight = new Float32Array(edgeWeights.size);
  const edgeKind = new Uint8Array(edgeWeights.size);
  const edgeGap = new Uint8Array(edgeWeights.size);
  const linkCounts = { peer: 0, backward: 0, gap: 0 };
  let e = 0;
  for (const [key, value] of edgeWeights) {
    const from = Math.floor(key / 4194304);
    const to = key % 4194304;
    edges[e * 2] = from;
    edges[e * 2 + 1] = to;
    edgeWeight[e] = value;
    // Never once attested as a hearing: every chain drawing these two jumped
    // over somebody between them.
    if ((edgeGaps.get(key) ?? 0) === value) {
      edgeGap[e] = 1;
      linkCounts.gap++;
    }
    // Compared at the finer position, not the whole-number band. Chain depth
    // is coarser than the ṭabaqāt, so a father and his son often share a
    // generation; ranking within it by death year still puts the son below,
    // and that link is ordinary transmission rather than transmission between
    // contemporaries. Only where age cannot separate them either does it read
    // as a peer.
    const drop = genExact[to] - genExact[from];
    if (Math.abs(drop) <= SAME_AGE) {
      edgeKind[e] = LINK_PEER;
      linkCounts.peer++;
    } else if (drop < 0) {
      edgeKind[e] = LINK_BACKWARD;
      linkCounts.backward++;
    }
    e++;
  }
  return {
    ids,
    index,
    gen,
    genExact,
    weight,
    grade,
    edges,
    edgeWeight,
    edgeKind,
    edgeGap,
    linkCounts,
    hadithCount,
  };
}
