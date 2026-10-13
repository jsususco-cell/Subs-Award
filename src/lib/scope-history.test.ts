import assert from "node:assert/strict";
import { test } from "node:test";

import { summarise, type ScopeChange } from "./scope-change";

function change(before: number, after: number, at: string): ScopeChange {
  return {
    at,
    actor: "someone@byrdsonservices.com",
    contractBefore: before,
    contractAfter: after,
    delta: Math.round((after - before) * 100) / 100,
    lines: { 4321: { before, after, pctBefore: 10, pctAfter: 10 } },
  };
}

test("nothing recorded is null, not a zero change", () => {
  assert.equal(summarise([]), null);
});

test("one change is itself", () => {
  const r = summarise([change(20000, 25000, "2026-10-13T14:00:00Z")]);
  assert.equal(r?.contractBefore, 20000);
  assert.equal(r?.contractAfter, 25000);
  assert.equal(r?.delta, 5000);
});

test("several changes read from where it started to where it stands", () => {
  /*
   * Newest first, the way the log returns them. The question the screen asks
   * is what the contract was originally and what it is now — not what the
   * middle step was — so the oldest "before" pairs with the newest "after".
   */
  const r = summarise([
    change(25000, 31000, "2026-10-13T14:00:00Z"),
    change(20000, 25000, "2026-10-01T09:00:00Z"),
  ]);
  assert.equal(r?.contractBefore, 20000);
  assert.equal(r?.contractAfter, 31000);
  assert.equal(r?.delta, 11000);
});

test("a milestone reads from where it started to where it stands", () => {
  // The same question the purchase order above it answers. Reading only the
  // newest change made the two disagree: the milestone said what moved last
  // time while the contract said what had moved in total.
  const r = summarise([
    change(25000, 31000, "2026-10-13T14:00:00Z"),
    change(20000, 25000, "2026-10-01T09:00:00Z"),
  ]);
  assert.equal(r?.lines[4321]?.before, 20000, "the oldest entry's before");
  assert.equal(r?.lines[4321]?.after, 31000, "the newest entry's after");
  assert.equal(r?.contractBefore, 20000);
  assert.equal(r?.contractAfter, 31000);
  assert.equal(r?.at, "2026-10-13T14:00:00Z");
});

test("a reduction keeps its sign", () => {
  const r = summarise([change(31000, 24000, "2026-10-13T14:00:00Z")]);
  assert.equal(r?.delta, -7000);
});

test("the previous figure is the one the line was raised with, so it is undated here", () => {
  // Nothing recorded set it — it is where the line started — so only the
  // record knows the date, and the route fills it from Date Created.
  const r = summarise([
    change(25000, 31000, "2026-10-13T14:00:00Z"),
    change(20000, 25000, "2026-10-01T09:00:00Z"),
  ]);
  assert.equal(r?.lines[4321]?.atBefore, null);
  assert.equal(r?.lines[4321]?.atAfter, "2026-10-13T14:00:00Z");
});

test("a milestone the newest change left alone still shows what it did", () => {
  /*
   * Milestone 20 was revised twice and then paid, so every change after that
   * correctly left it alone. Reading only the newest entry dropped it from
   * the columns entirely, as though it had never moved.
   */
  const newest: ScopeChange = {
    at: "2026-10-13T14:00:00Z",
    actor: "a@b.com",
    contractBefore: 25000,
    contractAfter: 31000,
    delta: 6000,
    lines: { 10: { before: 5000, after: 6000, pctBefore: 20, pctAfter: 19 } },
  };
  const middle: ScopeChange = {
    ...newest,
    at: "2026-10-05T09:00:00Z",
    lines: {
      10: { before: 4000, after: 5000, pctBefore: 20, pctAfter: 20 },
      20: { before: 2500, after: 3000, pctBefore: 10, pctAfter: 10 },
    },
  };
  const first: ScopeChange = {
    ...newest,
    at: "2026-10-01T09:00:00Z",
    lines: {
      10: { before: 3000, after: 4000, pctBefore: 20, pctAfter: 20 },
      20: { before: 2000, after: 2500, pctBefore: 10, pctAfter: 10 },
    },
  };
  const r = summarise([newest, middle, first]);

  assert.ok(r?.lines[20], "the paid milestone is still reported");
  assert.equal(r?.lines[20]?.before, 2000, "from where it started");
  assert.equal(r?.lines[20]?.after, 3000, "to where it stopped");
  // Dated by the last change that actually touched it, not by the newest one.
  assert.equal(r?.lines[20]?.atAfter, "2026-10-05T09:00:00Z");

  // And the line that kept moving spans the whole history.
  assert.equal(r?.lines[10]?.before, 3000);
  assert.equal(r?.lines[10]?.after, 6000);
  assert.equal(r?.lines[10]?.atAfter, "2026-10-13T14:00:00Z");
});

