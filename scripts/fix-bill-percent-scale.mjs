/**
 * Correct bill lines whose Bill % was stored as a whole number.
 *
 *   node --import tsx scripts/fix-bill-percent-scale.mjs
 *   node --import tsx scripts/fix-bill-percent-scale.mjs --apply
 *   node --import tsx scripts/fix-bill-percent-scale.mjs --revert <file.json>
 *
 * Dry run unless --apply.
 *
 * Bill % (fid 48) is a Quickbase percent field: it holds the fraction and
 * displays it times a hundred. 0.5 reads as 50%. A row holding 50 reads as
 * 5000%, which is what the Billed Cost Items report showed.
 *
 * Who gets fixed
 * --------------
 * Only a row whose stored value is above 1 AND whose own title names the
 * percentage it should carry — "Pago Inicial (50%)", "Movilización (10%)".
 * The title is written by the same step that writes the percentage, so it is
 * an independent record of what was meant, and dividing by a hundred has to
 * land on it. Anything that does not agree is reported and left alone: a bill
 * at 1.5 might be a real 150% or a mis-scaled 1.5%, and nothing here can tell.
 *
 * What changes downstream
 * -----------------------
 * Cost Item "Total Bill %" sums this field and the purchase order averages
 * that, so both are currently inflated a hundredfold on the affected cases.
 * They come right. No amount moves — Bill Amount is a separate field and is
 * not sent.
 */
process.loadEnvFile(".env.local");

import { writeFileSync, readFileSync } from "node:fs";

const TABLE = "bum6mrfti";
const F = { recordId: 3, created: 1, title: 6, billPct: 48, amount: 49 };

const APPLY = process.argv.includes("--apply");
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
        fieldsToReturn: [F.recordId, F.billPct],
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`Write failed ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
    const errs = body.metadata?.lineErrors;
    if (errs && Object.keys(errs).length) {
      throw new Error(`Quickbase rejected rows: ${JSON.stringify(errs).slice(0, 400)}`);
    }
    written += body.metadata?.totalNumberOfRecordsProcessed ?? 0;
  }
  return written;
}

const val = (r, f) => r[f]?.value;
const num = (r, f) => Number(val(r, f)) || 0;

if (REVERT) {
  const saved = JSON.parse(readFileSync(REVERT, "utf8"));
  console.log(`reverting ${saved.rows.length} rows from ${REVERT}`);
  const data = saved.rows.map((r) => ({
    [F.recordId]: { value: r.recordId },
    [F.billPct]: { value: r.before },
  }));
  if (!APPLY) {
    console.log("Dry run. Add --apply to send the revert.");
    process.exit(0);
  }
  console.log("written:", await write(data));
  process.exit(0);
}

const rows = await queryAll(Object.values(F));
const suspect = rows.filter((r) => num(r, F.billPct) > 1);

const fix = [];
const leave = [];
for (const r of suspect) {
  const stored = num(r, F.billPct);
  // "Movilización (10%)" -> 10
  const m = String(val(r, F.title) ?? "").match(/\(([\d.]+)\s*%\)/);
  const meant = m ? Number(m[1]) : null;
  if (meant !== null && Math.abs(meant - stored) < 0.005) {
    fix.push({ r, stored, meant, next: Math.round((stored / 100) * 1e6) / 1e6 });
  } else {
    leave.push({ r, stored, meant });
  }
}

console.log(`bill lines: ${rows.length}`);
console.log(`storing a value above 1: ${suspect.length}`);
console.log(`  title agrees with the stored number, safe to rescale: ${fix.length}`);
console.log(`  title does not agree, left alone: ${leave.length}`);

if (fix.length) {
  console.log("\nto rescale:");
  for (const x of fix) {
    console.log(
      `  rid ${String(val(x.r, F.recordId)).padEnd(6)} ${String(val(x.r, F.created)).slice(0, 10)}` +
        ` ${String(val(x.r, F.title)).slice(0, 26).padEnd(28)} ${String(x.stored).padStart(6)} -> ${x.next}`,
    );
  }
}
for (const x of leave) {
  console.log(
    `  LEFT rid ${val(x.r, F.recordId)} "${val(x.r, F.title)}" stores ${x.stored}, title says ${x.meant ?? "nothing"}`,
  );
}

if (!fix.length) process.exit(0);

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to write.");
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = `bill-percent-scale.before-${stamp}.json`;
writeFileSync(
  file,
  JSON.stringify(
    {
      at: new Date().toISOString(),
      note: "Bill % (field 48) before rescaling a whole number to the fraction.",
      rows: fix.map((x) => ({ recordId: Number(val(x.r, F.recordId)), before: x.stored })),
    },
    null,
    2,
  ),
  "utf8",
);
console.log(`\nprevious values saved to ${file} — revert with --revert ${file} --apply`);

const written = await write(
  fix.map((x) => ({
    [F.recordId]: { value: Number(val(x.r, F.recordId)) },
    [F.billPct]: { value: x.next },
  })),
);
console.log(`written: ${written}`);

const after = await queryAll(Object.values(F));
console.log(`bill lines still storing a value above 1: ${after.filter((r) => num(r, F.billPct) > 1).length}`);
