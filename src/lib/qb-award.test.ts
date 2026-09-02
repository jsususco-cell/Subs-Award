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
import { PAY_SCHEDULES, scheduleAmounts } from "./schedule";

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

test("bill percentages are sent as whole numbers, never fractions", () => {
  // Quickbase stores 10 as 0.10 and shows 10%. Sending 0.10 stored 0.001 and
  // showed 0.1% — the bug the code page's flag exists to prevent.
  assert.equal(QB_AWARD.billPctAsFraction, false);

  const bills = buildBillRecords(input(), 9001);
  const f = QB_AWARD.billLines;
  assert.equal(val(bills[0], f.billPct), 10, "Movilización is 10, not 0.1");
  assert.equal(val(bills[5], f.billPct), 20, "Empañetado is 20, not 0.2");
  assert.ok(bills.every((b) => Number(val(b, f.billPct)) >= 1));
});

test("the bills match the payment schedule and total the award", () => {
  const bills = buildBillRecords(input(), 9001);
  const f = QB_AWARD.billLines;

  assert.equal(bills.length, 8, "Reconstruction uses the 8-milestone schedule");
  assert.equal(val(bills[0], f.title), "Movilización (10%)");
  assert.equal(val(bills[7], f.title), "Inspección Final (10%)");

  const total = bills.reduce((s, b) => s + Number(val(b, f.billAmount)), 0);
  assert.ok(Math.abs(total - 178275.23) < CENT, `bills total ${total}`);

  const expected = scheduleAmounts(178275.23, PAY_SCHEDULES.standard8);
  bills.forEach((b, i) => {
    assert.ok(Math.abs(Number(val(b, f.billAmount)) - expected[i]) < CENT);
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
  assert.equal(val(relocation[0], QB_AWARD.billLines.billPct), 20);
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
