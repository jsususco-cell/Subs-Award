/**
 * Preview what a revised contract would do to a purchase order's milestones.
 *
 *   node --conditions=react-server --import tsx scripts/plan-scope-change.mjs <poRecordId> <revisedTotal>
 *
 * Reads only. Nothing is written, here or anywhere this calls.
 */
process.loadEnvFile(".env.local");

const { planScopeChange } = await import("../src/lib/scope-change-server.ts");

const poRecordId = Number(process.argv[2]);
const revised = Number(process.argv[3]);
if (!poRecordId || !Number.isFinite(revised)) {
  console.error("usage: plan-scope-change.mjs <poRecordId> <revisedTotal>");
  process.exit(1);
}

const plan = await planScopeChange(poRecordId, revised);
if (!plan) {
  console.error("No such purchase order, or it has no cost item.");
  process.exit(1);
}

const { schedule: s, absorption: a, writes } = plan;
const m = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

console.log(`${s.poNumber}  job ${s.jobName} (${s.jobState})  cost item ${s.costItemRecordId}`);
console.log(`contract   ${m(plan.contractBefore)}  ->  ${m(plan.contractAfter)}      change of ${m(plan.delta)}`);
console.log(`schedule   ${m(a.previousTotal)} billed, of which ${m(a.lockedTotal)} is paid`);
if (plan.unbilled > 0.02) {
  console.log(`           ${m(plan.unbilled)} of the contract is not on the schedule yet — it carries across unchanged`);
}
console.log(`           ${a.outstandingPct}% of the schedule is still outstanding and can absorb the change\n`);

if (a.problem) {
  console.log("REFUSED:", a.problem);
  process.exit(0);
}

console.log("  milestone                          was         takes            now    bill %");
for (const l of a.lines) {
  console.log(
    "  " +
      l.desc.slice(0, 28).padEnd(30) +
      m(l.before).padStart(12) +
      (l.locked ? "(paid)" : m(l.took)).padStart(13) +
      m(l.amount).padStart(15) +
      `${l.restatedPct}%`.padStart(10),
  );
}

const after = Math.round(a.lines.reduce((x, l) => x + l.amount, 0) * 100) / 100;
console.log(`\n  revised schedule totals ${m(after)}`);
console.log(`  plus ${m(plan.unbilled)} not yet billed = ${m(Math.round((after + plan.unbilled) * 100) / 100)}, the revised contract`);
console.log(`  bills that would be rewritten: ${writes.length}`);
