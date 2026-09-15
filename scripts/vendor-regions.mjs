import { TABLES, qb } from "./qb.mjs";
import { REGIONS, REGION_KEYS } from "../src/lib/regions.ts";

/**
 * Who can actually be awarded work, region by region.
 *
 * Read-only. The award app filters subcontractors on two fields — Eligible for
 * Award (182) and Region (206) — and a region with nothing matching shows an
 * empty list rather than borrowing another region's vendors. This says which
 * regions are in that state, and which are only scraping by on vendors that
 * qualify through a shared Region value such as "Both".
 *
 *   npm run qb:vendor-regions
 */

const ELIGIBLE = 182;
const REGION = Number(process.env.QB_VENDOR_REGION_FID ?? 206);
const COMPANY = 23;

/** Below this, a region has a list but not a usable bench. */
const THIN = 3;

async function all(from, select) {
  const rows = [];
  let skip = 0;
  for (let page = 0; page < 50; page++) {
    const chunk = await qb("/records/query", {
      method: "POST",
      body: JSON.stringify({ from, select, options: { skip, top: 1000 } }),
    });
    rows.push(...chunk.data);
    skip += chunk.metadata.numRecords;
    if (!chunk.metadata.numRecords || rows.length >= chunk.metadata.totalRecords) {
      break;
    }
  }
  return rows;
}

const text = (rec, fid) => String(rec[String(fid)]?.value ?? "").trim();

const field = await qb(`/fields/${REGION}?tableId=${TABLES.vendors}`);
const choices = field.properties?.choices ?? [];
console.log(
  `Vendors table ${TABLES.vendors}, field ${REGION} "${field.label}" (${field.fieldType})`,
);
console.log(`  choices: ${choices.join(" | ") || "(none)"}\n`);

const vendors = await all(TABLES.vendors, [3, COMPANY, ELIGIBLE, REGION]);
const eligible = vendors.filter((v) => v[String(ELIGIBLE)]?.value === true);

console.log(`${vendors.length} vendors, ${eligible.length} marked award-eligible.\n`);

let blocked = 0;
let thin = 0;

for (const key of REGION_KEYS) {
  const region = REGIONS[key];
  const matching = eligible.filter((v) =>
    region.vendorRegions.includes(text(v, REGION)),
  );
  /*
   * The first accepted value is the region's own; the rest are shared buckets
   * such as "Both". A region whose whole bench is shared has nobody marked for
   * it specifically, which is worth saying out loud.
   */
  const own = matching.filter((v) => text(v, REGION) === region.vendorRegions[0]);

  const flag = !matching.length ? "NONE" : matching.length < THIN ? "THIN" : "ok  ";
  console.log(
    `  ${flag}  ${region.label.padEnd(15)} ${String(matching.length).padStart(3)} award-eligible ` +
      `(${own.length} marked "${region.vendorRegions[0]}", ` +
      `${matching.length - own.length} shared)`,
  );
  if (matching.length && matching.length < THIN) {
    for (const v of matching) {
      console.log(`          - ${text(v, COMPANY)} (Region: ${text(v, REGION)})`);
    }
  }

  if (!matching.length) blocked += 1;
  else if (matching.length < THIN) thin += 1;
}

if (blocked) {
  console.log(
    `\n${blocked} region${blocked === 1 ? "" : "s"} cannot award anyone yet. The award app\n` +
      `shows an empty subcontractor list for those and says why — it will not\n` +
      `offer another region's vendors instead.`,
  );
}

if (thin) {
  console.log(
    `\n${thin} region${thin === 1 ? " has" : "s have"} fewer than ${THIN} award-eligible vendors.\n` +
      `Awards are possible, but check the bench is deliberate before relying on it —\n` +
      `particularly where every vendor qualifies through a shared Region value\n` +
      `rather than being marked for that region specifically.`,
  );
}

if (blocked || thin) {
  const untagged = vendors.filter(
    (v) => text(v, REGION) === "Mainland" && v[String(ELIGIBLE)]?.value !== true,
  );
  console.log(
    `\nTo widen a bench, in Quickbase on the Subs/Vendors table:\n` +
      `  1. Tick "Eligible for Award" on the vendors that should be awardable.\n` +
      `  2. Set "${field.label}" on each of them.`,
  );
  if (untagged.length) {
    console.log(
      `\n${untagged.length} vendors are marked "Mainland" but are not award-eligible —\n` +
        `that is the pool to draw from. First 10:`,
    );
    for (const v of untagged.slice(0, 10)) {
      console.log(`  #${text(v, 3).padStart(4)}  ${text(v, COMPANY)}`);
    }
  }
  console.log(
    `\nNote "${field.label}" is one bucket for the whole mainland, so Florida, North\n` +
      `Carolina, Texas and Louisiana all match the same vendors. Splitting it by\n` +
      `state means adding those choices and re-tagging the records.`,
  );
} else {
  console.log("\nEvery region has a workable bench of award-eligible vendors.");
}
