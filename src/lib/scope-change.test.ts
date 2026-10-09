import assert from "node:assert/strict";
import { test } from "node:test";

import { absorbScopeChange, type ScheduleLine } from "./scope-change";

/** The worked example from the spreadsheet: $1,000 across eight milestones. */
function sheet(): ScheduleLine[] {
  return [
    { desc: "Milestone 1", pct: 10, amount: 100, locked: true },
    { desc: "Milestone 2", pct: 15, amount: 150, locked: true },
    { desc: "Milestone 3", pct: 20, amount: 200, locked: false },
    { desc: "Milestone 4", pct: 5, amount: 50, locked: false },
    { desc: "Milestone 5", pct: 30, amount: 300, locked: false },
    { desc: "Milestone 6", pct: 10, amount: 100, locked: false },
    { desc: "Milestone 7", pct: 5, amount: 50, locked: false },
    { desc: "Milestone 8", pct: 5, amount: 50, locked: false },
  ];
}

test("the worked example comes out as the spreadsheet says", () => {
  const r = absorbScopeChange(sheet(), 200);
  assert.equal(r.problem, null);
  assert.equal(r.previousTotal, 1000);
  assert.equal(r.newTotal, 1200);
  assert.equal(r.lockedTotal, 250);
  assert.equal(r.outstandingPct, 75);

  const by = Object.fromEntries(r.lines.map((l) => [l.desc, l.amount]));
  assert.equal(by["Milestone 1"], 100, "paid, untouched");
  assert.equal(by["Milestone 2"], 150, "paid, untouched");
  assert.equal(by["Milestone 3"], 253.33);
  assert.equal(by["Milestone 4"], 63.33);
  assert.equal(by["Milestone 5"], 380);
  assert.equal(by["Milestone 6"], 126.67);
  assert.equal(by["Milestone 7"], 63.33);
  // The last open line carries the rounding drift, so the schedule lands
  // exactly on 1,200 rather than a cent away from it.
  assert.equal(by["Milestone 8"], 63.34);
});

test("the schedule totals the revised contract exactly, to the cent", () => {
  for (const delta of [200, -150, 1, -1, 0.01, 333.33, -0.07, 99999.99]) {
    const r = absorbScopeChange(sheet(), delta);
    if (r.problem) continue;
    const total = r.lines.reduce((sum, l) => sum + l.amount, 0);
    assert.equal(
      Math.round(total * 100) / 100,
      r.newTotal,
      `delta ${delta} left the schedule at ${total}, not ${r.newTotal}`,
    );
  }
});

test("what has been paid never moves", () => {
  const r = absorbScopeChange(sheet(), -300);
  assert.equal(r.problem, null);
  for (const l of r.lines.filter((x) => x.locked)) {
    assert.equal(l.amount, l.before, `${l.desc} moved`);
    assert.equal(l.took, 0);
  }
  // And the whole reduction came off the open lines.
  const open = r.lines.filter((x) => !x.locked);
  assert.equal(Math.round(open.reduce((s, l) => s + l.took, 0) * 100) / 100, -300);
});

test("a reduction bigger than the outstanding work is refused, not floored", () => {
  // $750 is still open; dropping the scope by $900 cannot come out of it.
  const r = absorbScopeChange(sheet(), -900);
  assert.ok(r.problem, "should refuse");
  assert.match(r.problem ?? "", /larger than the work still outstanding/);
  assert.match(r.problem ?? "", /\$150\.00 that cannot be taken back/);
  // Nothing is half-applied: the schedule comes back as it went in.
  assert.deepEqual(
    r.lines.map((l) => l.amount),
    sheet().map((l) => l.amount),
  );
});

test("a fully paid schedule is refused and says why", () => {
  const paid = sheet().map((l) => ({ ...l, locked: true }));
  const r = absorbScopeChange(paid, 200);
  assert.match(r.problem ?? "", /already been paid/);
  assert.match(r.problem ?? "", /change order of its own/);
});

test("a change worth nothing is refused rather than writing a no-op", () => {
  assert.match(absorbScopeChange(sheet(), 0).problem ?? "", /worth the same/);
});

test("with nothing paid yet the change spreads across the whole schedule", () => {
  const fresh = sheet().map((l) => ({ ...l, locked: false }));
  const r = absorbScopeChange(fresh, 500);
  assert.equal(r.problem, null);
  assert.equal(r.outstandingPct, 100);
  assert.equal(r.lockedTotal, 0);
  // 30% of a 1,500 contract.
  assert.equal(r.lines.find((l) => l.desc === "Milestone 5")?.amount, 450);
  assert.equal(r.newTotal, 1500);
});

test("the restated share describes the revised contract, and is offered not applied", () => {
  const r = absorbScopeChange(sheet(), 200);
  const m3 = r.lines.find((l) => l.desc === "Milestone 3");
  // It was 20% of 1,000 and is now 253.33 of 1,200 — a different number, which
  // is the whole reason this is surfaced rather than assumed.
  assert.equal(m3?.pct, 20, "the stated percentage is left alone");
  assert.equal(m3?.restatedPct, 21.11);
  const paid = r.lines.find((l) => l.desc === "Milestone 1");
  assert.equal(paid?.restatedPct, 8.33, "a paid milestone is a smaller share of a bigger contract");
});
