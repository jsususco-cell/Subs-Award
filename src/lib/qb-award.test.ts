import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EMPTY_CATEGORIES,
  QB_AWARD,
  buildBillRecords,
  buildCostItemRecord,
  buildInsuranceRecord,
  buildBreakdownCostItems,
  buildPoRecord,
  breakdownBalance,
  breakdownTotal,
  categoriesTotal,
  planAward,
  splitAward,
  type AwardWriteInput,
} from "./qb-award";
import { PAY_SCHEDULES, scheduleLines } from "./schedule";
import { FONDO_FIELDS, FONDO_STATUS } from "./fondo";

const CENT = 0.005;

/**
 * The account the write resolves to. Real writes look this up from the QB
 * Line Items table by QBO location and Active status; the builders are handed
 * the answer, so the tests hand them one too.
 */
const ACCOUNT = { id: 233, label: "Subcontractors" };

function input(over: Partial<AwardWriteInput> = {}): AwardWriteInput {
  return {
    region: "PR",
    jobRecordId: 687,
    subRecordId: 2738,
    title: "Demolition and site work",
    scope: "Per the extracted scope",
    poStatus: "Unreleased",
    expenseClass: "PO",
    lienWaiver: true,
    dueDate: "",
    jobType: "Reconstruction",
    award: 178275.23,
    demoTotal: 60039.88,
    siteTotal: 88526.72,
    ada: 0,
    caseNumber: "PR-R3-03073",
    subcontractorName: "Acme Demolition",
    createBills: true,
    createInsurance: true,
    ...over,
  };
}

const val = (rec: Record<string, { value: unknown }>, fid: number) =>
  rec[String(fid)]?.value;

test("the award splits across Demolición and Site in the scope's own ratio", () => {
  const s = splitAward(178275.23, 60039.88, 88526.72);
  assert.ok(
    Math.abs(s.demolition + s.site - 178275.23) < CENT,
    "must total the award",
  );

  // 60,039.88 / 148,566.60 = 40.41%
  const expected = 178275.23 * (60039.88 / 148566.6);
  assert.ok(Math.abs(s.demolition - expected) < CENT);
  assert.ok(
    s.demolition < s.site,
    "site scope is larger, so its share should be",
  );
});

test("the split always totals the award exactly, whatever the ratio", () => {
  for (const [award, demo, site] of [
    [178275.23, 60039.88, 88526.72],
    [100000, 1, 2],
    [0.03, 1, 1],
    [122103.21, 0, 272.48],
    [999999.99, 33333.33, 66666.66],
  ]) {
    const s = splitAward(award, demo, site);
    assert.ok(
      Math.abs(s.demolition + s.site - award) < CENT,
      `${award} split ${s.demolition}/${s.site}`,
    );
  }
});

test("with no scope on either side the award still lands somewhere", () => {
  const s = splitAward(5000, 0, 0);
  assert.equal(s.demolition, 0);
  assert.equal(s.site, 5000, "the award must not vanish");
});

test("a demo-only job puts everything on Demolición", () => {
  const s = splitAward(1000, 500, 0);
  assert.ok(Math.abs(s.demolition - 1000) < CENT);
  assert.ok(Math.abs(s.site) < CENT);
});

test("the PO record carries the fields the code page writes", () => {
  const po = buildPoRecord(input());
  const f = QB_AWARD.pos;

  assert.equal(val(po, f.relatedJob), 687);
  assert.equal(val(po, f.relatedSub), 2738);
  assert.equal(val(po, f.title), "Demolition and site work");
  assert.equal(val(po, f.poStatus), "Unreleased");
  assert.equal(val(po, f.expenseClass), "PO");
  assert.equal(val(po, f.lienWaiver), true);
  assert.match(String(val(po, f.date)), /^\d{4}-\d{2}-\d{2}$/);

  // The category fields must add up to the award so QB's formula agrees.
  const total = Number(val(po, f.catDemolition)) + Number(val(po, f.catSite));
  assert.ok(Math.abs(total - 178275.23) < CENT);

  // Total Amount (262) is a formula field and must never be written.
  assert.equal(po["262"], undefined, "262 is computed by Quickbase");
  // An empty due date is omitted rather than sent blank.
  assert.equal(po[String(f.dueDate)], undefined);
});

