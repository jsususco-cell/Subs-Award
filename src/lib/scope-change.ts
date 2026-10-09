/**
 * Absorbing a scope change into a payment schedule that is already part paid.
 *
 * A case is awarded, its milestones are billed, some are paid. Then the scope
 * changes and the contract is worth more or less than it was. The money
 * already paid cannot move, so the difference has to land entirely on the
 * milestones still outstanding.
 *
 * Each outstanding milestone takes a share of the change in proportion to its
 * own percentage *within what is left*, not within the whole schedule:
 *
 *     new amount = old amount + delta x (milestone % / outstanding %)
 *
 * On a $1,000 contract billed 10/15/20/5/30/10/5/5 with the first two paid,
 * a +$200 change leaves 75% outstanding, so the 20% milestone takes
 * 200 x 20/75 = $53.33 and goes to $253.33. The paid 10% and 15% stay at
 * $100 and $150, and the schedule totals $1,200.
 *
 * This module is arithmetic only. It does not decide what counts as paid, it
 * does not write to Quickbase, and it does not know where the change came
 * from — all of which belong to the caller.
 */

/** Two decimals, the same rounding the payment schedule uses. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface ScheduleLine {
  /** Milestone name, as it reads on the bill. */
  desc: string;
  /** Its share of the original contract, as a whole number: 20 means 20%. */
  pct: number;
  /** What it is billed at today. */
  amount: number;
  /**
   * True when this milestone can no longer move — paid, or committed to being
   * paid. What qualifies is the caller's decision, not this module's.
   */
  locked: boolean;
}

export interface AbsorbedLine extends ScheduleLine {
  /** The amount before the change, kept so a review can show both. */
  before: number;
  /** What this line took of the change. Zero on a locked line. */
  took: number;
  /**
   * The share this amount is of the revised contract, to two decimals.
   *
   * Offered rather than applied: the stated percentages describe the original
   * contract and no longer describe the revised one, which is a question about
   * what the bills should say, not about the arithmetic.
   */
  restatedPct: number;
}

export interface Absorption {
  lines: AbsorbedLine[];
  /** Contract before and after, and the difference between them. */
  previousTotal: number;
  newTotal: number;
  delta: number;
  /** Already paid, and therefore untouchable. */
  lockedTotal: number;
  /** The percentage still outstanding, which is what the delta is spread over. */
  outstandingPct: number;
  /**
   * Set when the change cannot be absorbed, with the reason. `lines` is then
   * the schedule unchanged — nothing is half-applied.
   */
  problem: string | null;
}

function money(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

/**
 * Spread a contract change across the milestones that are still outstanding.
 *
 * Refuses rather than improvises. A reduction larger than the outstanding work
 * would drive a milestone negative, which is not a bill anybody can send, and
 * silently flooring it at zero would quietly lose the difference.
 */
export function absorbScopeChange(
  lines: ScheduleLine[],
  delta: number,
): Absorption {
  const previousTotal = round(lines.reduce((sum, l) => sum + l.amount, 0));
  const newTotal = round(previousTotal + delta);
  const lockedTotal = round(
    lines.filter((l) => l.locked).reduce((sum, l) => sum + l.amount, 0),
  );
  const open = lines.filter((l) => !l.locked);
  const outstandingPct = open.reduce((sum, l) => sum + l.pct, 0);

  const unchanged = (problem: string): Absorption => ({
    lines: lines.map((l) => ({
      ...l,
      before: l.amount,
      took: 0,
      restatedPct: previousTotal > 0 ? round((l.amount / previousTotal) * 100) : 0,
    })),
    previousTotal,
    newTotal,
    delta: round(delta),
    lockedTotal,
    outstandingPct,
    problem,
  });

  if (round(delta) === 0) return unchanged("The revised scope is worth the same as the original, so nothing moves.");

  if (!open.length || outstandingPct <= 0) {
    return unchanged(
      "Every milestone on this case has already been paid, so there is nothing left to absorb the change. It needs a change order of its own.",
    );
  }

  // Spread on the share each open line holds of what is still open.
  const taken = open.map((l) => round(delta * (l.pct / outstandingPct)));

  // Rounding drift lands on the last open line, so the schedule totals exactly
  // the revised contract rather than a cent away from it.
  const drift = round(round(delta) - taken.reduce((sum, t) => sum + t, 0));
  taken[taken.length - 1] = round(taken[taken.length - 1] + drift);

  const negative = open
    .map((l, i) => ({ desc: l.desc, next: round(l.amount + taken[i]) }))
    .filter((x) => x.next < 0);
  if (negative.length) {
    const short = round(Math.abs(delta) - round(previousTotal - lockedTotal));
    return unchanged(
      `The reduction is larger than the work still outstanding. ${money(previousTotal - lockedTotal)} is unpaid and the scope drops by ${money(Math.abs(delta))}, leaving ${negative.length === 1 ? "a milestone" : `${negative.length} milestones`} below zero and ${money(short)} that cannot be taken back through the schedule.`,
    );
  }

  let openIndex = 0;
  const out: AbsorbedLine[] = lines.map((l) => {
    if (l.locked) {
      return {
        ...l,
        before: l.amount,
        took: 0,
        restatedPct: newTotal > 0 ? round((l.amount / newTotal) * 100) : 0,
      };
    }
    const took = taken[openIndex];
    openIndex += 1;
    const amount = round(l.amount + took);
    return {
      ...l,
      amount,
      before: l.amount,
      took,
      restatedPct: newTotal > 0 ? round((amount / newTotal) * 100) : 0,
    };
  });

  return {
    lines: out,
    previousTotal,
    newTotal,
    delta: round(delta),
    lockedTotal,
    outstandingPct,
    problem: null,
  };
}
