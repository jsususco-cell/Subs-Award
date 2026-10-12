import "server-only";
import { QB_AWARD } from "./qb-award";
import { queryAll } from "./quickbase";
import { absorbScopeChange, type Absorption, type ScheduleLine } from "./scope-change";

/**
 * Reading a live award so a scope change can be planned against it.
 *
 * The arithmetic lives in scope-change.ts and knows nothing about Quickbase.
 * This is the part that decides what the arithmetic is given: which bills are
 * the schedule, and which of them have stopped being movable.
 */

type Raw = Record<string, { value: unknown } | undefined>;
const val = (r: Raw, f: number): unknown => r[f]?.value;
const num = (r: Raw, f: number): number => Number(val(r, f)) || 0;
const str = (r: Raw, f: number): string => {
  const v = val(r, f);
  return typeof v === "string" ? v : v == null ? "" : String(v);
};
const rel = (r: Raw, f: number): number => {
  const v = val(r, f) as { id?: number } | number | undefined;
  return Number(typeof v === "object" && v !== null ? v.id : v) || 0;
};

export interface AwardSchedule {
  poRecordId: number;
  poNumber: string;
  jobRecordId: number;
  jobName: string;
  jobState: string;
  subRecordId: number;
  costItemRecordId: number;
  /** Unit cost x quantity on the cost item — what the milestones divide up. */
  contract: number;
  /** Every bill on the cost item, in record order, as the schedule. */
  lines: (ScheduleLine & { recordId: number; amountPaid: number; status: string })[];
}

/**
 * What is billed against a purchase order today, and what can still move.
 *
 * A milestone is locked once money has moved against it: Status says Paid, or
 * Amount Paid is above zero. Those two can disagree — the status backfill of
 * 2026-10-08 existed because they had — so either is enough on its own.
 */
export async function awardSchedule(poRecordId: number): Promise<AwardSchedule | null> {
  const p = QB_AWARD.pos;
  const c = QB_AWARD.costItems;
  const b = QB_AWARD.billLines;

  const pos = (await queryAll({
    from: QB_AWARD.tables.pos,
    select: [p.recordId, p.poNumber, p.relatedJob, p.jobName, p.jobState, p.relatedSub],
    where: `{${p.recordId}.EX.${poRecordId}}`,
  })) as Raw[];
  const po = pos[0];
  if (!po) return null;

  /*
   * Every cost item on the purchase order, not the first one.
   *
   * PO-1212 carries three — Survey $950, Sales tax $38 and an Award Letter
   * line of $24,864.29 — and reading items[0] reported that $25,852.29
   * contract as a $950 award. A purchase order is one subcontractor's
   * contract on one job, so its value is all of its cost items and its
   * schedule is all of their bills.
   */
  const items = (await queryAll({
    from: QB_AWARD.tables.costItems,
    select: [c.recordId, c.unitCost, c.qty],
    where: `{${c.relatedPO}.EX.${poRecordId}}`,
    sortBy: [{ fieldId: c.recordId, order: "ASC" }],
  })) as Raw[];
  if (!items.length) return null;

  const itemIds = items.map((i) => num(i, c.recordId)).filter(Boolean);
  const bills = (await queryAll({
    from: QB_AWARD.tables.billLines,
    select: [b.recordId, b.title, b.billPct, b.billAmount, b.status, 143],
    where: itemIds.map((id) => `{${b.relatedItem}.EX.${id}}`).join("OR"),
    sortBy: [{ fieldId: b.recordId, order: "ASC" }],
  })) as Raw[];

  return {
    poRecordId,
    poNumber: str(po, p.poNumber),
    jobRecordId: rel(po, p.relatedJob),
    jobName: str(po, p.jobName),
    jobState: str(po, p.jobState),
    subRecordId: rel(po, p.relatedSub),
    costItemRecordId: num(items[0], c.recordId),
    contract:
      Math.round(
        items.reduce((sum, i) => sum + num(i, c.unitCost) * (num(i, c.qty) || 1), 0) * 100,
      ) / 100,
    lines: bills.map((r) => {
      const amountPaid = num(r, 143);
      const status = str(r, b.status);
      return {
        recordId: num(r, b.recordId),
        desc: str(r, b.title),
        // Bill % is stored as the fraction; the arithmetic works in whole
        // numbers, so it is converted here and converted back on the way out.
        pct: Math.round(num(r, b.billPct) * 100 * 1e6) / 1e6,
        amount: num(r, b.billAmount),
        amountPaid,
        status,
        locked: status.trim() === "Paid" || amountPaid > 0,
      };
    }),
  };
}

