import "server-only";
import { QB_AWARD, billBasisFields, type QbRecord } from "./qb-award";
import { QB_CONFIG, queryAll } from "./quickbase";
import { logAudit } from "./log";
import { planAdvance, type AdvancePlan } from "./advance";

/**
 * Taking an advance out of a milestone and putting it on a bill of its own.
 *
 * The arithmetic lives in advance.ts and knows nothing about Quickbase. This
 * is the part that finds the real records, keeps the three stored fields on a
 * billing line in step with each other, and writes.
 */

type Raw = Record<string, { value: unknown } | undefined>;
const val = (r: Raw, f: number): unknown => r[f]?.value;
const num = (r: Raw, f: number): number => Number(val(r, f)) || 0;
const str = (r: Raw, f: number): string => {
  const v = val(r, f);
  return typeof v === "string" ? v : v == null ? "" : String(v);
};

export interface AdvanceContext {
  poRecordId: number;
  poNumber: string;
  jobRecordId: number;
  jobName: string;
  costItemRecordId: number;
  /** Unit Cost x Quantity on the award cost item — what a Bill % is a share of. */
  builderCost: number;
  basis: { unitCost: number; qty: number; unit: string };
  milestone: {
    recordId: number;
    title: string;
    amount: number;
    paid: number;
    status: string;
  };
}

/**
 * The milestone, and the cost item it hangs off, read together.
 *
 * Addressed by the bill rather than by the purchase order, because that is
 * what the person clicked. The purchase order is reached through the bill's
 * cost item, so a bill id that does not belong to the purchase order the
 * caller thinks it does cannot be mistaken for one that does.
 */
export async function advanceContext(billRecordId: number): Promise<AdvanceContext | null> {
  const b = QB_AWARD.billLines;
  const bills = (await queryAll({
    from: QB_AWARD.tables.billLines,
    select: [b.recordId, b.title, b.billAmount, b.billPct, b.status, b.relatedItem, 143],
    where: `{${b.recordId}.EX.${billRecordId}}`,
  })) as Raw[];
  const bill = bills[0];
  if (!bill) return null;

  const costItemRecordId = num(bill, b.relatedItem);
  if (!costItemRecordId) return null;

  const c = QB_AWARD.costItems;
  const items = (await queryAll({
    from: QB_AWARD.tables.costItems,
    select: [c.recordId, c.unitCost, c.qty, c.unit, c.relatedPO],
    where: `{${c.recordId}.EX.${costItemRecordId}}`,
  })) as Raw[];
  const item = items[0];
  if (!item) return null;

  const poRecordId = num(item, c.relatedPO);
  const p = QB_AWARD.pos;
  const pos = poRecordId
    ? ((await queryAll({
        from: QB_AWARD.tables.pos,
        select: [p.recordId, p.poNumber, p.jobName, p.relatedJob],
        where: `{${p.recordId}.EX.${poRecordId}}`,
      })) as Raw[])
    : [];
  const po = pos[0];

  const unitCost = num(item, c.unitCost);
  const qty = num(item, c.qty) || 1;

  return {
    poRecordId,
    poNumber: po ? str(po, p.poNumber) : "",
    jobRecordId: po ? num(po, p.relatedJob) : 0,
    jobName: po ? str(po, p.jobName) : "",
    costItemRecordId,
    builderCost: Math.round(unitCost * qty * 100) / 100,
    basis: { unitCost, qty, unit: str(item, c.unit) },
    milestone: {
      recordId: num(bill, b.recordId),
      title: str(bill, b.title),
      amount: num(bill, b.billAmount),
      paid: num(bill, 143),
      status: str(bill, b.status),
    },
  };
}

export interface AdvanceProposal {
  context: AdvanceContext;
  plan: AdvancePlan;
}

export async function planAdvanceFor(
  billRecordId: number,
  advance: number,
): Promise<AdvanceProposal | null> {
  const context = await advanceContext(billRecordId);
  if (!context) return null;
  return { context, plan: planAdvance(context.milestone, context.builderCost, advance) };
}

export interface AppliedAdvance {
  poRecordId: number;
  poNumber: string;
  milestoneRecordId: number;
  milestoneTitle: string;
  amountBefore: number;
  amountAfter: number;
  advance: number;
  newBillRecordId: number | null;
}

