/**
 * Rehearses ONE award the way the Create PO panel sequences it.
 *
 * The panel does three things in order after the button is pressed, and the
 * order is deliberate: create the records, file the letter on the purchase
 * order, then send. Filing sits before sending so the record carries the
 * letter even when the mail fails — and whether or not mail was ever going to
 * be sent. This runs that same sequence against the same routes so the chain
 * is exercised, not just each route on its own.
 *
 *   node scripts/test-award-chain.mjs --apply
 *
 * Creates real records. `scripts/test-write-cleanup.mjs --apply` removes them.
 */
import { writeFileSync } from "node:fs";
import { loadEnv, qb } from "./qb.mjs";

loadEnv();

if (!process.argv.includes("--apply")) {
  console.error(
    [
      "This creates a real purchase order and attaches a real letter to it.",
      "Re-run with --apply, then clean up with:",
      "  node scripts/test-write-cleanup.mjs --apply",
    ].join("\n"),
  );
  process.exit(1);
}

const BASE = process.env.TEST_BASE ?? "http://localhost:3040";
const KEY = process.env.LETTER_SEND_KEY ?? "";

const JOB = {
  recordId: 1885,
  name: "FL-123 Test St.-Elevate Florida",
  type: "Home Elevation",
};
const SUB = { recordId: 6895, name: "Testing of documents" };
const CONTRACT = 4200;
const BREAKDOWN = [
  { desc: "Full scope — rehearsal", pct: 100, amount: CONTRACT },
];

const post = async (path, body) => {
  const started = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(KEY ? { "x-send-key": KEY } : {}),
    },
    body: JSON.stringify(body),
  });
  return {
    status: res.status,
    body: await res.json(),
    ms: Date.now() - started,
  };
};

/* The letter the panel hands to both the attach and the send routes. */
const letter = {
  region: "FL",
  jobName: JOB.name,
  jobAddress: "123 Test St., Miami, Florida 33101",
  subcontractor: SUB.name,
  scopeOfWork: "Full scope — rehearsal",
  jobType: JOB.type,
  program: "",
  startDate: "2026-10-01",
  endDate: "2027-03-30",
  coverages: [],
  breakdown: BREAKDOWN,
  result: {
    base: 0,
    lessOandP: 0,
    subsShare: 0,
    hc: 0,
    ada: 0,
    award: CONTRACT,
    tierRows: [],
    groups: [],
  },
  issuedOn: new Date().toISOString(),
};

const wall = Date.now();

/* ------------------------------------------------- 1. create the records */
const created = await post("/api/qb/award", {
  region: "FL",
  jobRecordId: JOB.recordId,
  subRecordId: SUB.recordId,
  title: "Chain rehearsal — delete me",
  scope: "Full scope — rehearsal",
  jobType: JOB.type,
  poStatus: "Unreleased",
  expenseClass: "PO",
  lienWaiver: true,
  contractPrice: CONTRACT,
  breakdown: BREAKDOWN,
  caseNumber: JOB.name,
  subcontractorName: SUB.name,
});
console.log(`1. create records      HTTP ${created.status}  ${created.ms}ms`);
if (!created.body.ok) {
  console.error(JSON.stringify(created.body, null, 2));
  process.exit(1);
}
const poRecordId = created.body.poRecordId;
console.log(
  `   PO #${poRecordId}, cost items ${created.body.costItemRecordIds.join(", ")}`,
);

writeFileSync(
  ".test-write-ids.json",
  JSON.stringify(
    {
      pos: [poRecordId],
      costItems: created.body.costItemRecordIds,
      billLines: [],
    },
    null,
    2,
  ),
);

/* ------------------------------------------------ 2. file the letter on it */
const filed = await post("/api/letter/attach", { letter, poRecordId });
console.log(`2. file the letter     HTTP ${filed.status}  ${filed.ms}ms`);
console.log(
  `   ${filed.body.ok ? `${filed.body.attachment} (${filed.body.bytes} bytes)` : filed.body.error}`,
);

console.log(
  `\none award, end to end: ${((Date.now() - wall) / 1000).toFixed(1)}s`,
);

/* ------------------------------------------- 3. what the record now holds */
const back = await qb("/records/query", {
  method: "POST",
  body: JSON.stringify({
    from: "bukmrrvkz",
    select: [3, 17, 15, 318, 88, 263],
    where: `{3.EX.${poRecordId}}`,
  }),
});
const row = back.data[0];
const doc = row["263"]?.value;
console.log(`\nthe purchase order now holds:`);
console.log(`  PO Number            ${row["17"].value}`);
console.log(`  PO Status            ${row["15"].value}`);
console.log(`  Total Contract Price ${row["318"].value}`);
console.log(`  Total Cost (rollup)  ${row["88"].value}`);
console.log(
  `  Award Letter Document ${doc?.versions?.length ? `${doc.versions[0].fileName} (v${doc.versions[0].versionNumber})` : "NOTHING"}`,
);

console.log(`\nclean up:  node scripts/test-write-cleanup.mjs --apply`);
