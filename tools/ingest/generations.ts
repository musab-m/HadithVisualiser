/**
 * Assigns every narrator a generation, once, for the whole corpus.
 *
 * Deriving this per view was unstable — the same man came out a generation
 * apart depending on which books were showing — and deriving it from chain
 * position alone throws away what the biographical literature already settled.
 * So it is computed here, at ingest, from three sources in order of how much
 * they can be trusted for a given narrator:
 *
 *   1. His own chains, where there are enough of them to be sure. The shortest
 *      route wins: extra links in a longer chain are intermediaries, not
 *      elapsed time.
 *   2. Ibn Ḥajar's ṭabaqa, calibrated against those chains. The twelve ṭabaqāt
 *      of the Taqrīb track chain depth closely — ṭabaqa 1, the Companions,
 *      lands on generation 1 — so where the chains are too thin to speak, his
 *      classification does.
 *   3. The company he keeps. Someone who transmits to a narrator of a known
 *      generation belongs before them, and someone who receives from one
 *      belongs after; a narrator with neither chains nor a ṭabaqa can still be
 *      placed from the people either side of him.
 *
 * Every narrator records which of the three placed him, so the panel can say
 * so rather than presenting a guess and a fact in the same voice.
 */

export type GenerationSource = 'chains' | 'tabaqa' | 'inferred' | 'position';

export interface GenerationInput {
  /** Narrator ids in transmission order, Prophet first, compiler last. */
  chains: { path: string[]; toProphet: boolean }[];
  /** Ibn Ḥajar's ṭabaqa, 1–12, for the narrators that have one. */
  tabaqa: Map<string, number>;
  /** Death year in hijri, for ordering within a generation. */
  died: Map<string, number>;
}

export interface GenerationResult {
  gen: Map<string, number>;
  source: Map<string, GenerationSource>;
  /** Position within the generation, 0 (senior) to 1 (junior). */
  sub: Map<string, number>;
  /** The ṭabaqa → generation mapping this corpus produced. */
  calibration: Map<number, number>;
  counts: Record<GenerationSource, number>;
}

/**
 * Appearances in Prophet-reaching chains before a narrator's own chains are
 * allowed to settle his generation. Below this a single elided link — a mursal
 * chain, a kin reference the parser could not resolve — would set it alone.
 */
const MIN_ANCHORED = 3;

/**
 * Which end of the observed depths to take. Not the outright minimum: mursal
 * chains, where a Successor reports straight from the Prophet with the
 * Companion left out, are common enough to make al-Zuhrī a Companion.
 */
const SHORT_END = 0.1;

function percentile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * q)];
}

function median(values: number[]): number {
  return percentile(values, 0.5);
}

