import { scheduleForJobType, scheduleLines, scheduleSetFor } from "./schedule";
import { FONDO_FIELDS, FONDO_STATUS } from "./fondo";
import { regionFor, type RegionKey } from "./regions";

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
    /** Insurance Policy Submittal — the per-case Fondo (CFSE) poliza. */
    insurance: "bwa4ktcq6",
  },
  pos: {
    recordId: 3,
    poNumber: 17,
    relatedJob: 13,
    relatedSub: 21,
    jobName: 14,
    title: 6,
    scope: 40,
    poStatus: 15,
    jobType: 172,
    /** "Job - State" lookup — the region a purchase order belongs to. */
    jobState: 129,
    /*
     * Vendor status. All three are computed by Quickbase and never written:
     * Billing Line Item Status is a formula over Total Paid Bill %, which is
     * itself Total Amount Paid / Total Builder Cost, and Total Amount Paid is
     * a rollup of the bills.
     */
    billingStatus: 224,
    totalAmountPaid: 225,
    totalPaidPct: 226,
    dueDate: 173,
    lienWaiver: 181,
    expenseClass: 187,
    date: 77,
    /**
     * A ROLLUP of the cost items (mode: summary) — never written from here.
     * It says what has been broken down into line items so far, which on a
     * mainland award is not the same as what the contract is worth.
     */
    totalCost: 88,
    /**
     * What the subcontract is worth in total. Added 2026-09-16 because there
     * was nowhere to keep it: every other writable currency field on the table
     * either feeds the Total Amount formula (259, 260), is Puerto Rico
     * specific (313), or belongs to the compliance flow (292).
     *
     * Only written for regions whose awardEntry is "contract". Puerto Rico
     * carries its figure in the Award Breakdown categories instead.
     */
    contractPrice: 318,
    /*
     * The Award Breakdown. Total Amount (262) is a Quickbase formula over
     * exactly these seven and is never written from here:
     *
     *   Demolition + Site + Septic + Home
     *     + If(IsNull(ADA),0,ADA)
     *     + If(IsNull(ChangeOrder),0,ChangeOrder)
     *     + If(IsNull(RevisedTotal),0,RevisedTotal)
     *
     * All seven are currency fields with blankIsZero, so a category that does
     * not apply is left off rather than written as 0 — which is what the
     * Quickbase award code page does too.
     */
    catDemolition: 253,
    catSite: 254,
    catSeptic: 255,
    catHome: 256,
    house: 257,
    catAdaConversion: 258,
    catChangeOrder: 259,
    catRevisedTotal: 260,
    itemsNotIncluded: 261,
    totalAmount: 262,
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
    dueDate: 10,
    /** Lookup "Item - Related PO", used to spot a bill that already exists. */
    itemRelatedPO: 96,
    /** Deducted from the bill. Net Amount (224) is a formula over it. */
    backCharge: 223,
    netAmount: 224,
    backChargeDesc: 225,
  },
  /** Defaults the code page applies on award. */
  /**
   * Insurance Policy Submittal (bwa4ktcq6). Awarding a subcontractor obliges
   * them to produce a Fondo (CFSE) poliza covering the award, so the award
   * opens the submittal with the amount to be covered already on it.
   *
   * Job Name (23) and Subcontractor - Company (31) are lookups: writing the
   * Related Job and Related Subcontractor ids fills them in.
   *
   * Insurance Amount (13), Poliza (14), Date Submitted (11) and Submitted By
   * (17) are deliberately left empty. Nothing has been submitted yet, and the
   * Coverage Status formula reads a missing poliza as "NO POLICY ON FILE" --
   * which is the point: the case shows up as outstanding the moment it is
   * awarded. Dating a submission that has not happened would hide it.
   */
  insurance: {
    recordId: 3,
    caseNumber: 6,
    subcontractorName: 8,
    dateSubmitted: 11,
    awardedAmount: 12,
    insuranceAmount: 13,
    poliza: 14,
    comments: 16,
    submittedBy: 17,
    source: 18,
    coverageStatus: 21,
    relatedJob: 22,
    relatedSub: 30,
  },
  insuranceSource: "Subcontractor Award System",

  costItemCostType: "Subcontractor",
  costItemUnit: "LS",
  /*
   * The QB line item the cost posts to is per region and lives on the region
   * config — see `qbLineItem` in src/lib/regions.ts. It used to be the Puerto
   * Rico account hardcoded here, which would have quietly posted Florida cost
   * to a Puerto Rico account.
   */
  billLineCostType: "Subcontractor",
  /**
   * Bill % (fid 48) is a percent field. **Send the WHOLE number**: the REST API
   * divides by 100 on write, so 10 is stored as 0.1 and displays as 10%.
   *
   * This was wrong here until 2026-09-16 and is worth spelling out, because the
   * obvious check gets it backwards. Reading a bill back shows 0.1, which looks
   * like the store wants a fraction -- that is what records #78/#79 ($845 billed
   * at 0.4 and 0.3) appear to say, and the reasoning that used to sit here.
   * But a read shows what is STORED, not what was SENT.
   *
   * The discriminator is a bill whose writer is known. The Quickbase award code
   * page titles its milestones `${desc} (${pct}%)` and sends `billPct` as the
   * whole number; live bills #4300, #4319, #4328, #4344, #4352 and #4400 are all
   * titled "Movilización (10%)" and all store 0.1. Ten went in, 0.1 came out.
   *
   * Sending 0.1 would therefore store 0.001 and display 0.1% -- every bill filed
   * at a hundredth of its contract share. Nothing was corrupted because this app
   * had not yet written a bill to production.
   */
  billPctAsFraction: false,
} as const;

