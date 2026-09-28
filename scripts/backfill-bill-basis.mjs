/**
 * Fill Unit Cost, Quantity, Unit and Builder Cost on bill lines that have none.
 *
 *   node --conditions=react-server --import tsx scripts/backfill-bill-basis.mjs
 *   node --conditions=react-server --import tsx scripts/backfill-bill-basis.mjs --apply
 *
 * Dry run unless --apply is passed.
 *
 * Every bill line in this table written outside this app carries its parent
 * cost item's basis, and the app wrote none until 122842e. This fills in the
 * rows created before that.
 *
 * It writes those four fields and nothing else. Bill % and Bill Amount are
 * never sent, so no figure changes: this is the row explaining what its own
 * percentage is a percentage of, not a re-pricing. Nothing rolls these four
 * up — the Cost Item summarises only Bill Amount, Bill %, Status and Amount
 * Paid from its bills, and the purchase order's Total Builder Cost summarises
 * the cost items — so repeating one contract value across nine milestones
 * moves no total.
 *
 * Reversing it means clearing the same four fields; they were empty before.
 */
process.loadEnvFile(".env.local");

const { QB_AWARD, billBasisFields } = await import("../src/lib/qb-award.ts");

const APPLY = process.argv.includes("--apply");
const REALM = process.env.QB_REALM;
const TOKEN = process.env.QB_USER_TOKEN;
if (!TOKEN) {
  console.error("QB_USER_TOKEN is not set.");
  process.exit(1);
}

const headers = {
  "QB-Realm-Hostname": REALM,
  Authorization: `QB-USER-TOKEN ${TOKEN}`,
  "Content-Type": "application/json",
};

async function queryAll(from, select, where) {
  const rows = [];
  let skip = 0;
  for (;;) {
    const res = await fetch("https://api.quickbase.com/v1/records/query", {
      method: "POST",
      headers,
      body: JSON.stringify({ from, select, where, options: { top: 1000, skip } }),
    });
    const body = await res.json();
    if (!body.data) throw new Error(`Query failed: ${JSON.stringify(body).slice(0, 300)}`);
    rows.push(...body.data);
    skip += body.metadata.numRecords;
    if (!body.metadata.numRecords || rows.length >= body.metadata.totalRecords) break;
  }
  return rows;
}

const val = (r, f) => r[f]?.value;
const relId = (r, f) => Number(val(r, f)?.id ?? val(r, f)) || 0;

const B = QB_AWARD.billLines;
const C = QB_AWARD.costItems;

// Quantity empty is what marks a line as never having carried the basis.
const bills = await queryAll(
  QB_AWARD.tables.billLines,
  [B.recordId, B.title, B.qty, B.billPct, B.billAmount, B.relatedItem],
  `{${B.qty}.EX.''}`,
);
console.log(`bill lines missing the basis: ${bills.length}`);
if (!bills.length) process.exit(0);

const itemIds = [...new Set(bills.map((b) => relId(b, B.relatedItem)).filter(Boolean))];
const items = await queryAll(
  QB_AWARD.tables.costItems,
  [C.recordId, C.unitCost, C.qty, C.unit],
  itemIds.map((id) => `{${C.recordId}.EX.${id}}`).join("OR"),
);
const basisOf = new Map(
  items.map((i) => [
    Number(val(i, C.recordId)),
    {
      unitCost: Number(val(i, C.unitCost)) || 0,
      qty: Number(val(i, C.qty)) || 1,
      unit: String(val(i, C.unit) ?? ""),
    },
  ]),
);
console.log(`parent cost items: ${items.length} of ${itemIds.length} resolved`);

const updates = [];
const skipped = [];
for (const b of bills) {
  const parent = basisOf.get(relId(b, B.relatedItem));
  if (!parent) {
    skipped.push({ rid: val(b, B.recordId), why: "parent cost item not readable" });
    continue;
  }
  if (!(parent.unitCost > 0)) {
    // A zero basis would write Builder Cost 0 against a real Bill Amount,
    // which reads worse than the blank it replaces.
    skipped.push({ rid: val(b, B.recordId), why: "parent has no unit cost" });
    continue;
  }
  updates.push({
    [B.recordId]: { value: Number(val(b, B.recordId)) },
    ...billBasisFields(parent),
  });
}

console.log(`to write: ${updates.length}   skipped: ${skipped.length}`);
for (const s of skipped.slice(0, 10)) console.log("  skipped", JSON.stringify(s));

if (!APPLY) {
  console.log("\nDry run. Sample of what would be written:");
  for (const u of updates.slice(0, 3)) console.log(" ", JSON.stringify(u));
  console.log("\nRe-run with --apply to write.");
  process.exit(0);
}

let written = 0;
for (let i = 0; i < updates.length; i += 100) {
  const chunk = updates.slice(i, i + 100);
  const res = await fetch("https://api.quickbase.com/v1/records", {
    method: "POST",
    headers,
    body: JSON.stringify({
      to: QB_AWARD.tables.billLines,
      data: chunk,
      fieldsToReturn: [B.recordId],
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Write failed ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);

  // Quickbase answers 200 even when it rejected rows. Without this a failed
  // write reads exactly like a successful one.
  const errs = body.metadata?.lineErrors;
  if (errs && Object.keys(errs).length) {
    throw new Error(`Quickbase rejected rows: ${JSON.stringify(errs).slice(0, 400)}`);
  }
  const n = body.metadata?.totalNumberOfRecordsProcessed ?? 0;
  written += n;
  console.log(`  batch ${i / 100 + 1}: ${n} processed`);
}
console.log(`\nwritten: ${written}`);

const left = await queryAll(
  QB_AWARD.tables.billLines,
  [B.recordId],
  `{${B.qty}.EX.''}`,
);
console.log(`bill lines still missing the basis: ${left.length}`);
