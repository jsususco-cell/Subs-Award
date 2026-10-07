/**
 * Teach the QBO Bill Status Sync to look in both QuickBooks companies.
 *
 *   node --import tsx scripts/add-pr-realm-to-bill-status-sync.mjs
 *   node --import tsx scripts/add-pr-realm-to-bill-status-sync.mjs --apply
 *
 * Dry run unless --apply. n8n/bill-status-sync.BEFORE-2026-10-08.json is the
 * original; the pre-change state of this edit is written alongside it.
 *
 * Why
 * ---
 * Byrdson runs two QuickBooks companies and a QBO OAuth credential belongs to
 * one of them, so a single HTTP node can only ever see one. This workflow had
 * the US credential, so every Puerto Rico bill came back "no match" — PO-14559
 * bill 5254, Fundación (10%) on a PR job, being the case that surfaced it.
 *
 * What changes
 * ------------
 * The single "Query QBO Bill by DocNumber" node becomes two, chained so item
 * pairing stays simple — each reads the reference from Normalize rather than
 * from the node before it:
 *
 *     Normalize -> Query QBO Bill — US -> Query QBO Bill — PR -> Compute
 *
 * Compute then holds both answers and decides:
 *
 *   - exactly one company has a bill with that DocNumber AND the matching
 *     amount -> use it, and record which company it came from
 *   - both do -> ambiguous, skipped and reported, never guessed
 *   - neither -> no match, as before
 *
 * Both QBO nodes continue on error, so one company being unreachable leaves
 * the other still able to match.
 *
 * What is removed
 * ---------------
 * "Query QBO Linked BillPayments" and "Assemble Comparison Output". They
 * existed to derive Date Paid, which this workflow has never written and which
 * the Payment Sync already writes — correctly, across both companies. Keeping
 * them would have meant a second pair of per-realm nodes to maintain for a
 * field somebody else owns, and a US-credentialled query against PR payment
 * ids that silently returns nothing.
 *
 * Status and Amount Paid both come from the Bill itself (TotalAmt, Balance),
 * so dropping the payment query costs this workflow nothing.
 */
import { n8n } from "./n8n.mjs";
import { writeFileSync } from "node:fs";

const ID = "NPt1efRbP74FT5yw";
const APPLY = process.argv.includes("--apply");

const US = { realm: "9341457224915997", cred: { id: "x621tPhwI7MQxxJj", name: "InProd - QBO" } };
const PR = { realm: "9341456981104069", cred: { id: "f0fk3VMDEIaOXPip", name: "PR - Production" } };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(fn) {
  for (let i = 0; i < 12; i += 1) {
    try {
      return await fn();
    } catch (e) {
      if (i === 11) throw e;
      await sleep(2500);
    }
  }
}

const wf = await retry(() => n8n(`/workflows/${ID}`));
writeFileSync("n8n/bill-status-sync.before-pr-realm.json", JSON.stringify(wf, null, 2), "utf8");

const old = wf.nodes;
const find = (n) => {
  const x = old.find((v) => v.name === n);
  if (!x) throw new Error(`Node not found: ${n}`);
  return x;
};

const billNodeTemplate = find("Query QBO Bill by DocNumber");

/** One QBO Bill lookup against a named company. */
function billNode(label, co, position) {
  return {
    ...JSON.parse(JSON.stringify(billNodeTemplate)),
    id: undefined,
    name: `Query QBO Bill — ${label}`,
    position,
    // A company being unreachable must not stop the other from matching.
    onError: "continueRegularOutput",
    credentials: { quickBooksOAuth2Api: co.cred },
    parameters: {
      ...billNodeTemplate.parameters,
      url: `https://quickbooks.api.intuit.com/v3/company/${co.realm}/query`,
      queryParameters: {
        parameters: [
          {
            name: "query",
            // Read from Normalize, not from whatever node ran before this one,
            // so chaining the two lookups cannot disturb the pairing.
            value:
              "=SELECT * FROM Bill WHERE DocNumber = '{{ $('Normalize Quickbase Records').item.json.refEscaped }}'",
          },
          { name: "minorversion", value: "65" },
        ],
      },
    },
  };
}

const computeCode = `// Decide the bill's Status and Amount Paid from whichever QuickBooks company
// actually holds it.
//
// Byrdson runs two companies and a credential belongs to one, so the reference
// is looked up in both and the answers are compared here. A DocNumber can
// repeat across companies, so the amount has to agree too — matching on the
// reference alone would let one company's bill write a figure that belongs to
// the other's.
const rec = $('Normalize Quickbase Records').item.json;

function firstBill(resp) {
  const r = resp && resp.QueryResponse;
  return r && Array.isArray(r.Bill) && r.Bill.length ? r.Bill[0] : null;
}

const usBill = firstBill($('Query QBO Bill — US').item.json);
const prBill = firstBill($json);

const wantCents = rec.billAmount === null || rec.billAmount === '' || rec.billAmount === undefined
  ? null
  : Math.round(Number(rec.billAmount) * 100);

function agrees(bill) {
  if (!bill) return false;
  if (wantCents === null) return true;        // nothing to compare against
  return Math.round(Number(bill.TotalAmt) * 100) === wantCents;
}

const usOk = agrees(usBill);
const prOk = agrees(prBill);

let bill = null;
let company = '';
let matchFound = false;
let skipReason = '';

if (usOk && prOk) {
  // The same reference and the same amount in both companies. Refused rather
  // than guessed: one of them belongs to somebody else.
  skipReason = 'ambiguous — matched in both companies';
} else if (usOk) {
  bill = usBill; company = 'US'; matchFound = true;
} else if (prOk) {
  bill = prBill; company = 'PR'; matchFound = true;
} else if (usBill || prBill) {
  skipReason = 'found by reference but the amount disagrees';
} else {
  skipReason = 'no bill with that reference in either company';
}

let qboTotalAmt = null, qboBalance = null, computedStatus = '', computedAmountPaid = null;
if (matchFound) {
  qboTotalAmt = Number(bill.TotalAmt);
  qboBalance = Number(bill.Balance);
  const totalCents = Math.round(qboTotalAmt * 100);
  const balCents = Math.round(qboBalance * 100);
  // Nothing paid (Balance == TotalAmt) -> Unpaid; any payment incl. partial -> Paid.
  computedStatus = (balCents === totalCents) ? 'Unpaid' : 'Paid';
  computedAmountPaid = (totalCents - balCents) / 100;
}

return {
  json: {
    recordId: rec.recordId,
    ref: rec.ref,
    company,
    matchFound,
    skipReason,
    qbBillAmount: rec.billAmount,
    qboTotalAmt,
    qboBalance,
    computedStatus,
    computedAmountPaid,
    // Date Paid belongs to the Payment Sync, which covers both companies.
    computedDatePaid: '',
    currentStatus: rec.currentStatus,
    currentAmountPaid: rec.currentAmountPaid,
    currentDatePaid: rec.currentDatePaid
  }
};`;

