import { writeFileSync } from "node:fs";
import { qb, TABLES } from "./qb.mjs";

/**
 * Re-derives Region for vendors the award app cannot see but that have an
 * address saying where they are.
 *
 * WHY. Region was first derived from work history, so a vendor with no
 * purchase orders or bills was set to "No work on file". The award app filters
 * on Region, so those vendors can never be awarded — and a subcontractor you
 * are about to award for the first time has no work history by definition.
 * 180 of them carry a plain mainland address and are invisible for no reason
 * but that.
 *
 * WHAT IT CHANGES. Only vendors whose Region is "No work on file" or blank AND
 * whose address state is set. A Region of Puerto Rico, Mainland or Both is
 * never touched: those were derived from real records and say more than an
 * address does.
 *
 * REVERSIBLE. Every previous value is written to a backup JSON before anything
 * changes, and the new Region Evidence quotes what it replaced.
 *
 *   node scripts/rederive-vendor-regions.mjs          # says what it would do
 *   node scripts/rederive-vendor-regions.mjs --apply  # does it
 *   node scripts/rederive-vendor-regions.mjs --undo <backup.json> --apply
 */

const F = { recordId: 3, company: 23, state: 10, country: 12, region: 206, evidence: 207 };
/** Regions that already make a vendor visible — never re-derived. */
const AWARDABLE = ["Puerto Rico", "Mainland", "Both"];

const apply = process.argv.includes("--apply");
const undoIdx = process.argv.indexOf("--undo");
const undoFile = undoIdx > -1 ? process.argv[undoIdx + 1] : null;

const txt = (row, fid) => String(row[String(fid)]?.value ?? "").trim();

async function writeRegions(records) {
  const res = await qb("/records", {
    method: "POST",
    body: JSON.stringify({ to: TABLES.vendors, data: records }),
  });
  if (res.metadata?.lineErrors) {
    console.log(`line errors: ${JSON.stringify(res.metadata.lineErrors).slice(0, 400)}`);
  }
  return res.metadata?.totalNumberOfRecordsProcessed ?? 0;
}

/* ------------------------------------------------------------------ undo */
if (undoFile) {
  const { readFileSync } = await import("node:fs");
  const backup = JSON.parse(readFileSync(undoFile, "utf8"));
  console.log(`restoring ${backup.length} vendor(s) from ${undoFile}`);
  if (!apply) {
    console.log("DRY RUN — re-run with --apply to restore.");
    process.exit(0);
  }
  const n = await writeRegions(
    backup.map((b) => ({
      [F.recordId]: { value: b.id },
      [F.region]: { value: b.region },
      [F.evidence]: { value: b.evidence },
    })),
  );
  console.log(`restored ${n} record(s)`);
  process.exit(0);
}

/* --------------------------------------------------------------- derive */
const res = await qb("/records/query", {
  method: "POST",
  body: JSON.stringify({
    from: TABLES.vendors,
    select: Object.values(F),
    sortBy: [{ fieldId: F.recordId, order: "ASC" }],
  }),
});

const rows = res.data ?? [];
const change = [];
const skipped = { alreadyAwardable: 0, noState: 0, foreign: 0 };

for (const row of rows) {
  const region = txt(row, F.region);
  if (AWARDABLE.includes(region)) {
    skipped.alreadyAwardable++;
    continue;
  }
  const state = txt(row, F.state);
  const country = txt(row, F.country);
  if (!state) {
    skipped.noState++;
    continue;
  }
  if (country && !/^(us|usa|united states)/i.test(country)) {
    skipped.foreign++;
    continue;
  }
  change.push({
    id: row[String(F.recordId)].value,
    company: txt(row, F.company),
    state,
    from: region || "(blank)",
    fromEvidence: txt(row, F.evidence),
    to: /puerto rico/i.test(state) ? "Puerto Rico" : "Mainland",
  });
}

const byTo = {};
for (const c of change) byTo[`${c.from} -> ${c.to}`] = (byTo[`${c.from} -> ${c.to}`] ?? 0) + 1;

console.log(`${rows.length} vendors examined\n`);
console.log(`would change ${change.length}:`);
for (const [k, n] of Object.entries(byTo).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${k}`);
}
console.log(`\nleft alone:`);
console.log(`  ${String(skipped.alreadyAwardable).padStart(4)}  already Puerto Rico / Mainland / Both`);
console.log(`  ${String(skipped.noState).padStart(4)}  no address state — cannot say where they are`);
console.log(`  ${String(skipped.foreign).padStart(4)}  address outside the US`);

console.log(`\nfirst 8 of the change:`);
for (const c of change.slice(0, 8)) {
  console.log(`  #${String(c.id).padEnd(5)} ${c.company.slice(0, 34).padEnd(35)} ${c.state.padEnd(16)} ${c.from} -> ${c.to}`);
}

if (!change.length) process.exit(0);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `vendor-region-backup-${stamp}.json`;

if (!apply) {
  console.log(`\nDRY RUN — nothing written. Re-run with --apply.`);
  console.log(`A backup would be written to ${backupPath} before any change.`);
  process.exit(0);
}

/* The backup lands BEFORE the write, so an interrupted run is still undoable. */
writeFileSync(
  backupPath,
  JSON.stringify(
    change.map((c) => ({ id: c.id, region: c.from === "(blank)" ? "" : c.from, evidence: c.fromEvidence })),
    null,
    2,
  ),
);
console.log(`\nbackup written: ${backupPath}`);

/* Quickbase caps a write; go in chunks so a large run does not bounce. */
let written = 0;
for (let i = 0; i < change.length; i += 100) {
  const chunk = change.slice(i, i + 100);
  written += await writeRegions(
    chunk.map((c) => ({
      [F.recordId]: { value: c.id },
      [F.region]: { value: c.to },
      [F.evidence]: {
        value: `re-derived from vendor address: ${c.state} (was ${c.from})`,
      },
    })),
  );
}
console.log(`wrote ${written} record(s)`);

const back = await qb("/records/query", {
  method: "POST",
  body: JSON.stringify({ from: TABLES.vendors, select: [F.recordId, F.region] }),
});
const dist = {};
for (const row of back.data ?? []) {
  const k = txt(row, F.region) || "(blank)";
  dist[k] = (dist[k] ?? 0) + 1;
}
console.log(`\nRegion distribution now:`);
for (const [k, n] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${k}`);
}
console.log(`\nundo: node scripts/rederive-vendor-regions.mjs --undo ${backupPath} --apply`);
