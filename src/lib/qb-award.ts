import { scheduleForJobType, scheduleLines } from "./schedule";

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
    catAdaConversion: 258,
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
   * Bill % (fid 48) is a percent field that stores the FRACTION: 0.2 displays
   * as 20%, and 1 as 100%. Send 20 and it stores 20, which displays as 2000%.
   *
   * Established by reading live Billing Line Items rather than trusting the
   * code page's comment, which claimed the opposite. Records #78/#79 bill the
   * same $845 contract at 0.4 ($338) and 0.3 ($253.50) -- 338/0.4 = 845 and
   * 253.5/0.3 = 845, so the stored number is unambiguously the fraction.
   */
  billPctAsFraction: true,
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
  /** ADA conversion work, zero unless it applies to this subcontractor. */
  ada: number;
  createBills: boolean;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Split the scope portion of the award across the PO's Demolición and Site
 * fields, in the same ratio as the CE-DEMO and CE-SITE scope.
 *
 * ADA is a separate category on the purchase order (fid 258) and is passed in
 * here only so it can be held back: Demolición + Site + ADA must come to the
 * award, or Quickbase's Total Amount formula stops agreeing with the letter.
 *
 * The remainder lands on Site so the pair always totals exactly. With no scope
 * on either side the whole remainder goes to Site rather than vanishing.
 */
export function splitAward(
  award: number,
  demoTotal: number,
  siteTotal: number,
  ada = 0,
): { demolition: number; site: number } {
  const spread = round(award - (ada > 0 ? ada : 0));
  const scope = demoTotal + siteTotal;
  if (!(scope > 0)) return { demolition: 0, site: spread };
  const demolition = round(spread * (demoTotal / scope));
  return { demolition, site: round(spread - demolition) };
}

export function buildPoRecord(input: AwardWriteInput): QbRecord {
  const f = QB_AWARD.pos;
  const split = splitAward(input.award, input.demoTotal, input.siteTotal, input.ada);

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
  if (input.ada > 0) po[f.catAdaConversion] = { value: round(input.ada) };

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
    // Unit Cost is currency to 2dp. An unrounded award stored the raw float
    // (178275.2272727273), a fraction of a cent off the bills that derive
    // from it, so round to cents here as everywhere else.
    [f.unitCost]: { value: round(input.award) },
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
  const lines = scheduleLines(input.award, scheduleForJobType(input.jobType));

  return lines.map((line) => {
    const rec: QbRecord = {
      [f.relatedItem]: { value: costItemRecordId },
      [f.title]: { value: `${line.desc} (${line.pct}%)` },
      [f.billPct]: {
        // A percentage of two decimals is four as a fraction. Dividing alone
        // gives 5.61 / 100 = 0.056100000000000004, so round rather than send
        // float noise into a financial field.
        value: QB_AWARD.billPctAsFraction
          ? Math.round((line.pct / 100) * 1e6) / 1e6
          : line.pct,
      },
      [f.billAmount]: { value: line.amount },
      [f.qbLineItem]: { value: QB_AWARD.billLineQbLineItem },
      [f.costType]: { value: QB_AWARD.billLineCostType },
    };
    if (input.jobRecordId) rec[f.relatedJob] = { value: input.jobRecordId };
    return rec;
  });
}

/** A human-readable summary of exactly what a write would create. */
export interface AwardPlan {
  po: {
    title: string;
    scope: string;
    status: string;
    demolition: number;
    site: number;
    ada: number;
  };
  costItem: { title: string; unitCost: number; costType: string; unit: string };
  bills: { title: string; pct: number; amount: number }[];
  billTotal: number;
}

export function planAward(input: AwardWriteInput): AwardPlan {
  const split = splitAward(input.award, input.demoTotal, input.siteTotal, input.ada);
  const lines = scheduleLines(input.award, scheduleForJobType(input.jobType));

  return {
    po: {
      title: input.title,
      scope: input.scope,
      status: input.poStatus,
      demolition: split.demolition,
      site: split.site,
      ada: input.ada > 0 ? round(input.ada) : 0,
    },
    costItem: {
      title: input.title || input.scope,
      unitCost: round(input.award),
      costType: QB_AWARD.costItemCostType,
      unit: QB_AWARD.costItemUnit,
    },
    bills: input.createBills
      ? lines.map((l) => ({
          title: `${l.desc} (${l.pct}%)`,
          pct: l.pct,
          amount: l.amount,
        }))
      : [],
    billTotal: input.createBills ? lines.reduce((s, l) => s + l.amount, 0) : 0,
  };
}
