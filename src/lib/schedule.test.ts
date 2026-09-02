import assert from "node:assert/strict";
import { test } from "node:test";
import {
  JOB_TYPE_SCHEDULE,
  MOBILISATION_CAP,
  PAY_SCHEDULES,
  isUnmappedJobType,
  mobilisationOverage,
  scheduleAmounts,
  scheduleForJobType,
  scheduleLines,
  scheduleKeyForJobType,
} from "./schedule";

const CENT = 0.005;

test("every schedule totals exactly 100%", () => {
  for (const [key, schedule] of Object.entries(PAY_SCHEDULES)) {
    const total = schedule.reduce((s, m) => s + m.pct, 0);
    assert.equal(total, 100, `${key} totals ${total}%`);
  }
});

test("the 8-milestone schedule matches the award letter", () => {
  assert.deepEqual(
    PAY_SCHEDULES.standard8.map((m) => [m.desc, m.pct]),
    [
      ["Movilización", 10],
      ["Demolición", 15],
      ["Fundación", 10],
      ["Paredes", 10],
      ["Techo", 10],
      ["Empañetado", 20],
      ["Terminaciones", 15],
      ["Inspección Final", 10],
    ],
  );
});

test("job types map to the schedules the code page uses", () => {
  assert.equal(scheduleKeyForJobType("Reconstruction"), "standard8");
  assert.equal(scheduleKeyForJobType("New Construction"), "standard8");
  assert.equal(scheduleKeyForJobType("Repair"), "split5050");
  assert.equal(scheduleKeyForJobType("Renovation"), "split5050");
  assert.equal(scheduleKeyForJobType("Relocation"), "split2080");
  assert.equal(scheduleKeyForJobType("Demolition"), "split2080");
  assert.equal(scheduleKeyForJobType("Acquisition & Demolition"), "split2080");
});

test("unknown and blank job types fall back to the 8-milestone schedule", () => {
  assert.equal(scheduleKeyForJobType(""), "standard8");
  assert.equal(scheduleKeyForJobType("Rehabilitation"), "standard8");
  assert.equal(scheduleKeyForJobType("MHU"), "standard8");
  assert.equal(scheduleForJobType("nonsense").length, 8);
  // Whitespace should not change the mapping.
  assert.equal(scheduleKeyForJobType("  Repair  "), "split5050");
});

test("a fallback is flagged as a guess, a real mapping is not", () => {
  assert.ok(isUnmappedJobType("Rehabilitation"));
  assert.ok(isUnmappedJobType("Master Project"));
  assert.ok(!isUnmappedJobType("Reconstruction"));
  // Blank is handled separately by the UI, not treated as an unmapped type.
  assert.ok(!isUnmappedJobType(""));
});

test("amounts always add back up to the total exactly", () => {
  // 3 x 33.33 leaves a cent of drift that has to land somewhere.
  for (const amount of [178275.23, 100000, 0.03, 1, 122103.21, 999999.99]) {
    for (const schedule of Object.values(PAY_SCHEDULES)) {
      const amounts = scheduleAmounts(amount, schedule);
      const sum = amounts.reduce((s, a) => s + a, 0);
      assert.ok(
        Math.abs(sum - amount) < CENT,
        `${schedule.length} rows on ${amount}: sum ${sum}`,
      );
      assert.ok(amounts.every((a) => Number.isFinite(a)));
    }
  }
});

test("drift lands on the final line, matching the code page", () => {
  const amounts = scheduleAmounts(0.03, PAY_SCHEDULES.standard8);
  assert.equal(amounts.length, 8);
  assert.ok(Math.abs(amounts.reduce((s, a) => s + a, 0) - 0.03) < CENT);
});

test("the sample award splits the way the letter would show it", () => {
  const award = 178275.23;
  const eight = scheduleAmounts(award, PAY_SCHEDULES.standard8);
  assert.ok(Math.abs(eight[0] - 17827.52) < CENT); // Movilización 10%
  assert.ok(Math.abs(eight[1] - 26741.28) < CENT); // Demolición 15%
  assert.ok(Math.abs(eight[5] - 35655.05) < CENT); // Empañetado 20%

  const fifty = scheduleAmounts(award, PAY_SCHEDULES.split5050);
  assert.ok(Math.abs(fifty[0] - 89137.62) < CENT);
  assert.ok(Math.abs(fifty[0] + fifty[1] - award) < CENT);

  const twenty = scheduleAmounts(award, PAY_SCHEDULES.split2080);
  assert.ok(Math.abs(twenty[0] - 35655.05) < CENT);
  assert.ok(Math.abs(twenty[1] - 142620.18) < CENT);
});

