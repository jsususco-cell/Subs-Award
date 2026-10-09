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
console.log(`contract on the cost item: ${m(s.contract)}    billed across milestones: ${m(a.previousTotal)}`);
if (Math.abs(s.contract - a.previousTotal) > 0.02) {
  console.log(`  ! only ${m(a.previousTotal)} of the contract is billed — ${m(s.contract - a.previousTotal)} is not on the schedule yet`);
}
console.log(`already paid: ${m(a.lockedTotal)}    still outstanding: ${a.outstandingPct}% of the schedule`);
console.log(`revised to ${m(a.newTotal)}  =>  change of ${m(a.delta)}\n`);

if (a.problem) {
  console.log("REFUSED:", a.problem);
  process.exit(0);
}

console.log("  milestone                          was         takes            now    bill %");
for (const l of a.lines) {
  console.log(
    "  " + l.desc.slice(0, 28).padEnd(30) +
      m(l.before).padStart(12) +
      (l.locked ? "(paid)" : m(l.took)).padStart(13) +
      m(l.amount).padStart(15) +
      `${l.restatedPct}%`.padStart(10),
  );
}
console.log(`\n  revised schedule totals ${m(a.lines.reduce((x, l) => x + l.amount, 0))}`);
console.log(`  bills that would be rewritten: ${writes.length}`);
