import { QB_AWARD, type QbRecord } from "./qb-award";
import { regionFor, type RegionKey } from "./regions";
import { scheduleForJobType, scheduleLines, scheduleSetFor } from "./schedule";

/**
 * Drawing bills against a purchase order that already exists.
 *
 * The award flow creates every milestone at once. This is the other half: a PO
 * that was awarded without its bills, or one where only some milestones have
 * been billed so far, and where a back charge needs netting off a draw.
 *
 * Field ids and the matching rule mirror the Quickbase award code page's
 * "Create Bill" tab, so the two agree about which milestones are already
 * billed and never create a second bill for one.
 */

/** A purchase order the current vendor could be billed against. */
export interface PoOption {
  recordId: number;
  poNumber: string;
  jobName: string;
  jobType: string;
  title: string;
  status: string;
  /** The PO's Total Cost, used when the cost item carries no unit cost. */
  totalCost: number;
  jobRecordId: number;
}

/** A Billing Line Item already on the cost item. */
export interface ExistingBill {
  recordId: number;
  title: string;
  amount: number;
  backCharge: number;
  backChargeDesc: string;
}

/** One milestone of the schedule, and the bill for it if there is one. */
export interface BillRow {
  n: number;
  desc: string;
  pct: number;
  /** What this milestone should be billed at, in the PO's own convention. */
  amount: number;
  existing: ExistingBill | null;
  /**
   * Set when a bill exists whose amount matches neither convention. That is a
   * hand-edited or part-paid draw, so it is reported rather than re-based —
   * the figure on file is what the subcontractor was told.
   */
  amountDiffers: boolean;
}

/**
 * How a purchase order's bills treat the mobilisation cap.
 *
 * The award letter caps Movilización at $10,000 and spreads the balance over
 * the remaining stages. The Quickbase code page does not — it pays the flat
 * percentage. Both are live, so a PO has to be billed the way it was started:
 * mixing them means the milestones no longer total the contract.
 */
export type BillingConvention = "capped" | "uncapped" | "unbilled";

/** The title the award flow and the code page both give a milestone's bill. */
export function billTitle(desc: string, pct: number): string {
  return `${desc} (${pct}%)`;
}

/**
 * The bill for a milestone, if one exists.
 *
 * Matches on the exact title first and then on the milestone name alone,
 * because bills created by hand or by an older version of the code page carry
 * a percentage that no longer matches — "Movilización-10%" and "Movilizacion"
 * are both live. Matching on the name is what stops a second bill being made
 * for a milestone that is already billed.
 */
export function matchBill(
  desc: string,
  pct: number,
  bills: ExistingBill[],
): ExistingBill | null {
  const exact = billTitle(desc, pct);
  return (
    bills.find((b) => b.title === exact) ??
    bills.find((b) => b.title.startsWith(desc)) ??
    null
  );
}

/** Net of a back charge, never below zero. */
export function netOf(amount: number, backCharge: number): number {
  return round(Math.max(0, amount - Math.max(0, backCharge)));
}

const SAME = 0.005;

/**
 * Both readings of a PO's schedule: capped as the award letter states it, and
 * uncapped as the code page bills it.
 */
function bothWays(region: RegionKey, jobType: string, contract: number) {
  const cfg = regionFor(region);
  const schedule = scheduleForJobType(jobType, cfg);
  if (!schedule) return null;
  const cap = scheduleSetFor(cfg)?.mobilisationCap ?? null;
  return {
    capped: scheduleLines(contract, schedule, cap),
    uncapped: scheduleLines(contract, schedule, null),
  };
}

/**
 * Which convention the bills already on this PO follow.
 *
 * Decided by the bills themselves rather than by preference: whichever reading
 * more of them agree with is the one the rest of the PO must follow. With no
 * bills yet there is nothing to match, so the award letter's capped schedule
 * is used — that is what this app's own letters promise.
 */