test("a due date is included when given", () => {
  const po = buildPoRecord(input({ dueDate: "2027-02-28" }));
  assert.equal(val(po, QB_AWARD.pos.dueDate), "2027-02-28");
});

test("the cost item holds the contract amount and the required QB line item", () => {
  const ci = buildCostItemRecord(input(), 14421, ACCOUNT);
  const f = QB_AWARD.costItems;

  assert.equal(val(ci, f.relatedPO), 14421);
  assert.equal(
    val(ci, f.unitCost),
    178275.23,
    "this is where the contract money lives",
  );
  assert.equal(val(ci, f.qty), 1);
  assert.equal(val(ci, f.unit), "LS");
  assert.equal(val(ci, f.costType), "Subcontractor");
  assert.equal(val(ci, f.relatedSub), 2738);
  // The Cost Items table rejects a record with no QB line item, and the id
  // written is whatever the account resolved to — never a constant in here.
  assert.equal(val(ci, f.relatedQbLineItem), ACCOUNT.id);
});

test("bill percentages are sent whole, because the API divides by 100", () => {
  /*
   * Send 10, Quickbase stores 0.1, the record displays 10%. Reading a bill back
   * shows the 0.1 and looks like an argument for sending fractions -- it is not,
   * because a read shows what is stored, not what was sent.
   *
   * Live bills #4300/#4319/#4328/#4344/#4352/#4400 are titled "Movilización
   * (10%)" by the Quickbase award code page, which sends the whole number, and
   * every one of them stores 0.1.
   */
  assert.equal(QB_AWARD.billPctAsFraction, false);

  const bills = buildBillRecords(input(), 9001, ACCOUNT);
  const f = QB_AWARD.billLines;
  // Movilización is capped on this award, so its share is 5.61%, not 10%.
  assert.equal(val(bills[0], f.billPct), 5.61);
  assert.equal(val(bills[5], f.billPct), 20.98);
  assert.ok(
    bills.every((b) => Number(val(b, f.billPct)) <= 100),
    "no bill may exceed 100%",
  );
  // The regression this guards: a fraction here files the bill at 1/100th.
  assert.ok(
    bills.every((b) => Number(val(b, f.billPct)) > 1),
    "a value at or below 1 means fractions crept back in",
  );

  // A two-payment schedule sends 50, not 0.5.
  const whole = buildBillRecords(input({ jobType: "Repair" }), 9001, ACCOUNT);
  assert.equal(val(whole[0], f.billPct), 50);

  // The stated share must describe the amount actually being paid. Checked in
  // this direction because the percentage is rounded to two decimals, so the
  // inverse (amount / pct) carries that rounding magnified by a small pct.
  for (const b of bills) {
    const share = Number(val(b, f.billPct));
    const amount = Number(val(b, f.billAmount));
    assert.ok(
      Math.abs(share - (amount / 178275.23) * 100) <= 0.005 + 1e-9,
      `${share}% does not describe ${amount}`,
    );
  }
});

test("the contract amount is stored to the cent, not as a raw float", () => {
  // Unit Cost is currency to 2dp; an unrounded award stored 178275.2272727273.
  const ci = buildCostItemRecord(
    input({ award: 178275.2272727273 }),
    1,
    ACCOUNT,
  );
  assert.equal(val(ci, QB_AWARD.costItems.unitCost), 178275.23);
  assert.equal(
    planAward(input({ award: 178275.2272727273 })).costItem.unitCost,
    178275.23,
  );
});

test("the bills match the payment schedule and total the award", () => {
  const bills = buildBillRecords(input(), 9001, ACCOUNT);
  const f = QB_AWARD.billLines;

  assert.equal(bills.length, 8, "Reconstruction uses the 8-milestone schedule");
  assert.equal(val(bills[0], f.title), "Movilización (5.61%)");
  assert.equal(val(bills[7], f.title), "Inspección Final (10.49%)");

  const total = bills.reduce((s, b) => s + Number(val(b, f.billAmount)), 0);
  assert.ok(Math.abs(total - 178275.23) < CENT, `bills total ${total}`);

  const expected = scheduleLines(178275.23, PAY_SCHEDULES.standard8);
  bills.forEach((b, i) => {
    assert.ok(
      Math.abs(Number(val(b, f.billAmount)) - expected[i].amount) < CENT,
    );
  });

  // Every bill points at the cost item, the job, and carries the QuickBooks text.
  assert.ok(bills.every((b) => val(b, f.relatedItem) === 9001));
  assert.ok(bills.every((b) => val(b, f.relatedJob) === 687));
  assert.ok(bills.every((b) => val(b, f.qbLineItem) === ACCOUNT.label));
  assert.ok(bills.every((b) => val(b, f.costType) === "Subcontractor"));
});

