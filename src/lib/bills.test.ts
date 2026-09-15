import assert from "node:assert/strict";
import { test } from "node:test";
import {
  backChargeProblem,
  billRows,
  billingConvention,
  billTitle,
  buildBackChargeUpdate,
  buildBillRecord,
  matchBill,
  netOf,
  type ExistingBill,
} from "./bills";
import { QB_AWARD } from "./qb-award";

const f = QB_AWARD.billLines;
const val = (rec: Record<string, { value: unknown }>, fid: number) => rec[String(fid)]?.value;

function bill(over: Partial<ExistingBill> = {}): ExistingBill {
  return {
    recordId: 1,
    title: "Movilización (10%)",
    amount: 10000,
    backCharge: 0,
    backChargeDesc: "",
    ...over,
  };
}

test("a bill is titled the way the award flow and the code page title it", () => {
  assert.equal(billTitle("Movilización", 10), "Movilización (10%)");
  assert.equal(billTitle("Pago Inicial", 50), "Pago Inicial (50%)");
});

test("an existing bill is matched on the exact title first", () => {
  const bills = [bill({ recordId: 7, title: "Movilización (10%)" })];
  assert.equal(matchBill("Movilización", 10, bills)?.recordId, 7);
});

test("a bill whose percentage has drifted still counts as billed", () => {
  /*
   * The live table carries "Movilización-10%" and a bare "Movilizacion"
   * alongside the current format. Falling back to the milestone name is what
   * stops a second bill being created for a milestone already drawn.
   */
  const bills = [bill({ recordId: 9, title: "Movilización-10%" })];
  assert.equal(matchBill("Movilización", 5.61, bills)?.recordId, 9);

  assert.equal(matchBill("Techo", 10, bills), null);
});

test("milestones already billed are reported, the rest are billable", () => {
  // At a $100,000 contract 10% is exactly the $10,000 cap, so both
  // conventions agree and the split is the same either way.
  const rows = billRows("PR", "Reconstruction", 100000, [
    bill({ recordId: 11, title: "Movilización (10%)", amount: 10000 }),
  ]);

  assert.equal(rows.length, 8);
  assert.equal(rows[0].existing?.recordId, 11);
  assert.ok(rows.slice(1).every((r) => r.existing === null));
  // Every milestone still adds up to the contract.
  assert.ok(Math.abs(rows.reduce((s, r) => s + r.amount, 0) - 100000) < 0.005);
});

test("an unbilled PO is billed the way the award letter states it", () => {
  // $180,800 uncapped would pay 10% = $18,080 for mobilisation; the letter
  // caps it at $10,000 and spreads the balance across the other stages.
  assert.equal(billingConvention("PR", "Reconstruction", 180800, []), "unbilled");
  const rows = billRows("PR", "Reconstruction", 180800, []);
  assert.equal(rows[0].amount, 10000);
  assert.ok(Math.abs(rows.reduce((s, r) => s + r.amount, 0) - 180800) < 0.005);
});

test("a PO already billed uncapped goes on being billed uncapped", () => {
  /*
   * The Quickbase code page pays the flat percentage and does not apply the
   * cap. Finishing such a PO with capped amounts would leave its milestones
   * totalling more than the contract, so the PO's own convention wins.
   */
  const existing = [bill({ recordId: 12, title: "Movilización (10%)", amount: 18080 })];
  assert.equal(billingConvention("PR", "Reconstruction", 180800, existing), "uncapped");

  const rows = billRows("PR", "Reconstruction", 180800, existing);
  assert.equal(rows[0].amount, 18080);
  assert.ok(!rows[0].amountDiffers, "the bill on file matches, so nothing to flag");
  // Demolición at a flat 15%, not the redistributed figure.
  assert.equal(rows[1].amount, 27120);
  assert.ok(Math.abs(rows.reduce((s, r) => s + r.amount, 0) - 180800) < 0.005);
});

test("a PO already billed capped stays capped", () => {
  const existing = [bill({ recordId: 13, title: "Movilización (10%)", amount: 10000 })];
  assert.equal(billingConvention("PR", "Reconstruction", 180800, existing), "capped");

  const rows = billRows("PR", "Reconstruction", 180800, existing);
  assert.equal(rows[0].amount, 10000);
  assert.ok(!rows[0].amountDiffers);
  assert.ok(Math.abs(rows.reduce((s, r) => s + r.amount, 0) - 180800) < 0.005);
});