const nodes = [];
for (const n of old) {
  if (
    n.name === "Query QBO Bill by DocNumber" ||
    n.name === "Query QBO Linked BillPayments" ||
    n.name === "Assemble Comparison Output"
  ) {
    continue;
  }
  if (n.name === "Compute Status, Amount Paid & Extract Payment IDs") {
    nodes.push({ ...n, name: "Compute Status & Amount Paid", parameters: { ...n.parameters, jsCode: computeCode } });
    continue;
  }
  if (n.name === "Normalize Quickbase Records") {
    // realmId is no longer a single value flowing downstream.
    const code = n.parameters.jsCode
      .replace(/const REALM_ID = '[^']*';[^\n]*\n(\/\/[^\n]*\n)*/, "")
      .replace(/^\s*realmId: REALM_ID,\s*$/m, "")
      // The realm is no longer decided here; each lookup node carries its own,
      // so the old comment saying otherwise has to go with it.
      .replace(
        /^\/\/ QBO realmId is a workflow-level placeholder.*$/m,
        [
          "// The company is NOT decided here. The reference is looked up in both",
          "// QuickBooks companies downstream and the answers compared, because a",
          "// credential belongs to one company and a DocNumber can repeat across them.",
        ].join("\n"),
      );
    nodes.push({ ...n, parameters: { ...n.parameters, jsCode: code } });
    continue;
  }
  nodes.push(n);
}

const p = billNodeTemplate.position ?? [0, 0];
nodes.push(billNode("US", US, [p[0], p[1]]));
nodes.push(billNode("PR", PR, [p[0] + 200, p[1]]));

const connections = JSON.parse(JSON.stringify(wf.connections));
delete connections["Query QBO Bill by DocNumber"];
delete connections["Query QBO Linked BillPayments"];
delete connections["Assemble Comparison Output"];
delete connections["Compute Status, Amount Paid & Extract Payment IDs"];
connections["Normalize Quickbase Records"] = { main: [[{ node: "Query QBO Bill — US", type: "main", index: 0 }]] };
connections["Query QBO Bill — US"] = { main: [[{ node: "Query QBO Bill — PR", type: "main", index: 0 }]] };
connections["Query QBO Bill — PR"] = { main: [[{ node: "Compute Status & Amount Paid", type: "main", index: 0 }]] };
connections["Compute Status & Amount Paid"] = { main: [[{ node: "IF matchFound === true", type: "main", index: 0 }]] };

console.log("nodes:", old.length, "->", nodes.length);
console.log("  removed: Query QBO Bill by DocNumber, Query QBO Linked BillPayments, Assemble Comparison Output");
console.log("  added  : Query QBO Bill — US (", US.cred.name, "), Query QBO Bill — PR (", PR.cred.name, ")");
console.log("  renamed: Compute ... Extract Payment IDs -> Compute Status & Amount Paid");
console.log("\nchain:");
let cur = "Normalize Quickbase Records";
for (let i = 0; i < 6 && connections[cur]; i += 1) {
  const next = connections[cur].main?.[0]?.[0]?.node;
  if (!next) break;
  console.log("   ", cur, "->", next);
  cur = next;
}

writeFileSync("n8n/bill-status-sync.AFTER-pr-realm.json", JSON.stringify({ ...wf, nodes, connections }, null, 2), "utf8");
console.log("\nproposed definition: n8n/bill-status-sync.AFTER-pr-realm.json");

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to send it.");
  process.exit(0);
}

await retry(() =>
  n8n(`/workflows/${ID}`, {
    method: "PUT",
    body: JSON.stringify({ name: wf.name, nodes, connections, settings: wf.settings ?? {} }),
  }),
);

const back = await retry(() => n8n(`/workflows/${ID}`));
console.log("\nwritten. verifying:");
for (const label of ["US", "PR"]) {
  const n = back.nodes.find((x) => x.name === `Query QBO Bill — ${label}`);
  const realm = String(n?.parameters?.url ?? "").match(/company\/(\d+)/)?.[1];
  console.log(`  Query QBO Bill — ${label}: realm ${realm} | cred`, JSON.stringify(n?.credentials?.quickBooksOAuth2Api ?? null));
}
const blob = JSON.stringify(back.nodes);
console.log("  placeholders gone     :", !blob.includes("YOUR_"));
console.log("  ambiguity guard present:", blob.includes("matched in both companies"));
console.log("  active                :", back.active);