test("the job type picks the schedule, so a repair gets two bills", () => {
  const bills = buildBillRecords(input({ jobType: "Repair" }), 9001, ACCOUNT);
  assert.equal(bills.length, 2);
  assert.equal(val(bills[0], QB_AWARD.billLines.title), "Pago Inicial (50%)");

  const relocation = buildBillRecords(
    input({ jobType: "Relocation" }),
    9001,
    ACCOUNT,
  );
  assert.equal(val(relocation[0], QB_AWARD.billLines.billPct), 20);
});

test("the plan describes exactly what would be written", () => {
  const plan = planAward(input());
  assert.equal(plan.bills.length, 8);
  assert.ok(Math.abs(plan.billTotal - 178275.23) < CENT);
  assert.ok(
    Math.abs(
      plan.po.categories.demolition + plan.po.categories.site - 178275.23,
    ) < CENT,
  );
  assert.equal(plan.costItem.unitCost, 178275.23);

  // Unticking the bills leaves the PO and cost item, and nothing else.
  const noBills = planAward(input({ createBills: false }));
  assert.equal(noBills.bills.length, 0);
  assert.equal(noBills.billTotal, 0);
  assert.equal(noBills.costItem.unitCost, 178275.23);
});

test("a blank title falls back to the scope, so the PO is never unnamed", () => {
  const ci = buildCostItemRecord(input({ title: "" }), 1, ACCOUNT);
  assert.equal(val(ci, QB_AWARD.costItems.title), "Per the extracted scope");
});

test("ADA is written to its own PO field and held out of the Demo/Site split", () => {
  const po = buildPoRecord(input({ ada: 15000 }));
  const f = QB_AWARD.pos;

  assert.equal(val(po, f.catAdaConversion), 15000);

  // The invariant that keeps Quickbase's Total Amount formula honest:
  // Demolicion + Site + ADA must come to the award, never more.
  const total =
    Number(val(po, f.catDemolition)) +
    Number(val(po, f.catSite)) +
    Number(val(po, f.catAdaConversion));
  assert.ok(Math.abs(total - 178275.23) < CENT, `PO categories total ${total}`);

  // Demo/Site now share only the non-ADA remainder.
  const spread = Number(val(po, f.catDemolition)) + Number(val(po, f.catSite));
  assert.ok(Math.abs(spread - (178275.23 - 15000)) < CENT);
});

test("with no ADA the field is left off entirely, not written as zero", () => {
  const po = buildPoRecord(input({ ada: 0 }));
  assert.equal(po[String(QB_AWARD.pos.catAdaConversion)], undefined);
  const total =
    Number(val(po, QB_AWARD.pos.catDemolition)) +
    Number(val(po, QB_AWARD.pos.catSite));
  assert.ok(
    Math.abs(total - 178275.23) < CENT,
    "the whole award still lands on Demo/Site",
  );
});

test("the split reconciles with ADA whatever the ratio", () => {
  for (const [award, demo, site, ada] of [
    [178275.23, 60039.88, 88526.72, 15000],
    [193275.23, 60039.88, 88526.72, 15000.01],
    [100000, 1, 2, 99999.99],
    [50000, 0, 0, 10000],
    [1000, 500, 0, 1000],
  ]) {
    const s = splitAward(award, demo, site, ada);
    assert.ok(
      Math.abs(s.demolition + s.site + ada - award) < CENT,
      `${award} split ${s.demolition}/${s.site} + ada ${ada}`,
    );
  }
});

