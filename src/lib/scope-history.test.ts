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

test("the milestone figures come from the most recent change", () => {
  // The older change's lines describe a schedule that has since moved on, so
  // pairing them with today's milestones would compare different things.
  const r = summarise([
    change(25000, 31000, "2026-10-13T14:00:00Z"),
    change(20000, 25000, "2026-10-01T09:00:00Z"),
  ]);
  assert.equal(r?.lines[4321]?.before, 25000);
  assert.equal(r?.at, "2026-10-13T14:00:00Z");
});

test("a reduction keeps its sign", () => {
  const r = summarise([change(31000, 24000, "2026-10-13T14:00:00Z")]);
  assert.equal(r?.delta, -7000);
});

test("each line's previous figure is dated by the change that set it", () => {
  /*
   * Two changes, both touching milestone 4321. Its "before" in the newest
   * entry is what the older entry left behind, so that older entry's date is
   * when the figure started being true.
   */
  const r = summarise([
    change(25000, 31000, "2026-10-13T14:00:00Z"),
    change(20000, 25000, "2026-10-01T09:00:00Z"),
  ]);
  assert.equal(r?.lines[4321]?.atBefore, "2026-10-01T09:00:00Z");
});

test("a first change leaves the previous date to the record itself", () => {
  // Nothing earlier set it, so the figure has stood since the line was raised
  // and only Quickbase knows that date. Null rather than a guess.
  const r = summarise([change(20000, 25000, "2026-10-13T14:00:00Z")]);
  assert.equal(r?.lines[4321]?.atBefore, null);
});

test("lines touched at different times are dated differently", () => {
  const newest: ScopeChange = {
    at: "2026-10-13T14:00:00Z",
    actor: "a@b.com",
    contractBefore: 25000,
    contractAfter: 31000,
    delta: 6000,
    lines: {
      10: { before: 1, after: 2, pctBefore: 1, pctAfter: 2 },
      20: { before: 3, after: 4, pctBefore: 3, pctAfter: 4 },
    },
  };
  const middle: ScopeChange = {
    ...newest,
    at: "2026-10-05T09:00:00Z",
    lines: { 20: { before: 2, after: 3, pctBefore: 2, pctAfter: 3 } },
  };
  const r = summarise([newest, middle, { ...middle, at: "2026-10-01T09:00:00Z" }]);
  assert.equal(r?.lines[10]?.atBefore, null, "never touched before");
  assert.equal(r?.lines[20]?.atBefore, "2026-10-05T09:00:00Z", "the nearer of the two");
});
