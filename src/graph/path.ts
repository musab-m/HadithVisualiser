import { PROPHET_ID, collectorId, type HadithRecord } from '../corpus/types';

/** One step of a chain, and whether the two ends actually heard it. */
export interface Step {
  from: string;
  to: string;
  /**
   * Somebody stood between these two and was named but not identified, so this
   * is a jump rather than a hearing.
   */
  gap: boolean;
}

/**
 * The path a hadith draws: the people it passed through, in order.
 *
 * One definition, used by the renderer and by the filters, so that what the
 * graph shows and what the counts say can never drift apart.
 *
 * Two things it refuses to invent:
 *
 * **The apex.** The Prophet ﷺ heads the path only where the chain reached him.
 * A report the parser could not trace back to him is drawn stopping at the last
 * narrator it could read, because a line to the apex is a claim that the report
 * is his, and that claim has to come from the isnad rather than from the shape
 * of the picture.
 *
 * **The gaps.** Where the isnad named someone by relation and no table turns
 * that into a man, the step is still drawn — the two ends are attested — but
 * marked, so it can be shown as the jump it is.
 */
export function pathOf(hadith: HadithRecord, bookSlug: string): Step[] {
  const steps: Step[] = [];
  if (!hadith.chain.length) return steps;

  const gaps = new Set(hadith.gaps ?? []);
  // Three answers, not two. The chain ran into him; or it did not but the
  // report is still his, and the step is drawn as the unattested one it is; or
  // he is not named at all and the report stops where it stops.
  if (hadith.toProphet || hadith.namesProphet) {
    steps.push({ from: PROPHET_ID, to: hadith.chain[0], gap: !hadith.toProphet });
  }
  for (let i = 0; i < hadith.chain.length - 1; i++) {
    steps.push({ from: hadith.chain[i], to: hadith.chain[i + 1], gap: gaps.has(i) });
  }
  steps.push({
    from: hadith.chain[hadith.chain.length - 1],
    to: collectorId(bookSlug),
    gap: false,
  });
  return steps;
}

/** Every narrator on the path, in order, including the ends. */
export function nodesOf(hadith: HadithRecord, bookSlug: string): string[] {
  const steps = pathOf(hadith, bookSlug);
  if (!steps.length) return [];
  return [steps[0].from, ...steps.map((step) => step.to)];
}
