import assert from "node:assert/strict";
import { test } from "node:test";

import { advanceTitle, fractionOf, planAdvance, type AdvanceMilestone } from "./advance";

/** PO-14094's foundation milestone: $7,982.50 of a $79,825.00 contract. */
function milestone(over: Partial<AdvanceMilestone> = {}): AdvanceMilestone {
  return {
    recordId: 4302,
    title: "Fundación (10%)",
    amount: 7982.5,
    paid: 0,
    status: "",
    ...over,
  };
}

const BASIS = 79825;

test("the money moves across and the schedule still adds up", () => {
  const p = planAdvance(milestone(), BASIS, 3000);
  assert.equal(p.problem, null);
  assert.equal(p.from.amountAfter, 4982.5);
  assert.equal(p.bill.amount, 3000);
  // What matters: the two lines together are what the one line was.
  assert.equal(p.from.amountAfter + p.bill.amount, 7982.5);
});

test("both lines still satisfy Builder Cost x Bill % = Bill Amount", () => {
  const p = planAdvance(milestone(), BASIS, 3000);
  assert.ok(Math.abs(BASIS * p.from.fractionAfter - p.from.amountAfter) < 0.01);
  assert.ok(Math.abs(BASIS * p.bill.fraction - p.bill.amount) < 0.01);
});

test("the percentages move across with the money", () => {
  const p = planAdvance(milestone(), BASIS, 3000);
  assert.equal(p.from.pctBefore, 10);
  assert.equal(p.from.pctAfter, 6.24);
  assert.equal(p.bill.pct, 3.76);
  // 6.24 + 3.76 is the 10 it started as, so the schedule's total share holds.
  assert.equal(Math.round((p.from.pctAfter + p.bill.pct) * 100) / 100, 10);
});

test("advancing the whole milestone leaves it at zero rather than refusing", () => {
  const p = planAdvance(milestone(), BASIS, 7982.5);
  assert.equal(p.problem, null);
  assert.equal(p.from.amountAfter, 0);
  assert.equal(p.from.pctAfter, 0);
  assert.equal(p.from.fractionAfter, 0);
  assert.equal(p.bill.amount, 7982.5);
  assert.equal(p.bill.pct, 10);
});

test("more than the milestone is worth is refused, not capped", () => {
  const p = planAdvance(milestone(), BASIS, 9000);
  assert.match(p.problem ?? "", /more than/);
  assert.equal(p.from.amountAfter, 7982.5, "nothing is half-applied");
});

test("a paid milestone has nothing left to advance", () => {
  assert.match(
    planAdvance(milestone({ paid: 7982.5, status: "Paid" }), BASIS, 1000).problem ?? "",
    /already been paid/,
  );
  // Status alone is enough, in case the amount has not caught up.
  assert.match(
    planAdvance(milestone({ status: "Paid" }), BASIS, 1000).problem ?? "",
    /already been paid/,
  );
  // And so is money against it with no status.
  assert.match(planAdvance(milestone({ paid: 0.01 }), BASIS, 1000).problem ?? "", /already been paid/);
});

test("nothing, or less than nothing, is refused", () => {
  assert.match(planAdvance(milestone(), BASIS, 0).problem ?? "", /more than nothing/);
  assert.match(planAdvance(milestone(), BASIS, -500).problem ?? "", /more than nothing/);
  assert.match(planAdvance(milestone(), BASIS, NaN).problem ?? "", /more than nothing/);
});

test("without a cost basis there is no share to express it as", () => {
  assert.match(planAdvance(milestone(), 0, 1000).problem ?? "", /no cost basis/);
});

test("the fraction is derived from the money, not from a rounded percentage", () => {
  /*
   * 13.75% of $100,000 is $13,750 where the line is $13,746.79. Working the
   * fraction out from the amount keeps the two in step to the cent.
   */
  const f = fractionOf(13746.79, 100000);
  assert.equal(f, 0.1374679);
  assert.ok(Math.abs(100000 * f - 13746.79) < 0.01);
});

test("the pair reads as a pair", () => {
  assert.equal(advanceTitle("Fundación (10%)"), "Advance — Fundación (10%)");
});
