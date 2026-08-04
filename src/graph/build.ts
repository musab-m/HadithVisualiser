/**
 * Turns a selection of hadiths into the graph that gets drawn.
 *
 * Every hadith contributes one path — Prophet → transmitters → compiler — and
 * the graph is the union of those paths. Narrators shared between chains are
 * shared nodes, which is what makes the shape informative: the wide fans are
 * the transmitters everything passes through.
 */

import { NARRATOR_GRADES, PROPHET_ID, collectorId, type BookFile, type HadithRecord, type NarratorGrade, type NarratorIndexEntry } from '../corpus/types';

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
   * Taken as the shortest distance the chains reliably put between this
   * narrator and the Prophet. A man who heard from a Companion belongs to the
   * generation after the Companions however many longer routes also run
   * through him — the extra links in those are intermediaries, not elapsed
   * time. See GENERATION_PERCENTILE for why this is not the outright minimum.
   */
  gen: Int32Array;
  /**
   * Position within the generation, `gen` plus a fraction. Ordered by death
   * year, so the older half of a generation sits above the younger half and
   * the sub-levels within a layer are visible.
   */
  genExact: Float32Array;
  /** How many selected hadiths pass through this narrator. */
  weight: Float32Array;
  /** Index into NARRATOR_GRADES. */
  grade: Uint8Array;
  /** Flat pairs of node indices. */
  edges: Uint32Array;
  /** How many selected hadiths run along each edge. */
  edgeWeight: Float32Array;
  /** Per edge: LINK_FORWARD, LINK_PEER or LINK_BACKWARD. */
  edgeKind: Uint8Array;
  /** How many edges of each kind, for the legend. */
  linkCounts: { peer: number; backward: number };
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
 * Which end of a narrator's observed depths sets his generation.
 *
 * The shortest chain ought to settle it, but the outright minimum is wrong in
 * practice: a *mursal* chain, where a Successor reports straight from the
 * Prophet with the Companion left out, is a recognised form and there are
 * enough of them that al-Zuhrī — a Successor by every account — comes out as a
 * Companion, and Mālik with him. Discounting the shortest tenth keeps the
 * principle (shortest wins over typical) while surviving chains that are short
 * because a link is missing rather than because none was needed.
 *
 * With few observations there is nothing to discount and this is the minimum.
 */
const GENERATION_PERCENTILE = 0.1;

/** The depth at GENERATION_PERCENTILE through the sorted observations. */
function shortestReliable(depths: number[]): number {
  const sorted = [...depths].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * GENERATION_PERCENTILE)];
}

export function buildGraph(
  selection: { book: BookFile; hadiths: HadithRecord[] }[],
  narrators: Map<string, NarratorIndexEntry>,
): GraphData {
  const ids: string[] = [];
  const index = new Map<string, number>();
  const depths: number[][] = [];
  /** Depths seen only in chains that actually reach the Prophet. */
  const anchored: number[][] = [];
  const weights: number[] = [];

  const nodeFor = (id: string): number => {
    let at = index.get(id);
    if (at === undefined) {
      at = ids.length;
      index.set(id, at);
      ids.push(id);
      depths.push([]);
      anchored.push([]);
      weights.push(0);
    }
    return at;
  };

  const edgeWeights = new Map<number, number>();
  let hadithCount = 0;

  for (const { book, hadiths } of selection) {
    const collector = collectorId(book.slug);
    for (const hadith of hadiths) {
      if (!hadith.chain.length) continue;
      hadithCount++;
      const path = [PROPHET_ID, ...hadith.chain, collector];
      let previous = -1;
      path.forEach((id, depth) => {
        const node = nodeFor(id);
        depths[node].push(depth);
        // A chain that peters out before the Prophet has no fixed origin, so
        // the depths along it are offsets from nothing. They still describe the
        // link structure, but they cannot set anybody's generation.
        if (hadith.toProphet) anchored[node].push(depth);
        weights[node]++;
        if (previous >= 0 && previous !== node) {
          // Pack the pair into one number: 2^22 node ids keeps the key inside
          // the exactly-representable integer range.
          const key = previous * 4194304 + node;
          edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1);
        }
        previous = node;
      });
    }
  }

  const count = ids.length;
  const gen = new Int32Array(count);
  const genExact = new Float32Array(count);
  const weight = new Float32Array(count);
  const grade = new Uint8Array(count);

  const died = new Array<number | undefined>(count);
  for (let i = 0; i < count; i++) {
    const observed = anchored[i].length ? anchored[i] : depths[i];
    gen[i] = observed.length ? shortestReliable(observed) : 0;
    weight[i] = weights[i];
    const entry = narrators.get(ids[i]);
    died[i] = entry?.d;
    grade[i] = GRADE_INDEX.get(entry?.grade ?? 'unknown') ?? GRADE_INDEX.get('unknown')!;
  }

  placeWithinGeneration(gen, died, genExact);

  const edges = new Uint32Array(edgeWeights.size * 2);
  const edgeWeight = new Float32Array(edgeWeights.size);
  const edgeKind = new Uint8Array(edgeWeights.size);
  const linkCounts = { peer: 0, backward: 0 };
  let e = 0;
  for (const [key, value] of edgeWeights) {
    const from = Math.floor(key / 4194304);
    const to = key % 4194304;
    edges[e * 2] = from;
    edges[e * 2 + 1] = to;
    edgeWeight[e] = value;
    // Transmission normally runs from an earlier generation to a later one.
    // Where it does not, the sources have a name for it, and it is worth
    // seeing: contemporaries passing to each other, or an older man taking a
    // report from someone junior to him.
    if (gen[to] === gen[from]) {
      edgeKind[e] = LINK_PEER;
      linkCounts.peer++;
    } else if (gen[to] < gen[from]) {
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
    linkCounts,
    hadithCount,
  };
}

/**
 * Give every narrator a place inside their generation, ordered by death year.
 *
 * A generation is not an instant — its members were born decades apart, and
 * the older of them were transmitting while the younger were still learning.
 * Ranking each layer by when its members died puts the seniors at the top of
 * their band and the juniors at the bottom, which is what makes a link running
 * back up to an earlier generation legible rather than looking like an error.
 */
function placeWithinGeneration(
  gen: Int32Array,
  died: (number | undefined)[],
  out: Float32Array,
): void {
  const layers = new Map<number, number[]>();
  for (let i = 0; i < gen.length; i++) {
    const members = layers.get(gen[i]);
    if (members) members.push(i);
    else layers.set(gen[i], [i]);
  }

  for (const [layer, members] of layers) {
    // Undated narrators cannot be ordered, so they sit in the middle of their
    // generation rather than being asserted into the senior or junior half.
    const dated = members.filter((i) => died[i] != null);
    dated.sort((a, b) => died[a]! - died[b]!);

    const rank = new Map<number, number>();
    dated.forEach((node, at) => rank.set(node, dated.length === 1 ? 0.5 : at / (dated.length - 1)));

    for (const node of members) {
      const position = rank.get(node) ?? 0.5;
      out[node] = layer + position * SUBLEVEL_SPREAD;
    }
  }
}
