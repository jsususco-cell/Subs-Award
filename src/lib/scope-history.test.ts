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
