import { REALM, TOKEN, qb } from "./qb.mjs";

/**
 * Backfill "Total Contract Price" (fid 318) on mainland purchase orders.
 *
 * The field was added on 2026-09-16, so every purchase order raised before it
 * carries nothing. Without it the bill screen cannot work out how much of a
 * contract is still to break down, and says so rather than guessing.
 *
 * The figure copied is Total Cost (88) — a Quickbase rollup of the PO's cost
 * items. For a purchase order raised before this app, the cost items ARE the
 * whole contract: partial breakdowns are a new idea. So the contract price and
 * the rollup are the same number, and after the backfill those POs correctly
 * show a balance of zero — nothing left to break down, which is true.
 *
 * Only mainland POs are touched. Puerto Rico prices an award through the Award
 * Breakdown categories and has no use for this field.
 *
 * Dry run by default. Pass --apply to write.
 */

const POS = process.env.QB_POS_TABLE ?? "bukmrrvkz";
const F = {
  recordId: 3,
  poNumber: 17,
  poStatus: 15,
  totalCost: 88,
  jobState: 129,
  totalAmount: 262,
  contractPrice: 318,
};

/** Job - State values that count as mainland. */
const MAINLAND = ["Florida", "North Carolina", "Texas", "Louisiana"];

const apply = process.argv.includes("--apply");
const BATCH = 100;

/**
 * --limit=N writes only the first N. Used to prove the write shape against a
 * few real records before turning it loose on thousands.
 */
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) || 0 : 0;

const adminToken = process.env.QB_ADMIN_TOKEN ?? "";
const token = adminToken || TOKEN;

const num = (r, f) => Number(r[String(f)]?.value) || 0;
const str = (r, f) => String(r[String(f)]?.value ?? "").trim();
const money = (n) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function api(path, init = {}) {
  const res = await fetch(`https://api.quickbase.com/v1${path}`, {
    ...init,
    headers: {
      "QB-Realm-Hostname": REALM,
      Authorization: `QB-USER-TOKEN ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Quickbase ${res.status} ${path}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function allPos() {
  const rows = [];
  let skip = 0;
  for (let page = 0; page < 60; page++) {
    const r = await qb("/records/query", {
      method: "POST",
      body: JSON.stringify({
        from: POS,
        select: Object.values(F),
        options: { skip, top: 1000 },
      }),
    });
    rows.push(...r.data);
    skip += r.metadata.numRecords;
    if (!r.metadata.numRecords || rows.length >= r.metadata.totalRecords) break;
  }
  return rows;
}

const rows = await allPos();
const mainland = rows.filter((r) => MAINLAND.includes(str(r, F.jobState)));

const todo = [];
const skipped = { alreadySet: 0, noCost: 0, hasCategories: 0 };

for (const r of mainland) {
  if (num(r, F.contractPrice) > 0) {
    skipped.alreadySet++;
    continue;
  }
  if (num(r, F.totalCost) <= 0) {
    skipped.noCost++;
    continue;
  }
  /*
   * A mainland PO priced through the Puerto Rico Award Breakdown would have
   * two competing totals. None exist today; if one ever does, it is left alone
   * for a person to look at rather than being given a third figure.
   */
  if (num(r, F.totalAmount) > 0) {
    skipped.hasCategories++;
    continue;
  }
  todo.push({
    recordId: num(r, F.recordId),
    poNumber: str(r, F.poNumber),
    state: str(r, F.jobState),
    amount: num(r, F.totalCost),
  });
}

const total = todo.reduce((s, t) => s + t.amount, 0);

console.log(`${rows.length} purchase orders, ${mainland.length} of them mainland.\n`);
console.log(`  to set   : ${String(todo.length).padStart(5)}   ${money(total)}`);
console.log(`  skipped  :`);
console.log(`     ${String(skipped.alreadySet).padStart(5)}  already have a contract price`);
console.log(`     ${String(skipped.noCost).padStart(5)}  have no cost items, so nothing to copy`);
console.log(`     ${String(skipped.hasCategories).padStart(5)}  also priced by category — left for a person`);

if (todo.length) {
  console.log(`\n  first few:`);
  for (const t of todo.slice(0, 5)) {
    console.log(`     ${t.poNumber.padEnd(9)} ${t.state.padEnd(15)} ${money(t.amount).padStart(14)}`);
  }
  console.log(`     … and ${todo.length - 5} more`);
}

if (!apply) {
  console.log(
    `\nDry run — nothing has been written.\n` +
      `Each of the ${todo.length} gets Total Contract Price set to its own Total Cost.\n` +
      `Re-run with --apply to write.\n`,
  );
  process.exit(0);
}

console.log(`\nwriting in batches of ${BATCH}…`);
const work = LIMIT > 0 ? todo.slice(0, LIMIT) : todo;
let written = 0;
for (let i = 0; i < work.length; i += BATCH) {
  const batch = work.slice(i, i + BATCH);
  const res = await api("/records", {
    method: "POST",
    body: JSON.stringify({
      to: POS,
      // Record ID# keys the update; only field 318 is sent, so nothing else
      // on the purchase order can be disturbed.
      data: batch.map((t) => ({
        [F.recordId]: { value: t.recordId },
        [F.contractPrice]: { value: t.amount },
      })),
      fieldsToReturn: [F.recordId],
    }),
  });
  const n = res?.metadata?.updatedRecordIds?.length ?? 0;
  written += n;
  const errs = res?.metadata?.lineErrors;
  if (errs && Object.keys(errs).length) {
    console.log(`  batch ${i / BATCH + 1}: ${JSON.stringify(errs).slice(0, 200)}`);
  }
  console.log(`  ${String(written).padStart(5)} / ${work.length}`);
}

/* Read it back rather than trusting the write count. */
const after = await allPos();
const stillMissing = after.filter(
  (r) =>
    MAINLAND.includes(str(r, F.jobState)) &&
    num(r, F.contractPrice) <= 0 &&
    num(r, F.totalCost) > 0 &&
    num(r, F.totalAmount) <= 0,
);
const set = after.filter(
  (r) => MAINLAND.includes(str(r, F.jobState)) && num(r, F.contractPrice) > 0,
);
const mismatched = set.filter(
  (r) => Math.abs(num(r, F.contractPrice) - num(r, F.totalCost)) > 0.005,
);

console.log(`\nverified by re-reading:`);
console.log(`  ${set.length} mainland POs now carry a contract price`);
console.log(`  ${stillMissing.length} still missing one (expect 0)`);
console.log(`  ${mismatched.length} where it disagrees with Total Cost (expect 0)`);