test("the contract and the bills carry ADA, because it is part of the award", () => {
  // The award reaching this module already includes ADA; the cost item is the
  // whole contract and the schedule bills against all of it.
  const withAda = input({ award: 193275.23, ada: 15000 });

  const ci = buildCostItemRecord(withAda, 1, ACCOUNT);
  assert.equal(val(ci, QB_AWARD.costItems.unitCost), 193275.23);

  const bills = buildBillRecords(withAda, 9001, ACCOUNT);
  const total = bills.reduce(
    (sum, b) => sum + Number(val(b, QB_AWARD.billLines.billAmount)),
    0,
  );
  assert.ok(Math.abs(total - 193275.23) < CENT, `bills total ${total}`);

  const plan = planAward(withAda);
  assert.equal(plan.po.categories.ada, 15000);
  assert.ok(
    Math.abs(
      plan.po.categories.demolition +
        plan.po.categories.site +
        plan.po.categories.ada -
        193275.23,
    ) < CENT,
  );
});

test("the award opens a Fondo submittal the case can be chased on", () => {
  const rec = buildInsuranceRecord(input(), 14541);
  const f = QB_AWARD.insurance;

  assert.equal(val(rec, f.caseNumber), "PR-R3-03073");
  assert.equal(val(rec, f.subcontractorName), "Acme Demolition");
  assert.equal(val(rec, f.relatedJob), 687);
  assert.equal(val(rec, f.relatedSub), 2738);

  // The poliza has to cover the contract, so the full award is what is owed.
  assert.equal(val(rec, f.awardedAmount), 178275.23);

  // Nothing has been submitted yet. Leaving these empty is what makes
  // Coverage Status read "NO POLICY ON FILE" instead of hiding the case.
  assert.equal(rec[String(f.insuranceAmount)], undefined);
  assert.equal(rec[String(f.poliza)], undefined);
  assert.equal(
    rec[String(f.dateSubmitted)],
    undefined,
    "no submission date for a submission that has not happened",
  );

  // Coverage Status (21) is a formula and must never be written.
  assert.equal(rec[String(f.coverageStatus)], undefined);

  // There is no Related PO field, so the link back is recorded in comments.
  assert.match(String(val(rec, f.comments)), /14541/);
  assert.equal(val(rec, f.source), QB_AWARD.insuranceSource);

  // Without this the notifier, which matches the status exactly, would never
  // pick the case up -- and a blank status is what the 64 migrated records
  // carry, so blank cannot be treated as "awaiting".
  assert.equal(val(rec, FONDO_FIELDS.status), FONDO_STATUS.awaiting);
});

test("the submittal carries ADA, because the poliza must cover the whole award", () => {
  const rec = buildInsuranceRecord(input({ award: 193275.23, ada: 15000 }), 1);
  assert.equal(val(rec, QB_AWARD.insurance.awardedAmount), 193275.23);
});

test("an unrounded award is not written to the submittal as a raw float", () => {
  const rec = buildInsuranceRecord(input({ award: 178275.2272727273 }), 1);
  assert.equal(val(rec, QB_AWARD.insurance.awardedAmount), 178275.23);
});

/* ---------------------------------------------------------------------------
 * Awarding straight from a purchase order, with no scope to derive from.
 * ------------------------------------------------------------------------ */

test("the award breakdown totals what Quickbase's formula will compute", () => {
  // Total Amount (262) = Demolition + Site + Septic + Home + ADA
  //                      + Change Order + Revised Total.
  assert.equal(
    categoriesTotal({
      demolition: 100,
      site: 200,
      septic: 300,
      home: 400,
      ada: 50,
      changeOrder: 25,
      revisedTotal: 10,
    }),
    1085,
  );
  assert.equal(categoriesTotal(EMPTY_CATEGORIES), 0);
});

