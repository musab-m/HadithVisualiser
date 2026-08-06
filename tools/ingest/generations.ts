/**
 * Assigns every narrator a generation, once, for the whole corpus.
 *
 * Deriving this per view was unstable — the same man came out a generation
 * apart depending on which books were showing — and deriving it from chain
 * position alone throws away what the biographical literature already settled.
 * So it is computed here, at ingest, from four sources in order of how much
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
 *   4. When he died, which overrules all three where it flatly contradicts
 *      them. The first three read chain depth as elapsed time, and it stops
 *      being that the moment a compiler quotes a book instead of a teacher.
 *
 * Every narrator records which of the four placed him, so the panel can say
 * so rather than presenting a guess and a fact in the same voice.
 */

export type GenerationSource = 'chains' | 'tabaqa' | 'inferred' | 'position' | 'dates';

export interface GenerationInput {
  /** Narrator ids in transmission order, Prophet first, compiler last. */
  chains: { path: string[]; toProphet: boolean }[];
  /** Ibn Ḥajar's ṭabaqa, 1–12, for the narrators that have one. */
  tabaqa: Map<string, number>;
  /** Death year in hijri, where it is known. */
  died: Map<string, number>;
}

export interface GenerationResult {
  gen: Map<string, number>;
  source: Map<string, GenerationSource>;
  /** Position within the generation, 0 (senior) to 1 (junior). */
  sub: Map<string, number>;
  /** The ṭabaqa → generation mapping this corpus produced. */
  calibration: Map<number, number>;
  /** The year each generation's chain-placed narrators die out by. */
  landmarks: Map<number, number>;
  /**
   * The band past every generation the chains produced, holding the people the
   * chains stop short of. Not an (n+1)th generation of transmission — see
   * below.
   */
  lateBand: number;
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

/**
 * Chain-placed narrators a generation needs to carry a death year before its
 * dates are allowed to speak for it. A landmark drawn from four men is a fact
 * about those four.
 */
const MIN_DATED = 20;

/**
 * Which end of a generation's death years marks where it closes. Not the last
 * of them: every band has its centenarian, and letting him set the edge would
 * stretch each generation over the one after it.
 */
const LATE_END = 0.9;

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
    // Definitional, not calibrated: ṭabaqa 1 is the Companions, so anyone past
    // it did not hear from the Prophet and cannot stand in the first
    // generation however many mursal chains place him there. ʿAlqama ibn
    // Waqqāṣ is ṭabaqa 2 and a student of ʿUmar; he belongs in the second.
    const floor = t === 1 ? 1 : 2;
    const value = Math.max(calibration.get(t) ?? floor, floor);
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

  // --- let the death dates correct what the chains cannot -------------------
  // Everything above reads chain depth as elapsed time, which it is only while
  // each link is a man who heard the report from the man before him. A compiler
  // working from earlier books breaks that: he cites the Companion and stops,
  // and the chain reads two deep for someone six centuries later. al-Nawawī
  // (d. 676) comes out of Riyāḍ al-Ṣāliḥīn standing among the Successors, and
  // Ibn Ḥajar (d. 852) out of Bulūgh al-Marām beside him.
  //
  // The ṭabaqāt cannot correct it. The twelve of the Taqrīb run out around
  // 250 AH, and everyone they fail to reach is exactly everyone this affects.
  //
  // Death years can, and they are already here. So each generation is given a
  // calendar landmark, learned the way the ṭabaqa mapping was — from the death
  // years of the narrators its own chains placed — and a man who outlived his
  // generation's by a full generation's span is moved down to the earliest one
  // that can hold him. Only ever down: a death year is evidence someone lived
  // on, never that he came earlier than his chains say.
  const deaths = new Map<number, number[]>();
  for (const [id, value] of gen) {
    if (source.get(id) !== 'chains') continue;
    const year = died.get(id);
    if (year == null) continue;
    const list = deaths.get(value);
    if (list) list.push(year);
    else deaths.set(value, [year]);
  }

  const landmarks = new Map<number, number>();
  let closes = 0;
  for (const value of [...deaths.keys()].sort((a, b) => a - b)) {
    const years = deaths.get(value)!;
    if (years.length < MIN_DATED) continue;
    // Monotone for the same reason the ṭabaqa mapping is: a later generation
    // does not close before the one it followed.
    closes = Math.max(closes, percentile(years, LATE_END));
    landmarks.set(value, closes);
  }
  const bounded = [...landmarks].sort((a, b) => a[0] - b[0]);

  // How long a generation runs, taken from the corpus rather than assumed: the
  // usual gap between one closing and the next. It doubles as the tolerance,
  // which is the point — a narrator has to be a whole generation out of place
  // before his own chains are overruled, so the correction lands on the men the
  // dates contradict rather than on everyone who merely died old.
  const spans: number[] = [];
  for (let i = 1; i < bounded.length; i++) spans.push(bounded[i][1] - bounded[i - 1][1]);
  const span = spans.length ? median(spans) : 0;

  // One band past every generation the chains produced, so nobody the chains
  // did measure is standing in it. It is not a claim that transmission ran that
  // many links deep — the axis is depth of transmission, and a compiler who
  // took a report from a book has no measured depth at all. That is why his
  // chain is short. The band is where those people go.
  let deepest = 0;
  for (const value of gen.values()) if (value > deepest) deepest = value;
  const lateBand = deepest + 1;

  if (span > 0) {
    for (const [id, year] of died) {
      const current = gen.get(id);
      if (current == null) continue;
      let floor = lateBand;
      for (const [value, close] of bounded) {
        if (year <= close + span) {
          floor = value;
          break;
        }
      }
      if (floor <= current) continue;
      gen.set(id, floor);
      source.set(id, 'dates');
    }
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
    dates: 0,
  };
  for (const value of source.values()) counts[value]++;

  return { gen, source, sub, calibration, landmarks, lateBand, counts };
}
