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