export function billingConvention(
  region: RegionKey,
  jobType: string,
  contract: number,
  existing: ExistingBill[],
): BillingConvention {
  const ways = bothWays(region, jobType, contract);
  if (!ways || !existing.length) return "unbilled";

  const agree = (lines: typeof ways.capped) =>
    lines.filter((l) => {
      const m = matchBill(l.desc, l.pct, existing);
      return m && Math.abs(m.amount - l.amount) <= SAME;
    }).length;

  const capped = agree(ways.capped);
  const uncapped = agree(ways.uncapped);
  if (uncapped > capped) return "uncapped";
  if (capped > 0) return "capped";
  return "unbilled";
}

/**
 * The milestone rows for a PO: what each should be billed at, and the bill for
 * it if there is one. Returns an empty list for a region with no schedule,
 * since there are then no milestones to bill against.
 *
 * Amounts follow the convention the PO is already being billed under, so
 * finishing a part-billed PO cannot leave its milestones adding up to more or
 * less than the contract.
 */
export function billRows(
  region: RegionKey,
  jobType: string,
  contract: number,
  existing: ExistingBill[],
): BillRow[] {
  const ways = bothWays(region, jobType, contract);
  if (!ways) return [];

  const convention = billingConvention(region, jobType, contract, existing);
  const lines = convention === "uncapped" ? ways.uncapped : ways.capped;

  return lines.map((line) => {
    const match = matchBill(line.desc, line.pct, existing);
    return {
      n: line.n,
      desc: line.desc,
      pct: line.pct,
      amount: line.amount,
      existing: match,
      amountDiffers: Boolean(match && Math.abs(match.amount - line.amount) > SAME),
    };
  });
}

/** A new Billing Line Item for a milestone. */
export function buildBillRecord(input: {
  costItemRecordId: number;
  jobRecordId: number;
  qbLineItemLabel: string;
  row: BillRow;
  backCharge: number;
  backChargeDesc: string;
}): QbRecord {
  const f = QB_AWARD.billLines;
  const rec: QbRecord = {
    [f.relatedItem]: { value: input.costItemRecordId },
    [f.title]: { value: billTitle(input.row.desc, input.row.pct) },
    // Whole number: Quickbase divides a percent field by 100 on write.
    [f.billPct]: {
      value: QB_AWARD.billPctAsFraction ? input.row.pct / 100 : input.row.pct,
    },
    [f.billAmount]: { value: round(input.row.amount) },
    [f.qbLineItem]: { value: input.qbLineItemLabel },
    [f.costType]: { value: QB_AWARD.billLineCostType },
  };
  if (input.jobRecordId) rec[f.relatedJob] = { value: input.jobRecordId };
  if (input.backCharge > 0) {
    rec[f.backCharge] = { value: round(input.backCharge) };
    rec[f.backChargeDesc] = { value: input.backChargeDesc };
  }
  return rec;
}

/**
 * A back charge applied to a bill that already exists.
 *
 * Only the two back-charge fields are sent. Net Amount (224) is a Quickbase
 * formula over them, and the bill's own amount is left alone — a back charge
 * nets a draw down, it does not change what the milestone is worth.
 */
export function buildBackChargeUpdate(
  recordId: number,
  backCharge: number,
  backChargeDesc: string,
): QbRecord {
  const f = QB_AWARD.billLines;
  return {
    [f.recordId]: { value: recordId },
    [f.backCharge]: { value: backCharge > 0 ? round(backCharge) : 0 },
    [f.backChargeDesc]: { value: backCharge > 0 ? backChargeDesc : "" },
  };
}

/**
 * A back charge has to say what it was for. The code page refuses a bare
 * amount for the same reason: a deduction nobody can explain later is a
 * dispute waiting to happen.
 */
export function backChargeProblem(
  backCharge: number,
  backChargeDesc: string,
  amount: number,
): string | null {
  if (!(backCharge > 0)) return null;
  if (!backChargeDesc.trim()) return "a reason is required";
  if (backCharge > amount) return "it is more than the bill";
  return null;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