export interface ScopeChangePlan {
  schedule: AwardSchedule;
  absorption: Absorption;
  /** The contract on the cost item before and after, and the difference. */
  contractBefore: number;
  contractAfter: number;
  delta: number;
  /**
   * Contract not yet on the schedule. The change lands only on the milestones
   * that have been billed, so this carries straight across untouched.
   */
  unbilled: number;
  /** What each bill would be written to. Empty when nothing would change. */
  writes: { recordId: number; desc: string; amount: number; billPct: number }[];
}

/**
 * Work out what a revised contract would do to the schedule, without writing.
 *
 * Bill % is restated so each milestone still describes its own share of the
 * revised contract. Leaving the original percentages would make them sum to
 * 100% of a contract that no longer exists, and the Cost Item and purchase
 * order roll-ups add them up.
 */
export async function planScopeChange(
  poRecordId: number,
  revisedTotal: number,
): Promise<ScopeChangePlan | null> {
  const schedule = await awardSchedule(poRecordId);
  if (!schedule) return null;

  /*
   * The change is measured against the CONTRACT, not against what has been
   * billed so far. Those are the same number on a schedule that is fully
   * billed and wildly different on one that is not: PO-14559 carries a
   * $154,361.73 contract with $54,026.60 billed, where measuring against the
   * billed total would have called a rise to $170,000 a $115,973 change
   * instead of a $15,638 one.
   *
   * The delta then lands only on the billed outstanding milestones, so the
   * part of the contract not yet on the schedule carries across unchanged.
   */
  const billed = Math.round(schedule.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const contractBefore = schedule.contract;
  const delta = Math.round((revisedTotal - contractBefore) * 100) / 100;
  const unbilled = Math.round((contractBefore - billed) * 100) / 100;
  const absorption = absorbScopeChange(schedule.lines, delta);

  const writes = absorption.problem
    ? []
    : absorption.lines
        .map((l, i) => ({ l, src: schedule.lines[i] }))
        .filter(({ l }) => !l.locked && l.took !== 0)
        .map(({ l, src }) => ({
          recordId: src.recordId,
          desc: l.desc,
          amount: l.amount,
          // Back to the fraction Quickbase stores.
          billPct: Math.round((l.restatedPct / 100) * 1e6) / 1e6,
        }));

  return {
    schedule,
    absorption,
    contractBefore,
    contractAfter: Math.round((contractBefore + delta) * 100) / 100,
    delta,
    unbilled,
    writes,
  };
}

export interface ExistingAward {
  poRecordId: number;
  poNumber: string;
  contract: number;
  /** When the purchase order was raised — what a revised file must postdate. */
  awardedOn: string;
  jobName: string;
  /** The purchase order's own title and scope, to carry into the letter. */
  title: string;
  scope: string;
}

/**
 * The award a case already carries, if it carries one.
 *
 * A scope change needs somewhere to land, and that somewhere is the purchase
 * order raised for this job and this subcontractor. Returning null is the
 * answer to "is this a revision or a first award", not a failure.
 *
 * Deliberately not filtered by purchase order status, for the same reason the
 * duplicate guard is not: a released PO is still the one that exists.
 */
export async function existingAward(
  jobRecordId: number,
  subRecordId: number,
): Promise<ExistingAward | null> {
  const p = QB_AWARD.pos;
  const rows = (await queryAll({
    from: QB_AWARD.tables.pos,
    // 1 is Date Created on every Quickbase table.
    select: [p.recordId, p.poNumber, p.contractPrice, p.jobName, p.title, p.scope, 1],
    where: `{${p.relatedJob}.EX.${jobRecordId}}AND{${p.relatedSub}.EX.${subRecordId}}`,
    sortBy: [{ fieldId: p.recordId, order: "DESC" }],
  })) as Raw[];
  const po = rows[0];
  if (!po) return null;
  const poRecordId = num(po, p.recordId);

  /*
   * The contract comes off the cost item, not off the purchase order's
   * Contract Price. That field is the mainland's; a Puerto Rico purchase
   * order leaves it empty, so reading it showed PO-14107 — a real $199,786.46
   * award — as $0.00.
   *
   * Reading it the way planScopeChange does also means the figure compared
   * on screen and the figure the plan works from cannot disagree.
   */
  const c = QB_AWARD.costItems;
  const items = (await queryAll({
    from: QB_AWARD.tables.costItems,
    select: [c.recordId, c.unitCost, c.qty],
    where: `{${c.relatedPO}.EX.${poRecordId}}`,
    sortBy: [{ fieldId: c.recordId, order: "ASC" }],
  })) as Raw[];
  return {
    poRecordId,
    poNumber: str(po, p.poNumber),
    contract: items.length
      ? Math.round(
          items.reduce((sum, i) => sum + num(i, c.unitCost) * (num(i, c.qty) || 1), 0) * 100,
        ) / 100
      : num(po, p.contractPrice),
    awardedOn: str(po, 1),
    jobName: str(po, p.jobName),
    title: str(po, p.title),
    scope: str(po, p.scope),
  };
}