/**
 * The PO's Award Breakdown, entered directly rather than derived from a scope.
 *
 * Every field is a category on the purchase order and they must total the
 * contract amount, because Quickbase computes Total Amount (262) from exactly
 * these and the cost item carries the same figure.
 */
export interface PoCategories {
  demolition: number;
  site: number;
  septic: number;
  home: number;
  ada: number;
  changeOrder: number;
  revisedTotal: number;
}

export const EMPTY_CATEGORIES: PoCategories = {
  demolition: 0,
  site: 0,
  septic: 0,
  home: 0,
  ada: 0,
  changeOrder: 0,
  revisedTotal: 0,
};

/**
 * One line of a hand-entered payment breakdown.
 *
 * Each becomes a PO line item (a Cost Item). `pct` is the share of the
 * contract the line represents and is carried for the letter and the screen;
 * `amount` is what actually gets written, because the money is the thing that
 * has to add up.
 */
export interface BreakdownRow {
  desc: string;
  pct: number;
  amount: number;
}

/** What the breakdown comes to. */
export function breakdownTotal(rows: BreakdownRow[]): number {
  return round(rows.reduce((sum, r) => sum + (r.amount || 0), 0));
}

/**
 * What is left of the contract to break down.
 *
 * Never negative in display terms, but the raw difference is returned so an
 * over-allocation is visible rather than clamped away — a breakdown that comes
 * to more than the contract is a mistake someone needs to see.
 */
export function breakdownBalance(contractPrice: number, rows: BreakdownRow[]): number {
  return round(contractPrice - breakdownTotal(rows));
}

/** The seven categories, in the order the award breakdown shows them. */
export const CATEGORY_FIELDS: {
  key: keyof PoCategories;
  label: string;
  hint?: string;
  optional?: boolean;
}[] = [
  { key: "demolition", label: "Demolition", hint: "incl. septic system demolition" },
  { key: "site", label: "Site" },
  { key: "septic", label: "Septic System", hint: "replacement" },
  { key: "home", label: "Home" },
  { key: "ada", label: "ADA Conversion", optional: true },
  { key: "changeOrder", label: "Change Order Amount", optional: true },
  { key: "revisedTotal", label: "Revised Total Amount", optional: true },
];

/** What Quickbase's Total Amount formula will come to. */
export function categoriesTotal(c: PoCategories): number {
  return round(
    c.demolition + c.site + c.septic + c.home + c.ada + c.changeOrder + c.revisedTotal,
  );
}

export type QbValue = { value: string | number | boolean };
export type QbRecord = Record<string, QbValue>;

