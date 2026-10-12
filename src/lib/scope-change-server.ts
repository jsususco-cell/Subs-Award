import "server-only";
import { QB_AWARD, type QbRecord } from "./qb-award";
import { QB_CONFIG, queryAll } from "./quickbase";
import { logAudit } from "./log";
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


/**
 * Is this cost item the award, rather than something else on the same
 * purchase order?
 *
 * Cost Type is what separates them, and it is the app's own convention —
 * buildCostItemRecord writes "Subcontractor". PO-1212 carries a Survey
 * (Labor), its Sales tax (Other) and the award (Subcontractor); summing all
 * three reported a $24,864.29 award as $25,852.29, and reading the first
 * reported it as $950. The scope change belongs to the award line, because
 * that is the line whose Billed Cost Items it rewrites.
 *
 * Multi-choice, so the value can arrive as an array or a single string.
 */
function isAwardItem(r: Raw, fid: number): boolean {
  const v = val(r, fid);
  const list = Array.isArray(v) ? v : [v];
  return list.some(
    (x) => String(x ?? "").trim().toLowerCase() === QB_AWARD.costItemCostType.toLowerCase(),
  );
}

export interface AwardSchedule {
  poRecordId: number;
  poNumber: string;
  jobRecordId: number;
  jobName: string;
  jobState: string;
  subRecordId: number;
  costItemRecordId: number;
  /** The award item's quantity, so a revised contract divides back correctly. */
  costItemQty: number;
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
  const all = (await queryAll({
    from: QB_AWARD.tables.costItems,
    select: [c.recordId, c.unitCost, c.qty, c.costType],
    where: `{${c.relatedPO}.EX.${poRecordId}}`,
    sortBy: [{ fieldId: c.recordId, order: "ASC" }],
  })) as Raw[];
  const items = all.filter((i) => isAwardItem(i, c.costType));
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
    costItemQty: num(items[0], c.qty) || 1,
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
  /** Who it was awarded to. Carried so the case alone is enough to pick one. */
  subRecordId: number;
  subcontractor: string;
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
/**
 * Every award on a case, so a revised scope is matched to a purchase order
 * rather than to a subcontractor.
 *
 * A case can be awarded to more than one subcontractor, and the same
 * subcontractor can hold more than one purchase order on it. Asking for the
 * subcontractor and then taking their latest purchase order answered a
 * different question from the one being asked — the revised scope belongs to
 * a particular award, so that is what is chosen.
 *
 * Only purchase orders carrying an award cost item are returned: a purchase
 * order raised for something else on the same case has no contract a scope
 * change could land on.
 */
export async function awardsForJob(jobRecordId: number): Promise<ExistingAward[]> {
  const p = QB_AWARD.pos;
  const pos = (await queryAll({
    from: QB_AWARD.tables.pos,
    // 1 is Date Created on every Quickbase table.
    select: [
      p.recordId,
      p.poNumber,
      p.contractPrice,
      p.jobName,
      p.title,
      p.scope,
      p.relatedSub,
      p.subName,
      1,
    ],
    where: `{${p.relatedJob}.EX.${jobRecordId}}`,
    sortBy: [{ fieldId: p.recordId, order: "DESC" }],
  })) as Raw[];
  if (!pos.length) return [];

  /*
   * The contract is the award cost item, not the purchase order's Contract
   * Price and not the sum of everything on it.
   *
   * Contract Price is the mainland's field and a Puerto Rico purchase order
   * leaves it empty, so reading it showed PO-14107 — a real $199,786.46
   * award — as $0.00. Summing every cost item is wrong the other way:
   * PO-1212 carries a Survey and its sales tax beside the award, and the
   * scope change belongs to the award line, because that is the line whose
   * Billed Cost Items it rewrites.
   *
   * Read for every purchase order at once rather than one query each, and
   * read the way planScopeChange does, so the figure compared on screen and
   * the figure the plan works from cannot disagree.
   */
  const c = QB_AWARD.costItems;
  const items = ((await queryAll({
    from: QB_AWARD.tables.costItems,
    select: [c.recordId, c.unitCost, c.qty, c.costType, c.relatedPO],
    where: pos.map((po) => `{${c.relatedPO}.EX.${num(po, p.recordId)}}`).join("OR"),
    sortBy: [{ fieldId: c.recordId, order: "ASC" }],
  })) as Raw[]).filter((i) => isAwardItem(i, c.costType));

  const contracts = new Map<number, number>();
  for (const i of items) {
    const po = rel(i, c.relatedPO) || num(i, c.relatedPO);
    contracts.set(po, (contracts.get(po) ?? 0) + num(i, c.unitCost) * (num(i, c.qty) || 1));
  }

  return pos
    .filter((po) => contracts.has(num(po, p.recordId)))
    .map((po) => ({
      poRecordId: num(po, p.recordId),
      poNumber: str(po, p.poNumber),
      contract: Math.round((contracts.get(num(po, p.recordId)) ?? 0) * 100) / 100,
      awardedOn: str(po, 1),
      jobName: str(po, p.jobName),
      title: str(po, p.title),
      scope: str(po, p.scope),
      subRecordId: rel(po, p.relatedSub) || num(po, p.relatedSub),
      subcontractor: str(po, p.subName),
    }));
}

/** Change Orders (bunq4tpad) — the fields this app fills in. */
const CO = {
  table: "bunq4tpad",
  title: 7,
  description: 13,
  relatedJob: 14,
  relatedSub: 16,
  relatedPo: 39,
  classification: 57,
  subAmount: 113,
} as const;

export interface AppliedScopeChange {
  poRecordId: number;
  costItemRecordId: number;
  contractBefore: number;
  contractAfter: number;
  delta: number;
  billsUpdated: number;
  changeOrderRecordId: number | null;
  changeOrderError: string | null;
}

async function write(table: string, data: QbRecord[]): Promise<number[]> {
  const res = await fetch("https://api.quickbase.com/v1/records", {
    method: "POST",
    headers: {
      "QB-Realm-Hostname": QB_CONFIG.realm,
      Authorization: `QB-USER-TOKEN ${QB_CONFIG.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to: table, data, mergeFieldId: 3, fieldsToReturn: [3] }),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Quickbase ${res.status} writing ${table}: ${text.slice(0, 300)}`);
  const body = JSON.parse(text) as {
    metadata?: { createdRecordIds?: number[]; lineErrors?: Record<string, unknown> };
  };
  // Quickbase answers 200 to a write it rejected, so a failed update would
  // otherwise read exactly like a clean one.
  const errs = body.metadata?.lineErrors;
  if (errs && Object.keys(errs).length) {
    throw new Error(`Quickbase rejected rows in ${table}: ${JSON.stringify(errs).slice(0, 300)}`);
  }
  return body.metadata?.createdRecordIds ?? [];
}

/**
 * Apply a scope change: the award's Unit Cost, then the milestones under it.
 *
 * The plan is worked out again here from Quickbase rather than taken from the
 * caller. The browser showed a review, but between reading it and pressing
 * Apply a milestone may have been paid, and a figure that arrived in a request
 * body is not evidence of anything. If the fresh plan refuses, nothing is
 * written.
 *
 * Order matters. The cost item moves first because it is the contract the
 * milestones are a share of; if the bills moved first and the cost item write
 * then failed, the schedule would sum to more than the contract it belongs to.
 *
 * Quickbase has no transactions, so a failure part way is reported with what
 * had already been written rather than pretended away.
 */
export async function applyScopeChange(
  poRecordId: number,
  revisedTotal: number,
  actor: string,
): Promise<{ ok: true; applied: AppliedScopeChange } | { ok: false; error: string }> {
  const plan = await planScopeChange(poRecordId, revisedTotal);
  if (!plan) return { ok: false, error: "That purchase order has no award line to change." };
  if (plan.absorption.problem) return { ok: false, error: plan.absorption.problem };
  if (!plan.writes.length) {
    return { ok: false, error: "Nothing would change on the schedule." };
  }

  const c = QB_AWARD.costItems;
  const b = QB_AWARD.billLines;
  const { schedule } = plan;

  // 1. The contract. Unit Cost x Quantity is what rolls up, so the quantity
  //    already on the record is divided back out rather than assumed to be
  //    one — writing the whole contract as the unit cost of a two-unit item
  //    would double it.
  const qty = schedule.costItemQty || 1;
  await write(QB_AWARD.tables.costItems, [
    {
      [c.recordId]: { value: schedule.costItemRecordId },
      [c.unitCost]: { value: Math.round((plan.contractAfter / qty) * 100) / 100 },
    },
  ]);

  // 2. The milestones under it.
  await write(
    QB_AWARD.tables.billLines,
    plan.writes.map((w) => ({
      [b.recordId]: { value: w.recordId },
      [b.billAmount]: { value: w.amount },
      // The fraction, which is what a Quickbase percent field stores.
      [b.billPct]: { value: w.billPct },
    })),
  );

  // 3. The change order. Last, and never fatal: the money is already right,
  //    and a missing document is worth reporting rather than rolling back a
  //    schedule that is now correct.
  let changeOrderRecordId: number | null = null;
  let changeOrderError: string | null = null;
  try {
    const ids = await write(CO.table, [
      {
        [CO.title]: { value: `Scope change — ${schedule.jobName}` },
        [CO.description]: {
          value:
            `Revised scope for ${schedule.jobName} on ${schedule.poNumber}. ` +
            `Contract ${plan.contractBefore.toFixed(2)} to ${plan.contractAfter.toFixed(2)}, ` +
            `a change of ${plan.delta.toFixed(2)}, spread across ${plan.writes.length} ` +
            `outstanding milestone${plan.writes.length === 1 ? "" : "s"}. ` +
            `Applied from the Subcontractor Award System by ${actor}.`,
        },
        [CO.relatedJob]: { value: schedule.jobRecordId },
        [CO.relatedSub]: { value: schedule.subRecordId },
        [CO.relatedPo]: { value: poRecordId },
        [CO.subAmount]: { value: plan.delta },
        [CO.classification]: { value: "Intended for Purchase Order" },
      },
    ]);
    changeOrderRecordId = ids[0] ?? null;
  } catch (e) {
    changeOrderError = e instanceof Error ? e.message : "The change order was not created.";
  }

  await logAudit({
    action: "award.scope.changed",
    actor,
    outcome: "ok",
    target: { table: QB_AWARD.tables.pos, recordId: poRecordId },
    changedFields: ["Unit Cost", "Bill Amount", "Bill %"],
    before: { contract: plan.contractBefore },
    after: { contract: plan.contractAfter, delta: plan.delta },
    details: {
      costItemRecordId: schedule.costItemRecordId,
      billsUpdated: plan.writes.length,
      changeOrderRecordId,
    },
  });

  return {
    ok: true,
    applied: {
      poRecordId,
      costItemRecordId: schedule.costItemRecordId,
      contractBefore: plan.contractBefore,
      contractAfter: plan.contractAfter,
      delta: plan.delta,
      billsUpdated: plan.writes.length,
      changeOrderRecordId,
      changeOrderError,
    },
  };
}
