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

test("Now becomes Was: the headline is the last step, not the whole span", () => {
  /*
   * $150,000.00 -> $184,413.66 -> $170,010.51 reads as the last of those,
   * and the next revision will make $170,010.51 the Was. Where it started is
   * in the history, which the screen opens on demand.
   */
  const r = summarise([
    change(184413.66, 170010.51, "2026-10-13T15:46:00Z"),
    change(150000, 184413.66, "2026-10-13T15:29:00Z"),
  ]);
  assert.equal(r?.contractBefore, 184413.66);
  assert.equal(r?.contractAfter, 170010.51);
  assert.equal(r?.delta, -14403.15);
});

test("a milestone reads the same step the contract does", () => {
  // Both describing one event is what keeps a line and the purchase order
  // above it from answering different questions under the same headings.
  const r = summarise([
    change(184413.66, 170010.51, "2026-10-13T15:46:00Z"),
    change(150000, 184413.66, "2026-10-13T15:29:00Z"),
  ]);
  assert.equal(r?.lines[4321]?.before, 184413.66);
  assert.equal(r?.lines[4321]?.after, 170010.51);
});

test("each figure is dated by the change that set it", () => {
  const r = summarise([
    change(184413.66, 170010.51, "2026-10-13T15:46:00Z"),
    change(150000, 184413.66, "2026-10-13T15:29:00Z"),
  ]);
  assert.equal(r?.atBefore, "2026-10-13T15:29:00Z", "the revision before this one");
  assert.equal(r?.lines[4321]?.atBefore, "2026-10-13T15:29:00Z");
  assert.equal(r?.lines[4321]?.atAfter, "2026-10-13T15:46:00Z");
});

test("a first revision leaves the Was date to the record itself", () => {
  // Nothing earlier set it, so the figure has stood since the purchase order
  // was raised and only Quickbase knows that day. Null rather than a guess.
  const r = summarise([change(20000, 25000, "2026-10-13T14:00:00Z")]);
  assert.equal(r?.atBefore, null);
  assert.equal(r?.lines[4321]?.atBefore, null);
});

test("lines the change left alone are not reported as having moved", () => {
  /*
   * PO-15489. A change records every line on the schedule, so bill 5382 —
   * raised by an advance at $50,000.00 and untouched since — appeared with
   * $50,000.00 on both sides, and the paid 5380 likewise.
   */
  const r = summarise([
    {
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
    },
  ]);
  assert.equal(r?.lines[5380], undefined, "paid and untouched");
  assert.equal(r?.lines[5382], undefined, "raised by an advance, never moved since");
  assert.ok(r?.lines[5381], "the one that actually moved");
});

test("the schedule total counts the lines the Was column leaves out", () => {
  /*
   * Same purchase order. The Was column shows only 5381, because it is the
   * only line that moved — but the schedule it was part of was worth
   * $184,413.66, which is the contract immediately before this change.
   * Adding the column up would report $92,206.83.
   */
  const r = summarise([
    {
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
    },
  ]);
  assert.equal(r?.scheduleBefore, 184413.66);
  assert.equal(r?.scheduleBefore, r?.contractBefore, "and so agrees with the row above");

  const column = Object.values(r?.lines ?? {}).reduce((sum, l) => sum + l.before, 0);
  assert.equal(column, 92206.83, "which the column alone does not give");
});

test("an advance moves money without moving the contract", () => {
  // Both sides the same, so the purchase order row stays blank and the
  // milestones underneath carry what happened.
  const r = summarise([
    {
      at: "2026-10-13T15:33:38Z",
      actor: "a@b.com",
      contractBefore: 184413.66,
      contractAfter: 184413.66,
      delta: 0,
      lines: { 5380: { before: 92206.83, after: 42206.83, pctBefore: 50, pctAfter: 22.89 } },
    },
  ]);
  assert.equal(r?.contractBefore, r?.contractAfter);
  assert.equal(r?.lines[5380]?.before, 92206.83);
  assert.equal(r?.lines[5380]?.after, 42206.83);
});

test("a reduction keeps its sign", () => {
  const r = summarise([change(31000, 24000, "2026-10-13T14:00:00Z")]);
  assert.equal(r?.delta, -7000);
});
