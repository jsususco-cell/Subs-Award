import assert from "node:assert/strict";
import { test } from "node:test";

import { isPaid, isSettled, paymentLabel, type BillPayment } from "./bill-status";

function bill(over: Partial<BillPayment> = {}): BillPayment {
  return { status: "", statusFormula: "", amount: 1000, amountPaid: 0, ...over };
}

test("the stored Status says paid", () => {
  assert.equal(isPaid(bill({ status: "Paid" })), true);
  assert.equal(paymentLabel(bill({ status: "Paid" })), "Paid");
});

test("the Mark as Paid checkbox says paid on its own", () => {
  /*
   * PO-15489's milestones: the checkbox is ticked, Date Paid is set and money
   * is against them, while the stored Status is blank. Reading only the
   * stored field showed them as "No Payment" beside their own Date Paid.
   */
  const b = bill({ statusFormula: "Paid", amountPaid: 1000, status: "" });
  assert.equal(isPaid(b), true);
  assert.equal(paymentLabel(b), "Paid");
});

test("money covering the line is its own answer", () => {
  assert.equal(isPaid(bill({ amount: 1000, amountPaid: 1000 })), true);
  // And a rounding cent short still counts, since the money has gone.
  assert.equal(isPaid(bill({ amount: 1000, amountPaid: 999.996 })), true);
});

test("part payment is not paid, but is settled", () => {
  const b = bill({ amountPaid: 400 });
  assert.equal(isPaid(b), false);
  assert.equal(isSettled(b), true, "money has gone out against it");
  assert.equal(paymentLabel(b), "Partially Paid");
});

test("marked paid with nothing paid yet still must not be moved", () => {
  // The case the old reading missed in both directions: a scope change or an
  // advance would have rewritten a line somebody had already marked paid.
  const b = bill({ statusFormula: "Paid", amountPaid: 0 });
  assert.equal(isSettled(b), true);
});

test("an untouched line is free to move", () => {
  assert.equal(isSettled(bill()), false);
  assert.equal(isSettled(bill({ status: "Unpaid" })), false);
});

test("what Quickbase says is preferred over a guess", () => {
  assert.equal(paymentLabel(bill({ status: "Unpaid" })), "Unpaid");
  assert.equal(
    paymentLabel(bill({ statusFormula: "Bill ready for payment" })),
    "Bill ready for payment",
  );
  // Only when both are silent and no money has moved is anything assumed.
  assert.equal(paymentLabel(bill()), "No Payment");
});

test("a zero-amount line is not paid just because nothing is owed", () => {
  // Advancing a milestone whole leaves it at $0.00; that is not a payment.
  assert.equal(isPaid(bill({ amount: 0, amountPaid: 0 })), false);
  assert.equal(isSettled(bill({ amount: 0, amountPaid: 0 })), false);
});
