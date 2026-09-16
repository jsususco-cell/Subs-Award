import { qb, TABLES } from "./qb.mjs";

/**
 * Fills a blank Region on the Subs/Vendors table from the vendor's own address.
 *
 * The same rule the n8n workflow "Byrdson — Vendor Region Auto-Assign" runs on
 * a schedule; this is how to see what it would do, and how to run it by hand.
 *
 *   node scripts/assign-vendor-regions.mjs            # says what it would do
 *   node scripts/assign-vendor-regions.mjs --apply    # does it
 *
 * Only ever fills a blank. A Region somebody already chose — including
 * "No work on file" — is left exactly as it is: a wrong value that looks
 * deliberate is worse than a blank that is visibly missing.
 */

const F = { recordId: 3, company: 23, state: 10, city: 9, country: 12, region: 206, evidence: 207 };
const apply = process.argv.includes("--apply");

const txt = (row, fid) => String(row[String(fid)]?.value ?? "").trim();

const res = await qb("/records/query", {
  method: "POST",
  body: JSON.stringify({
    from: TABLES.vendors,
    select: Object.values(F),
    where: `{${F.region}.EX.''}`,
    sortBy: [{ fieldId: F.recordId, order: "ASC" }],
  }),
});

const rows = res.data ?? [];
const assigned = [];
const stuck = [];

for (const row of rows) {
  const id = row[String(F.recordId)].value;
  const company = txt(row, F.company);
  const state = txt(row, F.state);
  const country = txt(row, F.country);

  /* Somewhere outside the US: "Mainland" would say nothing true about it. */
  const foreign = country && !/^(us|usa|united states)/i.test(country);

  if (!state) {
    stuck.push({ id, company, why: "no address state on the record" });
  } else if (foreign) {
    stuck.push({ id, company, why: `address is in ${country}` });
  } else {
    assigned.push({
      id,
      company,
      state,
      region: /puerto rico/i.test(state) ? "Puerto Rico" : "Mainland",
    });
  }
}

console.log(`${rows.length} vendor(s) with a blank Region\n`);

if (assigned.length) {
  console.log(`would assign ${assigned.length}:`);
  for (const a of assigned) {
    console.log(`  #${String(a.id).padEnd(5)} ${a.company.slice(0, 36).padEnd(37)} ${a.state.padEnd(16)} -> ${a.region}`);
  }
}
if (stuck.length) {
  console.log(`\nneeds a person (${stuck.length}):`);
  for (const s of stuck) {
    console.log(`  #${String(s.id).padEnd(5)} ${s.company.slice(0, 36).padEnd(37)} ${s.why}`);
  }
}

if (!assigned.length) process.exit(0);

if (!apply) {
  console.log(`\nDRY RUN — re-run with --apply to write.`);
  process.exit(0);
}

const write = await qb("/records", {
  method: "POST",
  body: JSON.stringify({
    to: TABLES.vendors,
    data: assigned.map((a) => ({
      [F.recordId]: { value: a.id },
      [F.region]: { value: a.region },
      [F.evidence]: { value: `auto-assigned from vendor address: ${a.state}` },
    })),
  }),
});

console.log(`\nwrote ${write.metadata?.totalNumberOfRecordsProcessed ?? 0} record(s)`);
if (write.metadata?.lineErrors) {
  console.log(`line errors: ${JSON.stringify(write.metadata.lineErrors)}`);
}

/* Read back, because a 200 is not the same as the value being there. */
const back = await qb("/records/query", {
  method: "POST",
  body: JSON.stringify({
    from: TABLES.vendors,
    select: [F.recordId, F.company, F.region, F.evidence],
    where: assigned.map((a) => `{${F.recordId}.EX.${a.id}}`).join("OR"),
  }),
});
console.log("\nread back:");
for (const row of back.data ?? []) {
  console.log(
    `  #${row["3"].value}  ${txt(row, F.company).slice(0, 34).padEnd(35)} ` +
      `Region=${txt(row, F.region).padEnd(13)} ${txt(row, F.evidence)}`,
  );
}
