import assert from "node:assert/strict";
import { test } from "node:test";
import {
  QB_AWARD,
  buildBillRecords,
  buildCostItemRecord,
  buildPoRecord,
  planAward,
  splitAward,
  type AwardWriteInput,
} from "./qb-award";
import { PAY_SCHEDULES, scheduleLines } from "./schedule";

const CENT = 0.005;

function input(over: Partial<AwardWriteInput> = {}): AwardWriteInput {
  return {
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
    createBills: true,
    ...over,
  };
}

const val = (rec: Record<string, { value: unknown }>, fid: number) => rec[String(fid)]?.value;

test("the award splits across Demolición and Site in the scope's own ratio", () => {
  const s = splitAward(178275.23, 60039.88, 88526.72);
  assert.ok(Math.abs(s.demolition + s.site - 178275.23) < CENT, "must total the award");

  // 60,039.88 / 148,566.60 = 40.41%
  const expected = 178275.23 * (60039.88 / 148566.6);
  assert.ok(Math.abs(s.demolition - expected) < CENT);
  assert.ok(s.demolition < s.site, "site scope is larger, so its share should be");
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
  const ci = buildCostItemRecord(input(), 14421);
  const f = QB_AWARD.costItems;

  assert.equal(val(ci, f.relatedPO), 14421);
  assert.equal(val(ci, f.unitCost), 178275.23, "this is where the contract money lives");
  assert.equal(val(ci, f.qty), 1);
  assert.equal(val(ci, f.unit), "LS");
  assert.equal(val(ci, f.costType), "Subcontractor");
  assert.equal(val(ci, f.relatedSub), 2738);
  // The Cost Items table rejects a record with no QB line item; 182 is the PR account.
  assert.equal(val(ci, f.relatedQbLineItem), 182);
});

test("bill percentages are sent as fractions, never whole numbers", () => {
  // Bill % (48) is a percent field holding the fraction: 0.2 displays as 20%.
  // Sending 20 stores 20 and displays 2000%. Confirmed against live records
  // #78/#79, which bill one $845 contract at 0.4 ($338) and 0.3 ($253.50).
  assert.equal(QB_AWARD.billPctAsFraction, true);

  const bills = buildBillRecords(input(), 9001);
  const f = QB_AWARD.billLines;
  // Movilización is capped on this award, so its share is 5.61%, not 10%.
  assert.equal(val(bills[0], f.billPct), 0.0561);
  assert.equal(val(bills[5], f.billPct), 0.2098);
  assert.ok(
    bills.every((b) => Number(val(b, f.billPct)) <= 1),
    "no bill may exceed 1, which is 100%",
  );

  // A single-payment schedule must store 1, the way live 100% bills do.
  const whole = buildBillRecords(input({ jobType: "Repair" }), 9001);
  assert.equal(val(whole[0], f.billPct), 0.5);

  // The stated share must describe the amount actually being paid. Checked in
  // this direction because the percentage is rounded to two decimals, so the
  // inverse (amount / pct) carries that rounding magnified by a small pct.
  for (const b of bills) {
    const share = Number(val(b, f.billPct)) * 100;
    const amount = Number(val(b, f.billAmount));
    assert.ok(
      Math.abs(share - (amount / 178275.23) * 100) <= 0.005 + 1e-9,
      `${share}% does not describe ${amount}`,
    );
  }
});

test("the contract amount is stored to the cent, not as a raw float", () => {
  // Unit Cost is currency to 2dp; an unrounded award stored 178275.2272727273.
  const ci = buildCostItemRecord(input({ award: 178275.2272727273 }), 1);
  assert.equal(val(ci, QB_AWARD.costItems.unitCost), 178275.23);
  assert.equal(planAward(input({ award: 178275.2272727273 })).costItem.unitCost, 178275.23);
});

test("the bills match the payment schedule and total the award", () => {
  const bills = buildBillRecords(input(), 9001);
  const f = QB_AWARD.billLines;

  assert.equal(bills.length, 8, "Reconstruction uses the 8-milestone schedule");
  assert.equal(val(bills[0], f.title), "Movilización (5.61%)");
  assert.equal(val(bills[7], f.title), "Inspección Final (10.49%)");

  const total = bills.reduce((s, b) => s + Number(val(b, f.billAmount)), 0);
  assert.ok(Math.abs(total - 178275.23) < CENT, `bills total ${total}`);

  const expected = scheduleLines(178275.23, PAY_SCHEDULES.standard8);
  bills.forEach((b, i) => {
    assert.ok(Math.abs(Number(val(b, f.billAmount)) - expected[i].amount) < CENT);
  });

  // Every bill points at the cost item, the job, and carries the QuickBooks text.
  assert.ok(bills.every((b) => val(b, f.relatedItem) === 9001));
  assert.ok(bills.every((b) => val(b, f.relatedJob) === 687));
  assert.ok(bills.every((b) => val(b, f.qbLineItem) === "Subcontractors - Puerto Rico"));
  assert.ok(bills.every((b) => val(b, f.costType) === "Subcontractor"));
});

test("the job type picks the schedule, so a repair gets two bills", () => {
  const bills = buildBillRecords(input({ jobType: "Repair" }), 9001);
  assert.equal(bills.length, 2);
  assert.equal(val(bills[0], QB_AWARD.billLines.title), "Pago Inicial (50%)");

  const relocation = buildBillRecords(input({ jobType: "Relocation" }), 9001);
  assert.equal(val(relocation[0], QB_AWARD.billLines.billPct), 0.2);
});

test("the plan describes exactly what would be written", () => {
  const plan = planAward(input());
  assert.equal(plan.bills.length, 8);
  assert.ok(Math.abs(plan.billTotal - 178275.23) < CENT);
  assert.ok(Math.abs(plan.po.demolition + plan.po.site - 178275.23) < CENT);
  assert.equal(plan.costItem.unitCost, 178275.23);

  // Unticking the bills leaves the PO and cost item, and nothing else.
  const noBills = planAward(input({ createBills: false }));
  assert.equal(noBills.bills.length, 0);
  assert.equal(noBills.billTotal, 0);
  assert.equal(noBills.costItem.unitCost, 178275.23);
});

test("a blank title falls back to the scope, so the PO is never unnamed", () => {
  const ci = buildCostItemRecord(input({ title: "" }), 1);
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
  const total = Number(val(po, QB_AWARD.pos.catDemolition)) + Number(val(po, QB_AWARD.pos.catSite));
  assert.ok(Math.abs(total - 178275.23) < CENT, "the whole award still lands on Demo/Site");
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

  const ci = buildCostItemRecord(withAda, 1);
  assert.equal(val(ci, QB_AWARD.costItems.unitCost), 193275.23);

  const bills = buildBillRecords(withAda, 9001);
  const total = bills.reduce((sum, b) => sum + Number(val(b, QB_AWARD.billLines.billAmount)), 0);
  assert.ok(Math.abs(total - 193275.23) < CENT, `bills total ${total}`);

  const plan = planAward(withAda);
  assert.equal(plan.po.ada, 15000);
  assert.ok(Math.abs(plan.po.demolition + plan.po.site + plan.po.ada - 193275.23) < CENT);
});
