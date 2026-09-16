/**
 * Delete the records the write-path rehearsal created.
 *
 * Children before parents, and every delete is by explicit record id read
 * from .test-write-ids.json — never by a query, so a bad where clause cannot
 * take real purchase orders with it.
 *
 *   node scripts/test-write-cleanup.mjs           # says what it would delete
 *   node scripts/test-write-cleanup.mjs --apply   # deletes
 */
import { readFileSync, unlinkSync } from "node:fs";
import { qb } from "./qb.mjs";

const APPLY = process.argv.includes("--apply");
const ids = JSON.parse(readFileSync(".test-write-ids.json", "utf8"));

const TABLES = [
  ["bum6mrfti", "bill lines", ids.billLines ?? []],
  ["bukms5ah7", "cost items", ids.costItems ?? []],
  ["bukmrrvkz", "purchase orders", ids.pos ?? []],
];

for (const [table, label, recordIds] of TABLES) {
  if (!recordIds.length) {
    console.log(`${label}: none`);
    continue;
  }
  const where = recordIds.map((id) => `{3.EX.${id}}`).join("OR");
  if (!APPLY) {
    console.log(`${label}: would delete ${recordIds.join(", ")}`);
    continue;
  }
  const res = await qb("/records", {
    method: "DELETE",
    body: JSON.stringify({ from: table, where }),
  });
  console.log(
    `${label}: deleted ${res.numberDeleted} (asked for ${recordIds.length})`,
  );
}

if (APPLY) {
  unlinkSync(".test-write-ids.json");
  console.log("\n.test-write-ids.json removed");
}