test("a bill matching neither convention is flagged rather than re-based", () => {
  // Part-paid or hand-edited. The figure on file is what the subcontractor was
  // told, so it is reported and left alone.
  const rows = billRows("PR", "Reconstruction", 180800, [
    bill({ recordId: 14, title: "Movilización (10%)", amount: 4321 }),
  ]);
  assert.equal(rows[0].existing?.amount, 4321);
  assert.ok(rows[0].amountDiffers, "the difference must be reported");
});

test("a mainland PO bills against the English milestones", () => {
  const rows = billRows("FL", "Reconstruction", 100000, []);
  assert.equal(rows.length, 8);
  assert.equal(rows[0].desc, "Mobilization");
  assert.equal(rows[7].desc, "Final Inspection");
  assert.ok(Math.abs(rows.reduce((s, r) => s + r.amount, 0) - 100000) < 0.005);
  // A Spanish bill title never matches an English milestone, so a Puerto Rico
  // PO's bills can never be mistaken for a mainland PO's.
  assert.equal(matchBill("Mobilization", 10, [bill()]), null);
});

test("a back charge nets the bill down and never below zero", () => {
  assert.equal(netOf(1000, 250), 750);
  assert.equal(netOf(1000, 0), 1000);
  assert.equal(netOf(1000, 5000), 0);
  assert.equal(netOf(1000, -50), 1000);
});

test("a back charge has to say what it was for", () => {
  assert.equal(backChargeProblem(0, "", 1000), null);
  assert.equal(backChargeProblem(100, "Materials bought by CM", 1000), null);
  assert.match(backChargeProblem(100, "", 1000) ?? "", /reason/);
  assert.match(backChargeProblem(100, "   ", 1000) ?? "", /reason/);
  assert.match(backChargeProblem(2000, "Materials", 1000) ?? "", /more than the bill/);
});

test("a new bill sends the whole percentage, not a fraction", () => {
  const rows = billRows("PR", "Repair", 1000, []);
  const rec = buildBillRecord({
    costItemRecordId: 500,
    jobRecordId: 687,
    qbLineItemLabel: "Subcontractors - Puerto Rico",
    row: rows[0],
    backCharge: 0,
    backChargeDesc: "",
  });

  assert.equal(val(rec, f.title), "Pago Inicial (50%)");
  // 50, never 0.5 — Quickbase divides a percent field by 100 on write.
  assert.equal(val(rec, f.billPct), 50);
  assert.equal(val(rec, f.billAmount), 500);
  assert.equal(val(rec, f.relatedItem), 500);
  assert.equal(val(rec, f.relatedJob), 687);
  assert.equal(val(rec, f.qbLineItem), "Subcontractors - Puerto Rico");
  // Nothing was deducted, so the back-charge fields are left off entirely.
  assert.equal(val(rec, f.backCharge), undefined);
  assert.equal(val(rec, f.backChargeDesc), undefined);
});

test("a new bill can carry its back charge and reason", () => {
  const rows = billRows("PR", "Repair", 1000, []);
  const rec = buildBillRecord({
    costItemRecordId: 500,
    jobRecordId: 0,
    qbLineItemLabel: "Subcontractors - Puerto Rico",
    row: rows[0],
    backCharge: 125.5,
    backChargeDesc: "Lumber supplied by CM",
  });
  assert.equal(val(rec, f.backCharge), 125.5);
  assert.equal(val(rec, f.backChargeDesc), "Lumber supplied by CM");
  // The bill is still worth what the milestone is worth; Net Amount is a
  // Quickbase formula, so netting is not done by lowering the amount.
  assert.equal(val(rec, f.billAmount), 500);
  assert.equal(val(rec, f.relatedJob), undefined);
});

test("updating a back charge touches only the back charge", () => {
  const rec = buildBackChargeUpdate(4242, 300, "Dumpster");
  assert.deepEqual(Object.keys(rec).sort(), ["223", "225", "3"].sort());
  assert.equal(val(rec, f.recordId), 4242);
  assert.equal(val(rec, f.backCharge), 300);
  assert.equal(val(rec, f.backChargeDesc), "Dumpster");
  // Never the amount, the percentage or the title.
  assert.equal(val(rec, f.billAmount), undefined);
  assert.equal(val(rec, f.billPct), undefined);
  assert.equal(val(rec, f.title), undefined);
});

test("clearing a back charge clears its reason with it", () => {
  const rec = buildBackChargeUpdate(4242, 0, "Dumpster");
  assert.equal(val(rec, f.backCharge), 0);
  assert.equal(val(rec, f.backChargeDesc), "");
});
