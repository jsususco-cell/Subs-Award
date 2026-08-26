import { TABLES, qb } from "./qb.mjs";

/**
 * Adds a Region field to the Subs/Vendors table so the subcontractor list can
 * be filtered by region the same way jobs are.
 *
 * Dry run by default — it only reports what it would do. Pass --create to
 * actually add the field, because this changes a live Quickbase app.
 */

const LABEL = process.env.QB_VENDOR_REGION_LABEL ?? "Region";
const CHOICES = ["Puerto Rico", "Florida", "Texas", "North Carolina", "Louisiana"];
const create = process.argv.includes("--create");

const fields = await qb(`/fields?tableId=${TABLES.vendors}`);
const existing = fields.find(
  (f) => f.label.trim().toLowerCase() === LABEL.toLowerCase(),
);

if (existing) {
  console.log(
    `"${LABEL}" already exists on ${TABLES.vendors} as field ${existing.id} (${existing.fieldType}).`,
  );
  report(existing.id);
  process.exit(0);
}

if (!create) {
  console.log(
    `Dry run. Would create a "${LABEL}" field on the Vendors table ${TABLES.vendors}\n` +
      `  type    : text-multiple-choice\n` +
      `  choices : ${CHOICES.join(", ")}\n\n` +
      `Re-run with --create to make the change.\n`,
  );
  process.exit(0);
}

const created = await qb(`/fields?tableId=${TABLES.vendors}`, {
  method: "POST",
  body: JSON.stringify({
    label: LABEL,
    fieldType: "text-multiple-choice",
    properties: { choices: CHOICES },
  }),
});

console.log(`Created "${LABEL}" as field ${created.id} on ${TABLES.vendors}.`);
report(created.id);

function report(id) {
  console.log(
    `\nNext:\n` +
      `  1. Populate ${LABEL} on the vendor records. An empty field means the\n` +
      `     region filter matches nothing, so the subcontractor list would come\n` +
      `     back empty.\n` +
      `  2. Then set in .env.local and in Vercel:\n` +
      `       QB_VENDOR_REGION_FID=${id}\n` +
      `\n  Until step 2, the app shows all award-eligible vendors and says so.\n`,
  );
}