test("a line that ends where it started is not reported as changed", () => {
  /*
   * PO-15489. An advance raised bill 5382 at $50,000.00, and the scope change
   * after it recorded every line on the schedule, moved or not — so 5382
   * appeared with $50,000.00 on both sides and read as a change that never
   * happened.
   */
  const advanceRaised: ScopeChange = {
    at: "2026-10-13T15:46:17Z",
    actor: "a@b.com",
    contractBefore: 184413.66,
    contractAfter: 170010.51,
    delta: -14403.15,
    lines: {
      5380: { before: 42206.83, after: 42206.83, pctBefore: 22.89, pctAfter: 22.89 },
      5381: { before: 92206.83, after: 77803.68, pctBefore: 50, pctAfter: 45.76 },
      5382: { before: 50000, after: 50000, pctBefore: 27.11, pctAfter: 27.11 },
    },
  };
  const r = summarise([advanceRaised]);
  assert.equal(r?.lines[5382], undefined, "never moved, so no before and after");
  assert.equal(r?.lines[5380], undefined, "paid and untouched, likewise");
  assert.ok(r?.lines[5381], "the one that actually moved is reported");
});

test("the schedule total is what it was, not the Was column added up", () => {
  /*
   * The same purchase order, all three changes. 5380 started at $75,000.00
   * and $50,000.00 of it was later carved onto 5382 by an advance — so adding
   * the lines' own before figures counts that money twice and gives
   * $200,000.00 against a contract that started at $150,000.00.
   */
  const first: ScopeChange = {
    at: "2026-10-13T15:29:18Z",
    actor: "a@b.com",
    contractBefore: 150000,
    contractAfter: 184413.66,
    delta: 34413.66,
    lines: {
      5380: { before: 75000, after: 92206.83, pctBefore: 50, pctAfter: 50 },
      5381: { before: 75000, after: 92206.83, pctBefore: 50, pctAfter: 50 },
    },
  };
  const advance: ScopeChange = {
    at: "2026-10-13T15:33:38Z",
    actor: "a@b.com",
    contractBefore: 184413.66,
    contractAfter: 184413.66,
    delta: 0,
    lines: { 5380: { before: 92206.83, after: 42206.83, pctBefore: 50, pctAfter: 22.89 } },
  };
  const reduction: ScopeChange = {
    at: "2026-10-13T15:46:17Z",
    actor: "a@b.com",
    contractBefore: 184413.66,
    contractAfter: 170010.51,
    delta: -14403.15,
    lines: {
      5380: { before: 42206.83, after: 42206.83, pctBefore: 22.89, pctAfter: 22.89 },
      5381: { before: 92206.83, after: 77803.68, pctBefore: 50, pctAfter: 45.76 },
      5382: { before: 50000, after: 50000, pctBefore: 27.11, pctAfter: 27.11 },
    },
  };

  const r = summarise([reduction, advance, first]);

  assert.equal(r?.scheduleBefore, 150000, "the two lines that existed then");
  assert.equal(r?.contractBefore, 150000, "and it agrees with the contract");
  // 5382 is gone from the column, so the $50,000.00 is no longer counted both
  // on its own line and inside 5380's original $75,000.00.
  assert.equal(r?.lines[5382], undefined);
  const column = Object.values(r?.lines ?? {}).reduce((sum, l) => sum + l.before, 0);
  assert.equal(column, 150000, "what is left of the column happens to agree here");
});

test("a line raised later is not counted in what the schedule was", () => {
  /*
   * Where the two readings come apart: a bill raised by an advance and then
   * moved by a later change belongs in the column, because it did change, but
   * not in what the schedule was worth before it existed.
   */
  const first: ScopeChange = {
    at: "2026-10-01T09:00:00Z",
    actor: "a@b.com",
    contractBefore: 10000,
    contractAfter: 12000,
    delta: 2000,
    lines: { 1: { before: 10000, after: 12000, pctBefore: 100, pctAfter: 100 } },
  };
  const later: ScopeChange = {
    at: "2026-10-20T09:00:00Z",
    actor: "a@b.com",
    contractBefore: 12000,
    contractAfter: 15000,
    delta: 3000,
    lines: {
      1: { before: 9000, after: 11000, pctBefore: 75, pctAfter: 73 },
      2: { before: 3000, after: 4000, pctBefore: 25, pctAfter: 27 },
    },
  };
  const r = summarise([later, first]);

  assert.equal(r?.scheduleBefore, 10000, "line 2 did not exist yet");
  const column = Object.values(r?.lines ?? {}).reduce((sum, l) => sum + l.before, 0);
  assert.equal(column, 13000, "the column includes it, and so overstates the schedule");
  assert.ok(r?.lines[2], "line 2 still reports its own change");
});
