/**
 * Read back what Quickbase actually stored for the rehearsal records.
 *
 * Read-only. The point is to compare stored values against what the app
 * believed it wrote — a write that returns 200 can still have stored the
 * wrong thing, which is how the bill-percentage bug survived so long.
 */
import { readFileSync } from "node:fs";
import { qb } from "./qb.mjs";

const ids = JSON.parse(readFileSync(".test-write-ids.json", "utf8"));

const POS = {
  table: "bukmrrvkz",
  f: {
    recordId: 3,
    poNumber: 17,
    relatedJob: 13,
    relatedSub: 21,
    jobName: 14,
    jobType: 172,
    jobState: 129,
    totalCost: 88,
    contractPrice: 318,
    catDemolition: 253,
    catSite: 254,
    catSeptic: 255,
    catHome: 256,
    house: 257,
    catAdaConversion: 258,
    catChangeOrder: 259,
    catRevisedTotal: 260,
    itemsNotIncluded: 261,
    totalAmount: 262,
    billingStatus: 224,
    totalAmountPaid: 225,
    totalPaidPct: 226,
  },
};
const COST_ITEMS = {
  table: "bukms5ah7",
  f: {
    recordId: 3,
    relatedPO: 114,
    title: 6,
    costType: 7,
    unitCost: 8,
    qty: 9,
    unit: 10,
    relatedSub: 98,
    relatedQbLineItem: 13,
  },
};

const v = (row, fid) => row[String(fid)]?.value;

async function read(table, fields, where) {
  const res = await qb("/records/query", {
    method: "POST",
    body: JSON.stringify({ from: table, select: Object.values(fields), where }),
  });
  return res.data ?? [];
}

console.log("PURCHASE ORDER\n" + "=".repeat(72));
for (const id of ids.pos) {
  const [row] = await read(POS.table, POS.f, `{3.EX.${id}}`);
  if (!row) {
    console.log(`  #${id} not found`);
    continue;
  }
  for (const [name, fid] of Object.entries(POS.f)) {
    const val = v(row, fid);
    const shown =
      val === "" || val === null || val === undefined
        ? "—"
        : JSON.stringify(val);
    console.log(`  ${name.padEnd(20)} fid ${String(fid).padEnd(4)} ${shown}`);
  }
}

console.log("\nCOST ITEMS\n" + "=".repeat(72));
for (const id of ids.costItems) {
  const [row] = await read(COST_ITEMS.table, COST_ITEMS.f, `{3.EX.${id}}`);
  if (!row) {
    console.log(`  #${id} not found`);
    continue;
  }
  const line = Object.entries(COST_ITEMS.f)
    .map(([name, fid]) => `${name}=${JSON.stringify(v(row, fid))}`)
    .join("  ");
  console.log(`  ${line}`);
}

/* Anything that should NOT have been created. */
console.log("\nSIDE EFFECTS THAT MUST NOT EXIST\n" + "=".repeat(72));
const bills = await qb("/records/query", {
  method: "POST",
  body: JSON.stringify({
    from: "bum6mrfti",
    select: [3, 96],
    where: `{96.EX.${ids.pos[0]}}`,
  }),
});
console.log(
  `  bill lines against this PO: ${(bills.data ?? []).length}  (mainland creates none)`,
);

const ins = await qb("/records/query", {
  method: "POST",
  body: JSON.stringify({
    from: "bwa4ktcq6",
    select: [3],
    where: `{22.EX.1885}`,
  }),
});
console.log(
  `  Fondo submittals for job 1885: ${(ins.data ?? []).length}  (Florida owes no poliza)`,
);