test("entered categories are written verbatim, zeroes left off", () => {
  const categories = {
    ...EMPTY_CATEGORIES,
    demolition: 12000,
    home: 48000.55,
    ada: 3000,
  };
  const po = buildPoRecord(
    input({ categories, award: categoriesTotal(categories), house: "Model B" }),
  );
  const f = QB_AWARD.pos;

  assert.equal(val(po, f.catDemolition), 12000);
  assert.equal(val(po, f.catHome), 48000.55);
  assert.equal(val(po, f.catAdaConversion), 3000);
  // Every category worth nothing is absent rather than written as 0; they are
  // currency fields with blankIsZero, so the Total Amount formula agrees.
  assert.equal(val(po, f.catSite), undefined);
  assert.equal(val(po, f.catSeptic), undefined);
  assert.equal(val(po, f.catChangeOrder), undefined);
  assert.equal(val(po, f.catRevisedTotal), undefined);
  assert.equal(val(po, f.house), "Model B");
  // Total Amount is a formula and must never be written.
  assert.equal(val(po, f.totalAmount), undefined);
});

test("categories replace the scope split rather than adding to it", () => {
  const categories = { ...EMPTY_CATEGORIES, site: 5000 };
  const po = buildPoRecord(
    input({ categories, award: 5000, demoTotal: 100000, siteTotal: 48566.6 }),
  );
  // demoTotal/siteTotal describe a scope this award does not have.
  assert.equal(val(po, QB_AWARD.pos.catDemolition), undefined);
  assert.equal(val(po, QB_AWARD.pos.catSite), 5000);
});

test("without categories the scope split still drives the PO", () => {
  const po = buildPoRecord(input());
  const f = QB_AWARD.pos;
  assert.ok(Number(val(po, f.catDemolition)) > 0);
  assert.ok(Number(val(po, f.catSite)) > 0);
  assert.equal(val(po, f.catSeptic), undefined);
});

test("House and the exclusions list are only written when filled in", () => {
  const bare = buildPoRecord(input({ house: "   ", itemsNotIncluded: "" }));
  assert.equal(val(bare, QB_AWARD.pos.house), undefined);
  assert.equal(val(bare, QB_AWARD.pos.itemsNotIncluded), undefined);

  const filled = buildPoRecord(
    input({ itemsNotIncluded: "Cistern (If Applicable)" }),
  );
  assert.equal(
    val(filled, QB_AWARD.pos.itemsNotIncluded),
    "Cistern (If Applicable)",
  );
});

test("the plan reports the categories a direct award would set", () => {
  const categories = { ...EMPTY_CATEGORIES, demolition: 700, site: 300 };
  const plan = planAward(input({ categories, award: 1000 }));
  assert.equal(plan.po.categories.demolition, 700);
  assert.equal(plan.po.total, 1000);
  // The bills still divide the contract amount.
  assert.ok(Math.abs(plan.billTotal - 1000) < 0.005);
});

test("the plan for a contract award describes what is actually written", () => {
  /*
   * The bug this guards: plannedCategories split the award into Demolition and
   * Site whenever no categories were passed, so the confirm summary for a
   * $4,200 Florida award read "Award breakdown: Site $4,200.00" — categories
   * that buildPoRecord returns before ever writing. The plan is what somebody
   * reads before pressing the button, so it has to be the write.
   */
  const contract = input({
    region: "FL",
    contractPrice: 4200,
    breakdown: [
      { desc: "Mobilisation", pct: 40, amount: 1680 },
      { desc: "Final", pct: 60, amount: 2520 },
    ],
    award: 4200,
    // Deliberately present: these drive the split that used to leak through.
    demoTotal: 1000,
    siteTotal: 3200,
  });

  const plan = planAward(contract);
  const written = buildPoRecord(contract);

  // No category is planned, because none is written.
  const CATEGORY_FIDS = [
    QB_AWARD.pos.catDemolition,
    QB_AWARD.pos.catSite,
    QB_AWARD.pos.catSeptic,
    QB_AWARD.pos.catHome,
    QB_AWARD.pos.catAdaConversion,
    QB_AWARD.pos.catChangeOrder,
    QB_AWARD.pos.catRevisedTotal,
  ];
  for (const key of Object.keys(
    plan.po.categories,
  ) as (keyof typeof plan.po.categories)[]) {
    assert.equal(plan.po.categories[key], 0, `${key} should not be planned`);
  }
  for (const fid of CATEGORY_FIDS) {
    assert.equal(
      val(written, fid),
      undefined,
      `field ${fid} should not be written`,
    );
  }

  assert.equal(plan.po.total, 0, "Total Amount is a formula over categories");
  assert.equal(plan.contractPrice, 4200);
  assert.equal(val(written, QB_AWARD.pos.contractPrice), 4200);

  // One cost item per breakdown row, not a single one carrying the lot.
  assert.equal(plan.lineItems.length, 2);
  assert.deepEqual(
    plan.lineItems.map((l) => [l.title, l.amount]),
    [
      ["Mobilisation", 1680],
      ["Final", 2520],
    ],
  );
});