export interface AwardWriteInput {
  /** Decides the account the cost posts to and the billing milestones. */
  region: RegionKey;
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
  /**
   * The Award Breakdown, entered by hand. When present it is written verbatim
   * and `award` must equal its total; when absent the award is spread across
   * Demolition and Site in the ratio of the extracted scope.
   */
  categories?: PoCategories;
  /**
   * What the whole subcontract is worth, for a region that enters one figure
   * and breaks it down by hand. Written to the PO so a later visit can work
   * out what is left; the cost items only say what has been broken down.
   */
  contractPrice?: number;
  /** The hand-entered breakdown, one PO line item per row. */
  breakdown?: BreakdownRow[];
  /** "House" on the PO — the job's Canopy model home type. */
  house?: string;
  itemsNotIncluded?: string;
  /** Case number for the insurance submittal, i.e. the job name. */
  caseNumber: string;
  /** Subcontractor name as awarded, recorded on the submittal. */
  subcontractorName: string;
  createInsurance: boolean;
  createBills: boolean;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The account a region's cost posts to, resolved from Quickbase.
 *
 * Passed into the builders rather than read from the region, because which
 * account is current is a fact in the chart of accounts, not a constant. See
 * src/lib/qb-accounts.ts.
 */
export interface CostAccount {
  id: number;
  label: string;
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
  if (input.house?.trim()) po[f.house] = { value: input.house.trim() };
  /*
   * A contract-entry award carries its total on the purchase order and no cost
   * categories at all — those are the Puerto Rico Award Breakdown, and Total
   * Amount (262) is a formula over them, so leaving them empty is what makes
   * it read as $0 rather than as a wrong figure.
   *
   * Returned before the exclusions text as well as the categories: that field
   * is part of the same Puerto Rico block, and a caller passing it by mistake
   * should not be able to put it on a mainland purchase order.
   */
  if (input.contractPrice !== undefined) {
    po[f.contractPrice] = { value: round(input.contractPrice) };
    return po;
  }

  if (input.itemsNotIncluded?.trim()) {
    po[f.itemsNotIncluded] = { value: input.itemsNotIncluded.trim() };
  }

  /*
   * A category worth nothing is left off rather than written as 0. Every one
   * of these is a currency field with blankIsZero, so the Total Amount formula
   * reads a blank as zero — and this is what the code page does, so a PO from
   * either place looks the same.
   */
  const amounts: [number, number][] = input.categories
    ? [
        [f.catDemolition, input.categories.demolition],
        [f.catSite, input.categories.site],
        [f.catSeptic, input.categories.septic],
        [f.catHome, input.categories.home],
        [f.catAdaConversion, input.categories.ada],
        [f.catChangeOrder, input.categories.changeOrder],
        [f.catRevisedTotal, input.categories.revisedTotal],
      ]
    : (() => {
        const split = splitAward(
          input.award,
          input.demoTotal,
          input.siteTotal,
          input.ada,
        );
        return [
          [f.catDemolition, split.demolition],
          [f.catSite, split.site],
          [f.catAdaConversion, input.ada],
        ];
      })();

  for (const [fid, value] of amounts) {
    if (value > 0) po[fid] = { value: round(value) };
  }

  return po;
}

export function buildCostItemRecord(
  input: AwardWriteInput,
  poRecordId: number,
  account: CostAccount,
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
    [f.relatedQbLineItem]: { value: account.id },
  };
}

/**
 * A PO line item for each row of the breakdown.
 *
 * The Puerto Rico flow writes one cost item for the whole award and bills it
 * in milestones. This writes one per breakdown row instead, which is why a
 * mainland purchase order can carry several — and why Total Cost, a rollup of
 * these, climbs as more of the contract is broken down.
 *
 * Rows worth nothing are dropped rather than written: a $0 line item is noise
 * in the ledger and the Cost Items table would take it happily.
 */
export function buildBreakdownCostItems(
  input: AwardWriteInput,
  poRecordId: number,
  account: CostAccount,
): QbRecord[] {
  const f = QB_AWARD.costItems;
  return (input.breakdown ?? [])
    .filter((row) => row.amount > 0)
    .map((row) => ({
      [f.relatedPO]: { value: poRecordId },
      [f.title]: { value: row.desc.trim() || input.title || input.scope },
      [f.costType]: { value: QB_AWARD.costItemCostType },
      [f.unitCost]: { value: round(row.amount) },
      [f.qty]: { value: 1 },
      [f.unit]: { value: QB_AWARD.costItemUnit },
      [f.relatedSub]: { value: input.subRecordId },
      [f.relatedQbLineItem]: { value: account.id },
    }));
}