export function assignGenerations(input: GenerationInput): GenerationResult {
  const { chains, tabaqa, died } = input;

  // --- what the chains say --------------------------------------------------
  const anchored = new Map<string, number[]>();
  const observed = new Map<string, number[]>();
  const before = new Map<string, Set<string>>(); // id -> those he transmitted to
  const after = new Map<string, Set<string>>(); // id -> those he received from

  const push = (map: Map<string, number[]>, id: string, depth: number) => {
    const list = map.get(id);
    if (list) list.push(depth);
    else map.set(id, [depth]);
  };
  const link = (map: Map<string, Set<string>>, from: string, to: string) => {
    const set = map.get(from);
    if (set) set.add(to);
    else map.set(from, new Set([to]));
  };

  for (const { path, toProphet } of chains) {
    path.forEach((id, depth) => {
      push(observed, id, depth);
      if (toProphet) push(anchored, id, depth);
      if (depth > 0 && path[depth - 1] !== id) {
        link(before, path[depth - 1], id);
        link(after, id, path[depth - 1]);
      }
    });
  }

  const gen = new Map<string, number>();
  const source = new Map<string, GenerationSource>();

  for (const [id, depths] of anchored) {
    if (depths.length < MIN_ANCHORED) continue;
    gen.set(id, percentile(depths, SHORT_END));
    source.set(id, 'chains');
  }

  // --- calibrate the ṭabaqāt against them -----------------------------------
  // Learned from this corpus rather than assumed, so the mapping reflects the
  // books actually ingested.
  const samples = new Map<number, number[]>();
  for (const [id, value] of gen) {
    const t = tabaqa.get(id);
    if (t == null) continue;
    const list = samples.get(t);
    if (list) list.push(value);
    else samples.set(t, [value]);
  }
  const calibration = new Map<number, number>();
  for (const [t, values] of samples) {
    if (values.length >= 5) calibration.set(t, median(values));
  }
  // Ṭabaqāt with too few samples borrow from their neighbours, which is safe
  // because the mapping is monotone: a later ṭabaqa is never an earlier
  // generation.
  let carried = 1;
  for (let t = 1; t <= 12; t++) {
    const value = calibration.get(t);
    if (value == null) calibration.set(t, carried);
    else carried = Math.max(carried, value);
    calibration.set(t, Math.max(calibration.get(t)!, carried));
    carried = calibration.get(t)!;
  }

  for (const [id, t] of tabaqa) {
    const value = calibration.get(t);
    if (value == null) continue;
    const fromChains = gen.get(id);
    if (fromChains == null) {
      gen.set(id, value);
      source.set(id, 'tabaqa');
      continue;
    }
    // Where both speak, the ṭabaqa is a floor rather than a tie-break. A chain
    // can only ever make a narrator look earlier than he was — that is what an
    // elided link does — so a ṭabaqa placing him later is correcting for one.
    // ʿUrwa ibn al-Zubayr has enough mursal narrations to read as a Companion
    // from the chains alone; Ibn Ḥajar puts him among the Successors, and he is
    // right.
    if (value > fromChains) {
      gen.set(id, value);
      source.set(id, 'tabaqa');
    }
  }

  // --- place the rest by their neighbours -----------------------------------
  // A few sweeps: each one lets a narrator placed in the previous sweep speak
  // for the people around him.
  for (let sweep = 0; sweep < 4; sweep++) {
    let placed = 0;
    for (const id of observed.keys()) {
      if (gen.has(id)) continue;
      const implied: number[] = [];
      for (const student of before.get(id) ?? []) {
        const value = gen.get(student);
        if (value != null) implied.push(value - 1);
      }
      for (const teacher of after.get(id) ?? []) {
        const value = gen.get(teacher);
        if (value != null) implied.push(value + 1);
      }
      if (!implied.length) continue;
      // Only the Prophet stands at zero. Anyone inferred below the Companions
      // is a span the parser mistook for a name.
      gen.set(id, Math.max(1, Math.round(median(implied))));
      source.set(id, 'inferred');
      placed++;
    }
    if (!placed) break;
  }

  // Anything still unplaced only ever appeared in chains that went nowhere.
  for (const [id, depths] of observed) {
    if (gen.has(id)) continue;
    gen.set(id, Math.max(1, percentile(depths, SHORT_END)));
    source.set(id, 'position');
  }

  // --- rank within each generation by age -----------------------------------
  const layers = new Map<number, string[]>();
  for (const [id, value] of gen) {
    const members = layers.get(value);
    if (members) members.push(id);
    else layers.set(value, [id]);
  }
  const sub = new Map<string, number>();
  for (const members of layers.values()) {
    const dated = members.filter((id) => died.has(id));
    dated.sort((a, b) => died.get(a)! - died.get(b)!);
    dated.forEach((id, at) =>
      sub.set(id, dated.length === 1 ? 0.5 : at / (dated.length - 1)),
    );
    // Undated narrators cannot be ordered, so they sit mid-band rather than
    // being asserted into the senior or the junior half.
    for (const id of members) if (!sub.has(id)) sub.set(id, 0.5);
  }

  const counts: Record<GenerationSource, number> = {
    chains: 0,
    tabaqa: 0,
    inferred: 0,
    position: 0,
  };
  for (const value of source.values()) counts[value]++;

  return { gen, source, sub, calibration, counts };
}