test("a Puerto Rico award still plans its categories", () => {
  // The fix must not reach the scope-derived path, which has no contract price.
  const plan = planAward(
    input({ award: 1000, demoTotal: 600, siteTotal: 400 }),
  );
  assert.equal(plan.contractPrice, null);
  assert.ok(
    plan.po.total > 0,
    "categories are still planned without a contract",
  );
  assert.equal(plan.lineItems.length, 1);
});

/* ---------------------------------------------------------------------------
 * A mainland award: one contract price, broken down by hand into line items.
 * ------------------------------------------------------------------------ */

const ROWS = [
  { desc: "Mobilization", pct: 10, amount: 10000 },
  { desc: "Rough-in", pct: 25, amount: 25000 },
];

test("the contract price goes on the PO, and no cost categories do", () => {
  const po = buildPoRecord(
    input({
      region: "FL",
      contractPrice: 100000,
      breakdown: ROWS,
      award: 100000,
    }),
  );
  const f = QB_AWARD.pos;

  assert.equal(val(po, f.contractPrice), 100000);
  // Total Amount (262) is a formula over the seven categories. Leaving them
  // empty is what makes it read as $0 rather than as a wrong figure.
  for (const fid of [
    f.catDemolition,
    f.catSite,
    f.catSeptic,
    f.catHome,
    f.catAdaConversion,
    f.catChangeOrder,
    f.catRevisedTotal,
  ]) {
    assert.equal(val(po, fid), undefined);
  }
  // Total Cost (88) is a rollup of the line items and is never written.
  assert.equal(val(po, f.totalCost), undefined);
});

test("each breakdown row becomes its own PO line item", () => {
  const items = buildBreakdownCostItems(
    input({
      region: "FL",
      contractPrice: 100000,
      breakdown: ROWS,
      award: 100000,
    }),
    777,
    { id: 181, label: "Subcontractors" },
  );
  const f = QB_AWARD.costItems;

  assert.equal(items.length, 2);
  assert.equal(val(items[0], f.title), "Mobilization");
  assert.equal(val(items[0], f.unitCost), 10000);
  assert.equal(val(items[1], f.title), "Rough-in");
  assert.equal(val(items[1], f.unitCost), 25000);
  for (const item of items) {
    assert.equal(val(item, f.relatedPO), 777);
    assert.equal(val(item, f.qty), 1);
    assert.equal(val(item, f.relatedQbLineItem), 181);
  }
});

test("a row worth nothing is dropped rather than written as a $0 line", () => {
  const items = buildBreakdownCostItems(
    input({
      region: "FL",
      contractPrice: 100000,
      breakdown: [...ROWS, { desc: "Not yet priced", pct: 0, amount: 0 }],
      award: 100000,
    }),
    777,
    { id: 181, label: "Subcontractors" },
  );
  assert.equal(items.length, 2);
});

test("the breakdown may cover part of the contract, and the balance says so", () => {
  // The whole point: a first pass need not consume the contract.
  assert.equal(breakdownTotal(ROWS), 35000);
  assert.equal(breakdownBalance(100000, ROWS), 65000);
  assert.equal(breakdownBalance(35000, ROWS), 0);
  // Over-allocation is reported as negative rather than clamped away.
  assert.equal(breakdownBalance(30000, ROWS), -5000);
});

test("a contract award carries no exclusions text", () => {
  // "Items or Materials Not Included" is a Puerto Rico field and the mainland
  // award does not collect it; the PO builder returns before reaching it.
  const po = buildPoRecord(
    input({
      region: "FL",
      contractPrice: 5000,
      breakdown: [{ desc: "All", pct: 100, amount: 5000 }],
      award: 5000,
      itemsNotIncluded: "Cistern",
    }),
  );
  assert.equal(val(po, QB_AWARD.pos.itemsNotIncluded), undefined);
});
