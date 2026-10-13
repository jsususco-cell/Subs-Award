/**
 * Apply a scope change to a live purchase order.
 *
 *   node --conditions=react-server --import tsx scripts/apply-scope-change.mjs <poRecordId> <revisedTotal> --yes
 *
 * THIS WRITES. It updates the award cost item's Unit Cost, rewrites every
 * outstanding billing line item under it, raises a change order and records
 * the before-and-after in the System Log. There is no undo: re-applying the
 * original total puts the money back, but both change orders stand.
 *
 * Without --yes it prints the plan and stops.
 */
process.loadEnvFile(".env.local");

const { planScopeChange, applyScopeChange } = await import(
  "../src/lib/scope-change-server.ts"
);

const poRecordId = Number(process.argv[2]);
const revised = Number(process.argv[3]);
const go = process.argv.includes("--yes");
const actor =
  process.argv.find((a) => a.startsWith("--actor="))?.slice(8) || "scope-change-script";

if (!poRecordId || !Number.isFinite(revised)) {
  console.error(
    "usage: apply-scope-change.mjs <poRecordId> <revisedTotal> --yes [--actor=you@example.com]",
  );
  process.exit(1);
}

const m = (n) =>
  "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const plan = await planScopeChange(poRecordId, revised);
if (!plan) {
  console.error("No such purchase order, or it has no award cost item.");
  process.exit(1);
}
if (plan.absorption.problem) {
  console.error("REFUSED:", plan.absorption.problem);
  process.exit(1);
}

console.log(`${plan.schedule.poNumber}  ${plan.schedule.jobName}`);
console.log(
  `contract ${m(plan.contractBefore)} -> ${m(plan.contractAfter)}  (change of ${m(plan.delta)})`,
);
console.log(`cost item ${plan.schedule.costItemRecordId}  ·  ${plan.writes.length} milestone(s)\n`);
for (const w of plan.writes) {
  console.log(
    `  bill ${w.recordId}  ${w.desc.slice(0, 26).padEnd(28)} -> ${m(w.amount).padStart(13)}  @ ${(w.billPct * 100).toFixed(4)}%`,
  );
}
console.log("");

if (!go) {
  console.log("Nothing written. Pass --yes to apply.");
  process.exit(0);
}

const result = await applyScopeChange(poRecordId, revised, actor);
if (!result.ok) {
  console.error("FAILED:", result.error);
  process.exit(1);
}
console.log("APPLIED");
console.log(JSON.stringify(result.applied, null, 2));
