import { qb, TABLES } from "./qb.mjs";

/**
 * Sets Region (fid 206) on a vendor that has none.
 *
 * A vendor with a blank Region matches no region's filter, so it is missing
 * from every subcontractor list in the award app — silently, which is how one
 * reached a user as "this company is not in the list".
 *
 * Dry run by default. Pass --apply to write.
 *   node scripts/set-vendor-region.mjs 7366 Mainland --apply
 */

const VENDORS = { recordId: 3, company: 23, region: 206 };
const VALID = ["Puerto Rico", "Mainland", "Both", "No work on file"];

const [idArg, regionArg] = process.argv.slice(2);
const apply = process.argv.includes("--apply");
const recordId = Number(idArg) || 0;

if (!recordId || !regionArg) {
  console.error(
    "usage: set-vendor-region.mjs <vendorRecordId> <region> [--apply]\n" +
      `  region is one of: ${VALID.join(", ")}`,
  );
  process.exit(1);
}
if (!VALID.includes(regionArg)) {
  console.error(`"${regionArg}" is not one of the field's choices: ${VALID.join(", ")}`);
  process.exit(1);
}

const before = await qb("/records/query", {
  method: "POST",
  body: JSON.stringify({
    from: TABLES.vendors,
    select: Object.values(VENDORS),
    where: `{${VENDORS.recordId}.EX.${recordId}}`,
  }),
});

const row = before.data?.[0];
if (!row) {
  console.error(`No vendor with record id ${recordId}.`);
  process.exit(1);
}

const company = row[String(VENDORS.company)]?.value ?? "";
const current = String(row[String(VENDORS.region)]?.value ?? "").trim();

console.log(`#${recordId}  ${company}`);
console.log(`  Region now: ${current || "(blank)"}`);
console.log(`  Region to:  ${regionArg}`);

/*
 * Only ever fills a blank. Changing a region that someone already chose is a
 * different decision from filling one nobody made, and this script is for the
 * second.
 */
if (current) {
  console.log(
    `\nAlready set to "${current}" — not overwritten. Change it in Quickbase if that is wrong.`,
  );
  process.exit(0);
}

if (!apply) {
  console.log("\nDRY RUN — re-run with --apply to write.");
  process.exit(0);
}

const res = await qb("/records", {
  method: "POST",
  body: JSON.stringify({
    to: TABLES.vendors,
    data: [
      {
        [VENDORS.recordId]: { value: recordId },
        [VENDORS.region]: { value: regionArg },
      },
    ],
  }),
});
console.log(`\nupdated ${res.metadata?.totalNumberOfRecordsProcessed ?? 0} record(s)`);

const after = await qb("/records/query", {
  method: "POST",
  body: JSON.stringify({
    from: TABLES.vendors,
    select: Object.values(VENDORS),
    where: `{${VENDORS.recordId}.EX.${recordId}}`,
  }),
});
console.log(
  `read back: Region = ${JSON.stringify(after.data?.[0]?.[String(VENDORS.region)]?.value)}`,
);
