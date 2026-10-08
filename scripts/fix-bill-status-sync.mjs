/**
 * Repair the QBO Bill Status Sync — Stage 2 write-back (n8n NPt1efRbP74FT5yw).
 *
 *   node --conditions=react-server --import tsx scripts/fix-bill-status-sync.mjs
 *   node --conditions=react-server --import tsx scripts/fix-bill-status-sync.mjs --apply
 *
 * Dry run unless --apply is passed. The pristine definition is in
 * n8n/bill-status-sync.BEFORE-2026-10-08.json — PATCH that back to revert.
 *
 * What was wrong
 * --------------
 * The workflow had never executed once, so nothing had ever exercised it. It
 * could not have worked:
 *
 *  1. Both Quickbase HTTP nodes carried a literal placeholder in the
 *     Authorization header — "QB-USER-TOKEN YOUR_QUICKBASE_USER_TOKEN". The
 *     first step would 401.
 *  2. The realm was the placeholder "YOUR_QBO_REALM_ID", so every QuickBooks
 *     request went to /v3/company/YOUR_QBO_REALM_ID/query.
 *  3. Nothing checked that the QuickBooks bill it found was the same bill. It
 *     matched on DocNumber alone and took bills[0].
 *
 * What this changes
 * -----------------
 *  1. Both Quickbase nodes use the stored "Quickbase" credential the working
 *     Payment Sync uses, and the hardcoded header is removed. A token pasted
 *     into a node would sit in the workflow JSON and in every export of it.
 *  2. The realm is the US company, which is the only QuickBooks credential
 *     this workflow has wired. See the limitation below.
 *  3. A match is accepted only when the QuickBooks bill's TotalAmt equals the
 *     Quickbase Bill Amount to the cent. Two companies can hold the same
 *     DocNumber, and matching the wrong one writes a real figure that is
 *     simply somebody else's.
 *  4. The upsert states mergeFieldId 3 rather than relying on the default, so
 *     it can only ever update an existing row.
 *
 * What this does NOT change, deliberately
 * ---------------------------------------
 *  - BATCH_LIMIT stays 5. That is the author's controlled first write, and
 *    raising it is a decision about blast radius, not a repair.
 *  - A partly paid bill is still written as Status "Paid" with the correct
 *    part-amount. The author chose that; field 14 has no "Partly paid".
 *
 * Known limitation this does not fix
 * ----------------------------------
 * Byrdson runs two QuickBooks companies — US 9341457224915997 and PR
 * 9341456981104069 — and an OAuth credential belongs to one company, so a
 * single HTTP node cannot reach both. This workflow has only the US
 * credential, so Puerto Rico bills will not match. They are skipped, not
 * mis-written: the amount guard above is what makes that safe. Covering PR
 * needs a second node pair, as the Payment Sync has.
 */
import { n8n } from "./n8n.mjs";
import { writeFileSync } from "node:fs";

const ID = "NPt1efRbP74FT5yw";
const APPLY = process.argv.includes("--apply");

const QB_CREDENTIAL = { id: "mcl3DtqT5jquGme8", name: "Quickbase" };
const US_REALM = "9341457224915997";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(fn) {
  // The instance returns 503 "Database is not ready!" intermittently.
  for (let i = 0; i < 10; i += 1) {
    try {
      return await fn();
    } catch (e) {
      if (i === 9) throw e;
      await sleep(3000);
    }
  }
}

const wf = await retry(() => n8n(`/workflows/${ID}`));
const nodes = JSON.parse(JSON.stringify(wf.nodes));
const changes = [];

function node(name) {
  const n = nodes.find((x) => x.name === name);
  if (!n) throw new Error(`Node not found: ${name}`);
  return n;
}

// --- 1. Quickbase auth: stored credential, no token in the JSON -------------
for (const name of [
  "Query Quickbase Billing Line Items",
  "Upsert to Quickbase (write-back)",
]) {
  const n = node(name);
  const params = n.parameters.headerParameters?.parameters ?? [];
  const had = params.find((p) => p.name === "Authorization");
  n.parameters.headerParameters = {
    parameters: params.filter((p) => p.name !== "Authorization"),
  };
  n.parameters.authentication = "genericCredentialType";
  n.parameters.genericAuthType = "httpHeaderAuth";
  n.credentials = { ...(n.credentials ?? {}), httpHeaderAuth: QB_CREDENTIAL };
  if (had) changes.push(`${name}: replaced the placeholder Authorization header with the stored "Quickbase" credential`);
}

