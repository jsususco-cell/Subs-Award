import { TABLES, qb } from "./qb.mjs";

/**
 * Read-only. Dumps the fields of the Jobs and Vendors tables so the ids this
 * app depends on can be confirmed rather than assumed — in particular the Job
 * Address field, which is not recorded anywhere yet.
 */

const INTERESTING = /address|street|region|state|company|trade|name|eligible|award/i;

for (const [label, tableId] of Object.entries(TABLES)) {
  const fields = await qb(`/fields?tableId=${tableId}`);
  console.log(`\n${"=".repeat(72)}`);
  console.log(`${label.toUpperCase()}  ${tableId}   (${fields.length} fields)`);
  console.log("=".repeat(72));

  const hits = fields.filter((f) => INTERESTING.test(f.label));
  console.log(`\n-- likely relevant (${hits.length}) --`);
  for (const f of hits.sort((a, b) => a.id - b.id)) {
    console.log(`  ${String(f.id).padStart(4)}  ${f.label.padEnd(42)} ${f.fieldType}`);
  }

  if (process.argv.includes("--all")) {
    console.log(`\n-- all fields --`);
    for (const f of fields.sort((a, b) => a.id - b.id)) {
      console.log(`  ${String(f.id).padStart(4)}  ${f.label.padEnd(42)} ${f.fieldType}`);
    }
  }
}

console.log(
  `\nSet the ids you need in .env.local, e.g.\n` +
    `  QB_JOB_ADDRESS_FID=<id of the Jobs address field>\n` +
    `  QB_VENDOR_REGION_FID=<id from npm run qb:add-vendor-region>\n` +
    `\nRe-run with --all to see every field.\n`,
);
