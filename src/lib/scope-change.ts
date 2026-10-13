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
  /*
   * What a Bill % is a percentage OF, when that is not the schedule itself.
   *
   * Quickbase stores Bill Amount = Builder Cost x Bill %, where Builder Cost
   * is the whole contract — so a milestone's percentage is its share of the
   * contract, not its share of the milestones raised so far. The two are the
   * same number on a schedule that covers the whole contract and nowhere near
   * it on one that does not: PO-14094 carries $27,938.75 of milestones against
   * a $79,825.00 contract, where measuring against the schedule called a
   * $13,746.79 draw 28.57% when Quickbase means 13.75%, and 28.57% of the
   * Builder Cost it would be stored against is $28,570.
   *
   * Defaults to the schedule, which is what it is when nothing says otherwise.
   */
  basis?: number,
): Absorption {
  const previousTotal = round(lines.reduce((sum, l) => sum + l.amount, 0));
  const newTotal = round(previousTotal + delta);
  const share = basis && basis > 0 ? basis : newTotal;
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
        restatedPct: share > 0 ? round((l.amount / share) * 100) : 0,
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
      restatedPct: share > 0 ? round((amount / share) * 100) : 0,
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

export interface ScopeChange {
  at: string;
  actor: string;
  contractBefore: number;
  contractAfter: number;
  delta: number;
  /*
   * What the milestones came to at the earliest recorded moment.
   *
   * Not the sum of the lines' "before" figures. A line created partway
   * through — an advance carves one out of a milestone — was never part of
   * the schedule back then, and the milestone it came out of is still
   * counted at its pre-advance figure, so adding them up double-counts the
   * same money. On PO-15489 that read $200,000.00 against a contract that
   * started at $150,000.00.
   *
   * Null when nothing is recorded.
   */
  scheduleBefore?: number | null;
  /**
   * When the contract's Was figure took effect: the revision before this one.
   * Null when this is the first, and the purchase order's creation stands in.
   */
  atBefore?: string | null;
  /** Keyed by the billing line item's record id. */
  lines: Record<
    number,
    {
      before: number;
      after: number;
      pctBefore: number;
      pctAfter: number;
      /*
       * When the "before" figure took effect. Null because it is the figure
       * the line was raised with — nothing recorded set it, so only the
       * record itself knows the date.
       */
      atBefore?: string | null;
      /** When the "after" figure took effect: the last change to touch it. */
      atAfter?: string | null;
    }
  >;
}

/**
 * The last recorded change: what it was immediately before, and what it is now.
 *
 * Was is the step before Now, not where the purchase order started. A
 * contract that went $150,000.00 -> $184,413.66 -> $170,010.51 reads
 * $184,413.66 -> $170,010.51, and the next revision makes $170,010.51 the
 * Was. Now becomes Was. Everything earlier is in the list the caller already
 * holds, which the screen opens on demand — so nothing is lost by the
 * headline showing one step rather than the whole span.
 *
 * Each milestone is read the same way, from the same change, which is what
 * keeps the lines and the purchase order above them describing one event.
 */
export function summarise(changes: ScopeChange[]): ScopeChange | null {
  if (!changes.length) return null;
  // Newest first, the way the log returns them.
  const newest = changes[0];
  const older = changes.slice(1);

  /*
   * Each line shows its own last change, which is not always the purchase
   * order's last change.
   *
   * A revision rewrites only what is still outstanding, and an advance moves
   * one milestone and leaves the rest. A change records every line on the
   * schedule regardless, with the same figure on both sides for the ones it
   * left alone — so looking only at the newest entry showed blanks against
   * milestones that had plainly moved, and hid the advance that moved them.
   *
   * The line's Was is what it was immediately before the last change that
   * actually moved it. A line that has never moved has no before and no
   * after, and is left out rather than reported as unchanged-to-unchanged.
   */
  const touched = new Set<number>();
  for (const c of changes) for (const k of Object.keys(c.lines)) touched.add(Number(k));

  const lines: ScopeChange["lines"] = {};
  for (const recordId of touched) {
    const moved = changes.findIndex(
      (c) => c.lines[recordId] && Math.abs(c.lines[recordId].after - c.lines[recordId].before) >= 0.005,
    );
    if (moved === -1) continue;
    const at = changes[moved];
    // Dated by whatever set the Was figure: the nearest earlier change that
    // touched this same line.
    const previous = changes.slice(moved + 1).find((c) => c.lines[recordId]);
    lines[recordId] = {
      ...at.lines[recordId],
      atBefore: previous ? previous.at : null,
      atAfter: at.at,
    };
  }

  /*
   * What the milestones came to immediately before this change — every line
   * it recorded, at the figure it held then, including the ones it left
   * alone. Not the Was column added up: that leaves out the untouched lines
   * and so falls short of the schedule they are part of.
   */
  const scheduleBefore =
    Math.round(Object.values(newest.lines).reduce((sum, l) => sum + l.before, 0) * 100) / 100;

  return {
    ...newest,
    lines,
    scheduleBefore,
    // When the Was figure took effect: the revision before this one. Null
    // when there was none, and the record's own creation date stands in.
    atBefore: older.length ? older[0].at : null,
  };
}
