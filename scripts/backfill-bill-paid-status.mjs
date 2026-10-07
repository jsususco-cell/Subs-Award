/**
 * Set Status = "Paid" on bill lines the money already says are paid in full.
 *
 *   node --import tsx scripts/backfill-bill-paid-status.mjs            # dry run
 *   node --import tsx scripts/backfill-bill-paid-status.mjs --apply
 *   node --import tsx scripts/backfill-bill-paid-status.mjs --revert <file.json>
 *
 * Why this is needed
 * ------------------
 * Two workflows share the job of reflecting QuickBooks payments in Quickbase.
 * The one that writes Date Paid has been running all along; the one that writes
 * Status and Amount Paid had never executed. So the money landed and the label
 * did not, and 1,400-odd bills read as unpaid while being settled in full.
 *
 * What it writes
 * --------------
 * Field 14 (Status) and nothing else. Amount Paid and Date Paid are already
 * correct and are not sent. No figure moves.
 *
 * Who it touches
 * --------------
 * A row qualifies only when all four hold:
 *   - Bill Amount > 0
 *   - Date Paid is set          (QuickBooks recorded a payment)
 *   - Amount Paid == Bill Amount to the cent   (settled in full)
 *   - Status is not already "Paid"
 *
 * Anything part-paid is left alone, because field 14 has no "Partly paid" and
 * calling a part-payment "Paid" is how a subcontractor stops being chased for
 * the rest. At the time of writing there are none, but the rule is the rule.
 *
 * What changes downstream
 * -----------------------
 * Cost Item "Bill Status" and the purchase order's "Bill Status" are
 * COMBINED-TEXT summaries of this field, so they become accurate. The purchase
 * order's "Billing Line Item Status" is a formula over Total Paid Bill %, which
 * derives from Amount Paid — already correct, and untouched by this.
 *
 * Reversing it
 * ------------
 * Every run writes bill-paid-status.before-<timestamp>.json holding each row's
 * previous value. `--revert <that file>` puts them back exactly.
 */
process.loadEnvFile(".env.local");

import { writeFileSync, readFileSync } from "node:fs";

const TABLE = "bum6mrfti";
const F = { recordId: 3, title: 6, datePaid: 12, status: 14, amount: 49, paid: 143 };
const PAID = "Paid";

const APPLY = process.argv.includes("--apply");

/**
 * Rows held back for a person to confirm.
 *
 * 4899 "Elevator Lift" ($12,298.58) is the only qualifying row a human edited
 * after its payment date — Karl Reyes, 2026-10-02. The other 29 marked
 * "Unpaid" were last written by the service account, which is the automation
 * stamping Date Paid rather than anybody asserting the bill is unpaid. The
 * modified timestamp covers any field, so this may well be nothing; it is
 * cheap to leave one row out and ask.
 */
const HOLD_BACK = new Set([4899]);
const REVERT = process.argv.includes("--revert")
  ? process.argv[process.argv.indexOf("--revert") + 1]
  : null;

const headers = {
  "QB-Realm-Hostname": process.env.QB_REALM,
  Authorization: `QB-USER-TOKEN ${process.env.QB_USER_TOKEN}`,
  "Content-Type": "application/json",
};

async function queryAll(select) {
  const rows = [];
  let skip = 0;
  for (;;) {
    const res = await fetch("https://api.quickbase.com/v1/records/query", {
      method: "POST",
      headers,
      body: JSON.stringify({ from: TABLE, select, options: { top: 1000, skip } }),
    });
    const body = await res.json();
    if (!body.data) throw new Error(`Query failed: ${JSON.stringify(body).slice(0, 300)}`);
    rows.push(...body.data);
    skip += body.metadata.numRecords;
    if (!body.metadata.numRecords || rows.length >= body.metadata.totalRecords) break;
  }
  return rows;
}