test("an award of zero produces zeroes, not NaN", () => {
  const amounts = scheduleAmounts(0, PAY_SCHEDULES.standard8);
  assert.deepEqual(amounts, new Array(8).fill(0));
});

test("mobilisation overage is reported only when it breaches the cap", () => {
  const big = 178275.23; // 10% = 17,827.52
  const overBy = mobilisationOverage(
    PAY_SCHEDULES.standard8,
    scheduleAmounts(big, PAY_SCHEDULES.standard8),
  );
  assert.ok(Math.abs(overBy - (17827.52 - MOBILISATION_CAP)) < CENT);

  // At or under the cap there is nothing to report.
  const small = 100000; // 10% = 10,000 exactly
  assert.equal(
    mobilisationOverage(
      PAY_SCHEDULES.standard8,
      scheduleAmounts(small, PAY_SCHEDULES.standard8),
    ),
    0,
  );

  // The two-payment schedules have no mobilisation line at all.
  assert.equal(
    mobilisationOverage(
      PAY_SCHEDULES.split5050,
      scheduleAmounts(big, PAY_SCHEDULES.split5050),
    ),
    0,
  );
});

test("the job type map covers every type the code page mapped", () => {
  assert.deepEqual(Object.keys(JOB_TYPE_SCHEDULE).sort(), [
    "Acquisition & Demolition",
    "Demolition",
    "New Construction",
    "Reconstruction",
    "Relocation",
    "Renovation",
    "Repair",
  ]);
});

test("Movilización is capped at 10,000 and its share restated", () => {
  // The figure from the sample letter: 10,000 of 180,800 is 5.53%.
  const lines = scheduleLines(180800, PAY_SCHEDULES.standard8);
  assert.equal(lines[0].desc, "Movilización");
  assert.equal(lines[0].amount, MOBILISATION_CAP);
  assert.equal(lines[0].pct, 5.53, "the share must describe the capped amount");

  // The balance is spread over the rest, keeping their relative sizes.
  assert.ok(lines[5].amount > lines[1].amount, "Empañetado (20) still beats Demolición (15)");
  assert.ok(
    Math.abs(lines[1].amount / lines[2].amount - 15 / 10) < 0.001,
    "the 15:10 ratio between stages survives the redistribution",
  );
});

test("capping never changes what the subcontractor is owed in total", () => {
  for (const award of [180800, 178275.23, 100000.01, 250000, 1000000, 99999.99]) {
    const lines = scheduleLines(award, PAY_SCHEDULES.standard8);
    const sum = lines.reduce((s, l) => s + l.amount, 0);
    assert.ok(Math.abs(sum - award) < CENT, `${award} pays out ${sum}`);
    assert.ok(lines[0].amount <= MOBILISATION_CAP, "mobilisation never exceeds the cap");
  }
});

test("under the cap the schedule is left exactly as it was", () => {
  // 10% of 95,000 is 9,500, so nothing is capped and the round percentages stay.
  const lines = scheduleLines(95000, PAY_SCHEDULES.standard8);
  assert.deepEqual(
    lines.map((l) => l.pct),
    PAY_SCHEDULES.standard8.map((m) => m.pct),
  );
  assert.equal(lines[0].amount, 9500);

  // Exactly at the cap is not over it.
  const atCap = scheduleLines(100000, PAY_SCHEDULES.standard8);
  assert.equal(atCap[0].amount, MOBILISATION_CAP);
  assert.equal(atCap[0].pct, 10);
});

test("schedules with no mobilisation line are untouched by the cap", () => {
  for (const key of ["split5050", "split2080"] as const) {
    const lines = scheduleLines(500000, PAY_SCHEDULES[key]);
    assert.deepEqual(
      lines.map((l) => l.pct),
      PAY_SCHEDULES[key].map((m) => m.pct),
    );
    const sum = lines.reduce((s, l) => s + l.amount, 0);
    assert.ok(Math.abs(sum - 500000) < CENT);
  }
});

test("a mobilisation-only schedule keeps the whole award rather than stranding it", () => {
  // Nowhere to put the balance, so capping would lose it. It stays uncapped.
  const only = [{ n: 1, desc: "Movilización", pct: 100 }];
  const lines = scheduleLines(50000, only);
  assert.equal(lines[0].amount, 50000);
});

test("a zero award produces no NaN percentages", () => {
  const lines = scheduleLines(0, PAY_SCHEDULES.standard8);
  assert.ok(lines.every((l) => Number.isFinite(l.pct) && Number.isFinite(l.amount)));
  assert.ok(lines.every((l) => l.amount === 0));
});
