/**
 * Turns a selection of hadiths into the graph that gets drawn.
 *
 * Every hadith contributes one path — Prophet → transmitters → compiler — and
 * the graph is the union of those paths. Narrators shared between chains are
 * shared nodes, which is what makes the shape informative: the wide fans are
 * the transmitters everything passes through.
 */

import { NARRATOR_GRADES, PROPHET_ID, collectorId, type BookFile, type HadithRecord, type NarratorGrade, type NarratorIndexEntry } from '../corpus/types';

export interface GraphData {
  /** Node index → narrator id. */
  ids: string[];
  index: Map<string, number>;
  /** Layer: 0 is the Prophet, rising with distance down the chain. */
  gen: Int32Array;
  /**
   * The same figure as a mean rather than a median. A narrator who sits fifth
   * in most chains and third in some belongs a little above one who is always
   * fifth, and letting that show keeps the layers from reading as flat discs.
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
  /** Total hadiths represented. */
  hadithCount: number;
}

const GRADE_INDEX = new Map<NarratorGrade, number>(
  NARRATOR_GRADES.map((grade, i) => [grade, i]),
);

/** Median without sorting cost mattering — depth lists are short. */
function median(values: number[]): number {
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

export function buildGraph(
  selection: { book: BookFile; hadiths: HadithRecord[] }[],
  narrators: Map<string, NarratorIndexEntry>,
): GraphData {
  const ids: string[] = [];
  const index = new Map<string, number>();
  const depths: number[][] = [];
  const weights: number[] = [];

  const nodeFor = (id: string): number => {
    let at = index.get(id);
    if (at === undefined) {
      at = ids.length;
      index.set(id, at);
      ids.push(id);
      depths.push([]);
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

  for (let i = 0; i < count; i++) {
    // The median keeps one unusual chain from lifting a narrator out of the
    // generation he sits in everywhere else.
    gen[i] = depths[i].length ? median(depths[i]) : 0;
    genExact[i] = depths[i].length
      ? depths[i].reduce((sum, d) => sum + d, 0) / depths[i].length
      : 0;
    weight[i] = weights[i];
    const entry = narrators.get(ids[i]);
    grade[i] = GRADE_INDEX.get(entry?.grade ?? 'unknown') ?? GRADE_INDEX.get('unknown')!;
  }

  const edges = new Uint32Array(edgeWeights.size * 2);
  const edgeWeight = new Float32Array(edgeWeights.size);
  let e = 0;
  for (const [key, value] of edgeWeights) {
    edges[e * 2] = Math.floor(key / 4194304);
    edges[e * 2 + 1] = key % 4194304;
    edgeWeight[e] = value;
    e++;
  }
  return { ids, index, gen, genExact, weight, grade, edges, edgeWeight, hadithCount };
}