async function write(data) {
  let written = 0;
  for (let i = 0; i < data.length; i += 100) {
    const chunk = data.slice(i, i + 100);
    const res = await fetch("https://api.quickbase.com/v1/records", {
      method: "POST",
      headers,
      body: JSON.stringify({
        to: TABLE,
        data: chunk,
        mergeFieldId: F.recordId,
        fieldsToReturn: [F.recordId, F.status],
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`Write failed ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
    // Quickbase answers 200 to a write it rejected. Without this a failed
    // backfill reads exactly like a clean one.
    const errs = body.metadata?.lineErrors;
    if (errs && Object.keys(errs).length) {
      throw new Error(`Quickbase rejected rows: ${JSON.stringify(errs).slice(0, 400)}`);
    }
    written += body.metadata?.totalNumberOfRecordsProcessed ?? 0;
    console.log(`  batch ${Math.floor(i / 100) + 1}: ${written} processed`);
  }
  return written;
}

const val = (r, f) => r[f]?.value;
const num = (r, f) => Number(val(r, f)) || 0;
const cents = (x) => Math.round(x * 100);
const money = (x) => "$" + x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// --- revert ------------------------------------------------------------------
if (REVERT) {
  const saved = JSON.parse(readFileSync(REVERT, "utf8"));
  console.log(`reverting ${saved.rows.length} rows from ${REVERT} (written ${saved.at})`);
  const data = saved.rows.map((r) => ({
    [F.recordId]: { value: r.recordId },
    [F.status]: { value: r.before ?? "" },
  }));
  if (!APPLY) {
    console.log("Dry run. Add --apply to send the revert.");
    process.exit(0);
  }
  console.log("written:", await write(data));
  process.exit(0);
}

// --- select ------------------------------------------------------------------
const rows = await queryAll(Object.values(F));
const qualify = rows.filter((r) => {
  const amount = num(r, F.amount);
  if (cents(amount) <= 0) return false;
  if (!val(r, F.datePaid)) return false;
  if (cents(num(r, F.paid)) !== cents(amount)) return false;
  if (HOLD_BACK.has(Number(val(r, F.recordId)))) return false;
  return String(val(r, F.status) ?? "").trim() !== PAID;
});

console.log(`bill lines: ${rows.length}`);
if (HOLD_BACK.size) console.log(`held back for human confirmation: ${[...HOLD_BACK].join(", ")}`);
console.log(`qualifying — paid in full, Status not "${PAID}": ${qualify.length}`);
console.log(`value: ${money(qualify.reduce((a, r) => a + num(r, F.amount), 0))}`);

const was = {};
for (const r of qualify) {
  const k = String(val(r, F.status) ?? "").trim() || "(blank)";
  was[k] = (was[k] || 0) + 1;
}
console.log("\nreplacing these current values:");
for (const [k, n] of Object.entries(was).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(5)}  ${k}  ->  ${PAID}`);
}

if (!qualify.length) {
  console.log("\nNothing to do.");
  process.exit(0);
}

console.log("\nsample:");
for (const r of qualify.slice(0, 5)) {
  console.log(
    `  rid ${String(val(r, F.recordId)).padEnd(6)} ${String(val(r, F.title)).slice(0, 30).padEnd(32)}` +
      ` bill ${String(num(r, F.amount)).padStart(10)}  paid ${String(num(r, F.paid)).padStart(10)}` +
      `  on ${String(val(r, F.datePaid)).slice(0, 10)}`,
  );
}

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to write.");
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const beforeFile = `bill-paid-status.before-${stamp}.json`;
writeFileSync(
  beforeFile,
  JSON.stringify(
    {
      at: new Date().toISOString(),
      note: "Previous Status (field 14) before the paid-status backfill.",
      rows: qualify.map((r) => ({
        recordId: Number(val(r, F.recordId)),
        before: String(val(r, F.status) ?? ""),
      })),
    },
    null,
    2,
  ),
  "utf8",
);
console.log(`\nprevious values saved to ${beforeFile} — revert with --revert ${beforeFile} --apply`);

const written = await write(
  qualify.map((r) => ({
    [F.recordId]: { value: Number(val(r, F.recordId)) },
    [F.status]: { value: PAID },
  })),
);
console.log(`\nwritten: ${written}`);

const after = await queryAll(Object.values(F));
const left = after.filter((r) => {
  const amount = num(r, F.amount);
  return (
    cents(amount) > 0 &&
    val(r, F.datePaid) &&
    cents(num(r, F.paid)) === cents(amount) &&
    String(val(r, F.status) ?? "").trim() !== PAID
  );
});
console.log(`still unmarked after the run: ${left.length}`);
const totalPaid = after.filter((r) => String(val(r, F.status) ?? "").trim() === PAID).length;
console.log(`bill lines now reading "${PAID}": ${totalPaid}`);
