/**
 * Paying part of a milestone early.
 *
 * An advance takes money out of a milestone that has not been billed yet and
 * puts it on a bill of its own, so it can be released and paid now without
 * waiting for the milestone it belongs to. Nothing is created or destroyed:
 * the schedule still adds up to the same contract, and the purchase order's
 * Total Cost does not move at all, because that comes from the cost item's
 * Unit Cost and not from the bills under it.
 *
 * Which makes this arithmetic narrower than a scope change. A scope change
 * alters what the contract is worth and spreads the difference; an advance
 * only moves money sideways between two lines of the same schedule.
 *
 * Pure, and knows nothing about Quickbase.
 */

const round = (n: number): number => Math.round(n * 100) / 100;

/**
 * The fraction a percent field stores, worked out from the money.
 *
 * Quickbase holds Bill Amount, Bill % and Builder Cost as three separate
 * stored fields, and the convention across the table is that the first equals
 * the other two multiplied. Deriving the fraction from a rounded percentage
 * throws that rounding into the money — a hundredth of a percent is $10 on a
 * $100,000 contract — so it is derived from the amount instead.
 */
export function fractionOf(amount: number, builderCost: number): number {
  if (builderCost <= 0) return 0;
  return Math.round((amount / builderCost) * 1e8) / 1e8;
}

export interface AdvanceMilestone {
  recordId: number;
  title: string;
  amount: number;
  /** Amount Paid on the line. Anything above zero means money has moved. */
  paid: number;
  status: string;
}

export interface AdvancePlan {
  /** Set when the advance cannot be made, in which case nothing else is used. */
  problem: string | null;
  /** The milestone the money comes out of. */
  from: {
    recordId: number;
    title: string;
    amountBefore: number;
    amountAfter: number;
    pctBefore: number;
    pctAfter: number;
    /** The fraction to write, derived from the money rather than the percentage. */
    fractionAfter: number;
  };
  /** The bill the money goes onto. */
  bill: {
    title: string;
    amount: number;
    pct: number;
    fraction: number;
  };
}

/** The title an advance carries, so the pair reads as a pair in any report. */
export function advanceTitle(milestoneTitle: string): string {
  return `Advance — ${milestoneTitle}`.trim();
}

export function planAdvance(
  milestone: AdvanceMilestone,
  builderCost: number,
  advance: number,
): AdvancePlan {
  const amount = round(milestone.amount);
  const take = round(advance);
  const blank: AdvancePlan["from"] = {
    recordId: milestone.recordId,
    title: milestone.title,
    amountBefore: amount,
    amountAfter: amount,
    pctBefore: builderCost > 0 ? round((amount / builderCost) * 100) : 0,
    pctAfter: builderCost > 0 ? round((amount / builderCost) * 100) : 0,
    fractionAfter: fractionOf(amount, builderCost),
  };
  const refuse = (problem: string): AdvancePlan => ({
    problem,
    from: blank,
    bill: { title: advanceTitle(milestone.title), amount: 0, pct: 0, fraction: 0 },
  });

  if (builderCost <= 0) {
    return refuse(
      "This purchase order has no cost basis, so an advance cannot be worked out as a share of it.",
    );
  }
  if (!Number.isFinite(take) || take <= 0) {
    return refuse("An advance has to be more than nothing.");
  }
  /*
   * A paid milestone has already been settled. Taking money off it would not
   * advance anything — it would restate a bill somebody has been paid for,
   * and leave what was paid disagreeing with what the line says it is worth.
   */
  if (milestone.paid > 0 || milestone.status.trim().toLowerCase() === "paid") {
    return refuse(
      `${milestone.title} has already been paid, so there is nothing left on it to advance.`,
    );
  }
  if (take > amount + 0.001) {
    return refuse(
      `An advance of ${take.toFixed(2)} is more than ${milestone.title} is worth (${amount.toFixed(2)}). An advance moves money out of a milestone; it cannot take more than is there.`,
    );
  }

  const left = round(amount - take);
  return {
    problem: null,
    from: {
      recordId: milestone.recordId,
      title: milestone.title,
      amountBefore: amount,
      amountAfter: left,
      pctBefore: round((amount / builderCost) * 100),
      pctAfter: round((left / builderCost) * 100),
      fractionAfter: fractionOf(left, builderCost),
    },
    bill: {
      title: advanceTitle(milestone.title),
      amount: take,
      pct: round((take / builderCost) * 100),
      fraction: fractionOf(take, builderCost),
    },
  };
}