// --- 2. The realm ------------------------------------------------------------
{
  const n = node("Normalize Quickbase Records");
  const before = n.parameters.jsCode;
  n.parameters.jsCode = before
    .replace(
      "const REALM_ID = 'YOUR_QBO_REALM_ID'; // <-- PLACEHOLDER: QuickBooks Online company realmId",
      `const REALM_ID = '${US_REALM}'; // QuickBooks US company. The only QBO credential wired\n` +
        "// to this workflow is the US one, so Puerto Rico bills will not match here and are\n" +
        "// skipped rather than mis-written. Covering PR needs a second node pair with the\n" +
        "// 'PR - Production' credential and realm 9341456981104069.",
    );
  if (n.parameters.jsCode === before) throw new Error("Realm placeholder not found — the node has changed.");
  changes.push(`Normalize Quickbase Records: realm set to the US company (${US_REALM})`);
}

// --- 3. Refuse a match whose amount disagrees --------------------------------
{
  const n = node("Compute Status, Amount Paid & Extract Payment IDs");
  const before = n.parameters.jsCode;
  const anchor = `if (bill) {
  matchFound = true;`;
  if (!before.includes(anchor)) throw new Error("Compute node has changed — not patching blind.");
  const replacement = `// Two QuickBooks companies can hold the same DocNumber, and this workflow can
// only see one of them. Matching on the reference alone would let a bill from
// the other company — or a reused number — write a real figure that belongs to
// somebody else. The amount has to agree to the cent as well.
const qbBillAmountCents = rec.billAmount === null || rec.billAmount === ''
  ? null
  : Math.round(Number(rec.billAmount) * 100);
let amountMismatch = false;

if (bill) {
  const billTotalCents = Math.round(Number(bill.TotalAmt) * 100);
  if (qbBillAmountCents !== null && billTotalCents !== qbBillAmountCents) {
    // Found by reference, rejected on amount. Reported, never written.
    amountMismatch = true;
  }
}

if (bill && !amountMismatch) {
  matchFound = true;`;
  n.parameters.jsCode = before
    .replace(anchor, replacement)
    .replace(
      "    matchFound,\n    qboBalance,",
      "    matchFound,\n    amountMismatch,\n    qbBillAmount: rec.billAmount,\n    qboBalance,",
    );
  changes.push("Compute: a match is now refused unless the QuickBooks TotalAmt equals the Quickbase Bill Amount");
}

// Carry the rejection reason through to the comparison row, so a skip is legible.
{
  const n = node("Assemble Comparison Output");
  const before = n.parameters.jsCode;
  n.parameters.jsCode = before.replace(
    "    matchFound: computed.matchFound,",
    "    matchFound: computed.matchFound,\n    amountMismatch: computed.amountMismatch === true,\n    qbBillAmount: computed.qbBillAmount,",
  );
  if (n.parameters.jsCode !== before) changes.push("Assemble: carries the amount-mismatch reason into the output");
}

// --- 4. Say the merge key out loud -------------------------------------------
{
  const n = node("Upsert to Quickbase (write-back)");
  const before = n.parameters.jsonBody;
  n.parameters.jsonBody =
    "={{ JSON.stringify({ to: $json.to, data: $json.data, mergeFieldId: 3, fieldsToReturn: $json.fieldsToReturn }) }}";
  if (n.parameters.jsonBody !== before) changes.push("Upsert: mergeFieldId 3 stated explicitly, so it can only update");
}

console.log("changes to apply:");
for (const c of changes) console.log("  -", c);

const after = JSON.stringify(nodes);
console.log("\nplaceholders remaining:", {
  token: after.includes("YOUR_QUICKBASE_USER_TOKEN"),
  realm: after.includes("YOUR_QBO_REALM_ID"),
});
if (after.includes("YOUR_")) {
  console.log("  ! a YOUR_ placeholder is still present — look before applying");
}

writeFileSync("n8n/bill-status-sync.AFTER.json", JSON.stringify({ ...wf, nodes }, null, 2), "utf8");
console.log("\nproposed definition written to n8n/bill-status-sync.AFTER.json");

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to send it.");
  process.exit(0);
}

await retry(() =>
  n8n(`/workflows/${ID}`, {
    method: "PUT",
    body: JSON.stringify({
      name: wf.name,
      nodes,
      connections: wf.connections,
      settings: wf.settings ?? {},
    }),
  }),
);

const back = await retry(() => n8n(`/workflows/${ID}`));
const blob = JSON.stringify(back.nodes);
console.log("\nwritten. verifying what landed:");
console.log("  placeholder token gone :", !blob.includes("YOUR_QUICKBASE_USER_TOKEN"));
console.log("  placeholder realm gone :", !blob.includes("YOUR_QBO_REALM_ID"));
console.log("  amount guard present   :", blob.includes("amountMismatch"));
console.log("  mergeFieldId stated    :", blob.includes("mergeFieldId: 3"));
for (const name of ["Query Quickbase Billing Line Items", "Upsert to Quickbase (write-back)"]) {
  const n = back.nodes.find((x) => x.name === name);
  console.log(`  ${name}: cred =`, JSON.stringify(n.credentials?.httpHeaderAuth ?? null));
}
console.log("  active                 :", back.active);
