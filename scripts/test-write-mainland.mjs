/**
 * Rehearse the mainland write path end to end against a throwaway job.
 *
 * Creates real Quickbase records. It goes through the running dev server so
 * the API routes are what is under test, not a re-implementation of them.
 * `scripts/test-write-cleanup.mjs` deletes whatever this creates; the ids are
 * written to .test-write-ids.json for it.
 *
 *   node scripts/test-write-mainland.mjs --apply
 *
 * Refuses without --apply, the same as the other writing scripts here: this
 * creates live purchase orders, and a stray run of it should do nothing.
 *
 * The send key is read from .env.local and only ever sent as a header.
 */
import { writeFileSync } from "node:fs";
import { loadEnv } from "./qb.mjs";

loadEnv();

if (!process.argv.includes("--apply")) {
  console.error(
    [
      "This creates real Quickbase records (a purchase order and its cost items).",
      "Re-run with --apply if that is what you want, and clean up afterwards with",
      "  node scripts/test-write-cleanup.mjs --apply",
    ].join("\n"),
  );
  process.exit(1);
}

const BASE = process.env.TEST_BASE ?? "http://localhost:3040";
const KEY = process.env.LETTER_SEND_KEY ?? "";

/** A Florida job and a subcontractor that are both obviously test data. */
const JOB = {
  recordId: 1885,
  name: "FL-123 Test St.-Elevate Florida",
  type: "Home Elevation",
};
const SUB = { recordId: 6895, name: "Testing of documents" };

const CONTRACT = 1000;

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(KEY ? { "x-send-key": KEY } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

function show(label, r) {
  console.log(`\n${label}  →  HTTP ${r.status}`);
  console.log(JSON.stringify(r.body, null, 2));
}

const ids = { pos: [], costItems: [], billLines: [] };

/* ---------------------------------------------------------- 1. create */
const award = {
  region: "FL",
  jobRecordId: JOB.recordId,
  subRecordId: SUB.recordId,
  title: JOB.name,
  scope: "Write-path rehearsal — delete me",
  jobType: JOB.type,
  poStatus: "Unreleased",
  expenseClass: "PO",
  lienWaiver: true,
  caseNumber: JOB.name,
  subcontractorName: SUB.name,
  contractPrice: CONTRACT,
  // Deliberately partial: $700 of $1,000, so the top-up path has work to do.
  breakdown: [
    { desc: "Test 1 — mobilisation", pct: 50, amount: 500 },
    { desc: "Test 2 — rough-in", pct: 20, amount: 200 },
  ],
};

const created = await post("/api/qb/award", award);
show("1. create PO + cost items (partial breakdown, $700 of $1,000)", created);
if (!created.body.ok) {
  console.error("\nStopped: the PO was not created.");
  process.exit(1);
}
ids.pos.push(created.body.poRecordId);
ids.costItems.push(...(created.body.costItemRecordIds ?? []));
writeFileSync(".test-write-ids.json", JSON.stringify(ids, null, 2));

/* ------------------------------------------------- 2. duplicate guard */
show(
  "2. the same award again — must be refused as a duplicate",
  await post("/api/qb/award", award),
);

/* ----------------------------------------------------- 3. over-run guard */
show(
  "3. add $400 of line items to a $300 balance — must be refused",
  await post("/api/qb/bills", {
    action: "line-items",
    region: "FL",
    poRecordId: created.body.poRecordId,
    subRecordId: SUB.recordId,
    breakdown: [{ desc: "Too much", pct: 40, amount: 400 }],
  }),
);

/* -------------------------------------------------- 4. top up the balance */
const topUp = await post("/api/qb/bills", {
  action: "line-items",
  region: "FL",
  poRecordId: created.body.poRecordId,
  subRecordId: SUB.recordId,
  breakdown: [{ desc: "Test 3 — final", pct: 30, amount: 300 }],
});
show("4. add the remaining $300 as a line item", topUp);
ids.costItems.push(...(topUp.body.createdRecordIds ?? []));
writeFileSync(".test-write-ids.json", JSON.stringify(ids, null, 2));

console.log("\nRecord ids written to .test-write-ids.json");