async function write(table: string, data: QbRecord[]): Promise<number[]> {
  const res = await fetch("https://api.quickbase.com/v1/records", {
    method: "POST",
    headers: {
      "QB-Realm-Hostname": QB_CONFIG.realm,
      Authorization: `QB-USER-TOKEN ${QB_CONFIG.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to: table, data, fieldsToReturn: [3] }),
  });
  const body = (await res.json()) as {
    data?: Record<string, { value: unknown }>[];
    metadata?: { lineErrors?: Record<string, string[]> };
    message?: string;
    description?: string;
  };
  if (!res.ok) throw new Error(body.description || body.message || `Quickbase ${res.status}`);
  /*
   * Quickbase answers 200 to a write it rejected, so the row errors are the
   * only place a refusal shows up. Without this a failed write reads as a
   * success and the two halves of an advance silently come apart.
   */
  const lineErrors = body.metadata?.lineErrors;
  if (lineErrors && Object.keys(lineErrors).length) {
    throw new Error(Object.values(lineErrors).flat().join("; "));
  }
  return (body.data ?? []).map((r) => Number(r["3"]?.value) || 0);
}

/**
 * Apply the advance: reduce the milestone, then raise the bill.
 *
 * In that order deliberately. If the second write fails the schedule is short
 * by the advance, which is visible and wrong in the safe direction — the
 * subcontractor has not been given a bill for money the schedule still also
 * carries. Raising the bill first and failing to reduce the milestone would
 * put the same money on the schedule twice.
 */
export async function applyAdvance(
  billRecordId: number,
  advance: number,
  actor: string,
): Promise<{ ok: true; applied: AppliedAdvance } | { ok: false; error: string }> {
  const proposal = await planAdvanceFor(billRecordId, advance);
  if (!proposal) return { ok: false, error: "That milestone could not be found." };
  const { context, plan } = proposal;
  if (plan.problem) return { ok: false, error: plan.problem };

  const b = QB_AWARD.billLines;

  // 1. The milestone the money comes out of.
  await write(QB_AWARD.tables.billLines, [
    {
      [b.recordId]: { value: plan.from.recordId },
      [b.billAmount]: { value: plan.from.amountAfter },
      [b.billPct]: { value: plan.from.fractionAfter },
      // The basis goes with them, so the three stored fields keep agreeing.
      [b.builderCost]: { value: context.builderCost },
    },
  ]);

  // 2. The advance, as a bill of its own under the same cost item.
  let newBillRecordId: number | null = null;
  const record: QbRecord = {
    [b.relatedItem]: { value: context.costItemRecordId },
    [b.title]: { value: plan.bill.title },
    ...billBasisFields(context.basis),
    [b.billAmount]: { value: plan.bill.amount },
    [b.billPct]: { value: plan.bill.fraction },
    [b.costType]: { value: QB_AWARD.billLineCostType },
  };
  if (context.jobRecordId) record[b.relatedJob] = { value: context.jobRecordId };
  const ids = await write(QB_AWARD.tables.billLines, [record]);
  newBillRecordId = ids[0] ?? null;

  await logAudit({
    action: "award.advance.paid",
    actor,
    outcome: "ok",
    target: { table: QB_AWARD.tables.pos, recordId: context.poRecordId },
    changedFields: ["Bill Amount", "Bill %", "Builder Cost"],
    /*
     * The same shape a scope change records, so Vendor status reads both the
     * same way. The contract is unchanged on both sides, which is the point:
     * an advance moves money within the schedule and never alters what the
     * purchase order is worth.
     */
    before: {
      contract: context.builderCost,
      lines: [
        {
          recordId: plan.from.recordId,
          desc: plan.from.title,
          amount: plan.from.amountBefore,
          pct: plan.from.pctBefore,
          locked: false,
        },
      ],
    },
    after: {
      contract: context.builderCost,
      delta: 0,
      lines: [
        {
          recordId: plan.from.recordId,
          desc: plan.from.title,
          amount: plan.from.amountAfter,
          pct: plan.from.pctAfter,
          locked: false,
        },
      ],
    },
    details: {
      advance: plan.bill.amount,
      newBillRecordId,
      costItemRecordId: context.costItemRecordId,
      poNumber: context.poNumber,
    },
  });

  return {
    ok: true,
    applied: {
      poRecordId: context.poRecordId,
      poNumber: context.poNumber,
      milestoneRecordId: plan.from.recordId,
      milestoneTitle: plan.from.title,
      amountBefore: plan.from.amountBefore,
      amountAfter: plan.from.amountAfter,
      advance: plan.bill.amount,
      newBillRecordId,
    },
  };
}
