import { scheduleAmounts, scheduleForJobType } from "./schedule";

/**
 * Building the Quickbase records for an award — PO, Cost Item, Billing Line
 * Items. Pure payload construction, so it can be tested without writing.
 *
 * Field ids and constants mirror the Quickbase award code page (page 59). The
 * two must stay in step: a PO created here has to look like one created there.
 */

export const QB_AWARD = {
  tables: {
    pos: "bukmrrvkz",
    costItems: "bukms5ah7",
    billLines: "bum6mrfti",
  },
  pos: {
    recordId: 3,
    relatedJob: 13,
    relatedSub: 21,
    title: 6,
    scope: 40,
    poStatus: 15,
    dueDate: 173,
    lienWaiver: 181,
    expenseClass: 187,
    date: 77,
    catDemolition: 253,
    catSite: 254,
    /* Total Amount (262) is a Quickbase formula over the category fields —
       computed there, never written from here. */
  },
  costItems: {
    recordId: 3,
    relatedPO: 114,
    title: 6,
    costType: 7,
    unitCost: 8,
    qty: 9,
    unit: 10,
    relatedSub: 98,
    relatedQbLineItem: 13,
  },
  billLines: {
    recordId: 3,
    relatedItem: 85,
    title: 6,
    billPct: 48,
    billAmount: 49,
    status: 14,
    relatedJob: 99,
    qbLineItem: 41,
    costType: 50,
  },
  /** Defaults the code page applies on award. */
  costItemCostType: "Subcontractor",
  costItemUnit: "LS",
  /**
   * Required: the Cost Items table has a data rule rejecting a record with no
   * QB line item. 182 is the Puerto Rico account; plain "Subcontractors" is 181.
   */
  costItemQbLineItemId: 182,
  billLineQbLineItem: "Subcontractors - Puerto Rico",
  billLineCostType: "Subcontractor",
  /**
   * Bill % (fid 48) is a percent field that stores a fraction — 0.10 shows as
   * 10%. The API wants the WHOLE number: send 10, Quickbase stores 0.10.
   * Sending 0.10 stores 0.001 and displays 0.1%. Verified against live data on
   * the code page, where this same flag "MUST stay false".
   */
  billPctAsFraction: false,
} as const;

export type QbValue = { value: string | number | boolean };
export type QbRecord = Record<string, QbValue>;

export interface AwardWriteInput {
  jobRecordId: number;
  subRecordId: number;
  title: string;
  scope: string;
  poStatus: string;
  expenseClass: string;
  lienWaiver: boolean;
  dueDate: string;
  jobType: string;
  /** The contract amount — this system's award total. */
  award: number;
  /** Scope totals per coverage, used to split the award across the PO fields. */
  demoTotal: number;
  siteTotal: number;
  createBills: boolean;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Split the award across the PO's Demolición and Site fields in the same ratio
 * as the CE-DEMO and CE-SITE scope, so the two add up to the award and the
 * Quickbase formula field agrees with the letter.
 *
 * The remainder lands on Site so the pair always totals exactly. With no scope
 * on either side the whole award goes to Site rather than vanishing.
 */
export function splitAward(
  award: number,
  demoTotal: number,
  siteTotal: number,
): { demolition: number; site: number } {
  const scope = demoTotal + siteTotal;
  if (!(scope > 0)) return { demolition: 0, site: round(award) };
  const demolition = round(award * (demoTotal / scope));
  return { demolition, site: round(award - demolition) };
}

export function buildPoRecord(input: AwardWriteInput): QbRecord {
  const f = QB_AWARD.pos;
  const split = splitAward(input.award, input.demoTotal, input.siteTotal);

  const po: QbRecord = {
    [f.relatedJob]: { value: input.jobRecordId },
    [f.relatedSub]: { value: input.subRecordId },
    [f.title]: { value: input.title },
    [f.scope]: { value: input.scope },
    [f.poStatus]: { value: input.poStatus },
    [f.expenseClass]: { value: input.expenseClass },
    [f.lienWaiver]: { value: input.lienWaiver },
    [f.date]: { value: new Date().toISOString().slice(0, 10) },
  };

  if (input.dueDate) po[f.dueDate] = { value: input.dueDate };
  if (split.demolition > 0) po[f.catDemolition] = { value: split.demolition };
  if (split.site > 0) po[f.catSite] = { value: split.site };

  return po;
}

export function buildCostItemRecord(
  input: AwardWriteInput,
  poRecordId: number,
): QbRecord {
  const f = QB_AWARD.costItems;
  return {
    [f.relatedPO]: { value: poRecordId },
    [f.title]: { value: input.title || input.scope },
    [f.costType]: { value: QB_AWARD.costItemCostType },
    [f.unitCost]: { value: input.award },
    [f.qty]: { value: 1 },
    [f.unit]: { value: QB_AWARD.costItemUnit },
    [f.relatedSub]: { value: input.subRecordId },
    [f.relatedQbLineItem]: { value: QB_AWARD.costItemQbLineItemId },
  };
}

export function buildBillRecords(
  input: AwardWriteInput,
  costItemRecordId: number,
): QbRecord[] {
  const f = QB_AWARD.billLines;
  const schedule = scheduleForJobType(input.jobType);
  const amounts = scheduleAmounts(input.award, schedule);

  return schedule.map((milestone, i) => {
    const rec: QbRecord = {
      [f.relatedItem]: { value: costItemRecordId },
      [f.title]: { value: `${milestone.desc} (${milestone.pct}%)` },
      [f.billPct]: {
        value: QB_AWARD.billPctAsFraction ? milestone.pct / 100 : milestone.pct,
      },
      [f.billAmount]: { value: amounts[i] },
      [f.qbLineItem]: { value: QB_AWARD.billLineQbLineItem },
      [f.costType]: { value: QB_AWARD.billLineCostType },
    };
    if (input.jobRecordId) rec[f.relatedJob] = { value: input.jobRecordId };
    return rec;
  });
}

/** A human-readable summary of exactly what a write would create. */
export interface AwardPlan {
  po: { title: string; scope: string; status: string; demolition: number; site: number };
  costItem: { title: string; unitCost: number; costType: string; unit: string };
  bills: { title: string; pct: number; amount: number }[];
  billTotal: number;
}

export function planAward(input: AwardWriteInput): AwardPlan {
  const split = splitAward(input.award, input.demoTotal, input.siteTotal);
  const schedule = scheduleForJobType(input.jobType);
  const amounts = scheduleAmounts(input.award, schedule);

  return {
    po: {
      title: input.title,
      scope: input.scope,
      status: input.poStatus,
      demolition: split.demolition,
      site: split.site,
    },
    costItem: {
      title: input.title || input.scope,
      unitCost: input.award,
      costType: QB_AWARD.costItemCostType,
      unit: QB_AWARD.costItemUnit,
    },
    bills: input.createBills
      ? schedule.map((m, i) => ({
          title: `${m.desc} (${m.pct}%)`,
          pct: m.pct,
          amount: amounts[i],
        }))
      : [],
    billTotal: input.createBills ? amounts.reduce((s, a) => s + a, 0) : 0,
  };
}
