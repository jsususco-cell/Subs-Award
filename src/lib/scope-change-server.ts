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

  const items = (await queryAll({
    from: QB_AWARD.tables.costItems,
    select: [c.recordId, c.unitCost, c.qty],
    where: `{${c.relatedPO}.EX.${poRecordId}}`,
    sortBy: [{ fieldId: c.recordId, order: "ASC" }],
  })) as Raw[];
  const item = items[0];
  if (!item) return null;

  const bills = (await queryAll({
    from: QB_AWARD.tables.billLines,
    select: [b.recordId, b.title, b.billPct, b.billAmount, b.status, 143],
    where: `{${b.relatedItem}.EX.${item[c.recordId] ? num(item, c.recordId) : 0}}`,
    sortBy: [{ fieldId: b.recordId, order: "ASC" }],
  })) as Raw[];

  return {
    poRecordId,
    poNumber: str(po, p.poNumber),
    jobRecordId: rel(po, p.relatedJob),
    jobName: str(po, p.jobName),
    jobState: str(po, p.jobState),
    subRecordId: rel(po, p.relatedSub),
    costItemRecordId: num(item, c.recordId),
    contract: Math.round(num(item, c.unitCost) * (num(item, c.qty) || 1) * 100) / 100,
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
  /** What each bill would be written to, or null when nothing would change. */
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

  const billed = Math.round(schedule.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const absorption = absorbScopeChange(schedule.lines, Math.round((revisedTotal - billed) * 100) / 100);

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

  return { schedule, absorption, writes };
}