export function buildBillRecords(
  input: AwardWriteInput,
  costItemRecordId: number,
  account: CostAccount,
): QbRecord[] {
  const f = QB_AWARD.billLines;
  const region = regionFor(input.region);

  // No schedule means no milestones to bill against, so no lines at all.
  const lines = scheduleLines(
    input.award,
    scheduleForJobType(input.jobType, region),
    scheduleSetFor(region)?.mobilisationCap ?? null,
  );

  return lines.map((line) => {
    const rec: QbRecord = {
      [f.relatedItem]: { value: costItemRecordId },
      [f.title]: { value: `${line.desc} (${line.pct}%)` },
      [f.billPct]: {
        // The whole number, as the schedule already rounded it to two decimals.
        // The fraction branch remains only so the constant above can be flipped
        // if Quickbase ever changes; it rounds because a percentage of two
        // decimals is four as a fraction and 5.61 / 100 is 0.056100000000000004,
        // which is float noise to put in a financial field.
        value: QB_AWARD.billPctAsFraction
          ? Math.round((line.pct / 100) * 1e6) / 1e6
          : line.pct,
      },
      [f.billAmount]: { value: line.amount },
      [f.qbLineItem]: { value: account.label },
      [f.costType]: { value: QB_AWARD.billLineCostType },
    };
    if (input.jobRecordId) rec[f.relatedJob] = { value: input.jobRecordId };
    return rec;
  });
}

/**
 * Open the Fondo poliza submittal for this award.
 *
 * The amount written is the full award, because the poliza has to cover the
 * contract -- the purchase order's Required Fondo Coverage is the award plus
 * approved change orders, so anything less would read as short.
 */
export function buildInsuranceRecord(
  input: AwardWriteInput,
  poRecordId: number,
): QbRecord {
  const f = QB_AWARD.insurance;
  return {
    [f.caseNumber]: { value: input.caseNumber },
    [f.subcontractorName]: { value: input.subcontractorName },
    [f.awardedAmount]: { value: round(input.award) },
    [f.relatedJob]: { value: input.jobRecordId },
    [f.relatedSub]: { value: input.subRecordId },
    [f.source]: { value: QB_AWARD.insuranceSource },
    // Explicitly "awaiting" rather than left blank: the notifier only picks up
    // that exact status, which is what keeps the 64 migrated submittals -- all
    // of which have no status -- out of the mailing.
    [FONDO_FIELDS.status]: { value: FONDO_STATUS.awaiting },
    // There is no Related PO field on this table, so the tie back to the
    // purchase order lives here rather than being lost.
    [f.comments]: {
      value: `Opened by the Subcontractor Award System on award. Purchase order #${poRecordId}. Awaiting the Fondo (CFSE) poliza.`,
    },
  };
}

/** A human-readable summary of exactly what a write would create. */
export interface AwardPlan {
  po: {
    title: string;
    scope: string;
    status: string;
    /** What each Award Breakdown category will be set to. */
    categories: PoCategories;
    /** What Quickbase's Total Amount formula will come to. */
    total: number;
  };
  costItem: { title: string; unitCost: number; costType: string; unit: string };
  bills: { title: string; pct: number; amount: number }[];
  billTotal: number;
}

/** The categories a write would set, however they were arrived at. */
export function plannedCategories(input: AwardWriteInput): PoCategories {
  if (input.categories) return input.categories;
  const split = splitAward(input.award, input.demoTotal, input.siteTotal, input.ada);
  return {
    ...EMPTY_CATEGORIES,
    demolition: split.demolition,
    site: split.site,
    ada: input.ada > 0 ? round(input.ada) : 0,
  };
}

export function planAward(input: AwardWriteInput): AwardPlan {
  const region = regionFor(input.region);
  const categories = plannedCategories(input);
  const lines = scheduleLines(
    input.award,
    scheduleForJobType(input.jobType, region),
    scheduleSetFor(region)?.mobilisationCap ?? null,
  );

  return {
    po: {
      title: input.title,
      scope: input.scope,
      status: input.poStatus,
      categories,
      total: categoriesTotal(categories),
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
