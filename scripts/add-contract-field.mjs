import { REALM, TOKEN, qb } from "./qb.mjs";

/**
 * Adds "Total Contract Price" to the Purchase Orders table.
 *
 * Mainland awards enter one contract figure and then break it down into PO
 * line items, a few at a time — the first breakdown often does not consume the
 * whole contract. Total Cost (88) is a rollup of the line items, so it says
 * what has been broken down so far, not what the contract is worth. Without
 * somewhere to keep the contract figure there is nothing to compute a
 * remaining balance against when someone comes back to add more lines.
 *
 * Every other writable currency field on that table was unsuitable: 259 and
 * 260 feed the Total Amount formula, 313 is Puerto Rico specific, and 292
 * belongs to the compliance flow and is already on 30 purchase orders.
 *
 * Dry run by default — it only reports what it would do. Pass --create to
 * actually add the field, because this changes a live Quickbase table.
 */

const TABLE = process.env.QB_POS_TABLE ?? "bukmrrvkz";
const LABEL = process.env.QB_CONTRACT_FIELD_LABEL ?? "Total Contract Price";
const create = process.argv.includes("--create");

/*
 * Creating a field needs more than read access. Prefer the admin token when
 * one is configured, and say which is being used rather than failing with a
 * bare 401.
 */
const adminToken = process.env.QB_ADMIN_TOKEN ?? "";
const token = adminToken || TOKEN;
console.log(`using ${adminToken ? "QB_ADMIN_TOKEN" : "QB_USER_TOKEN"} against ${REALM}\n`);

async function api(path, init = {}) {
  const res = await fetch(`https://api.quickbase.com/v1${path}`, {
    ...init,
    headers: {
      "QB-Realm-Hostname": REALM,
      Authorization: `QB-USER-TOKEN ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Quickbase ${res.status} ${path}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

const fields = await api(`/fields?tableId=${TABLE}`);
const existing = fields.find(
  (f) => f.label.trim().toLowerCase() === LABEL.toLowerCase(),
);

if (existing) {
  console.log(
    `"${LABEL}" already exists on ${TABLE} as field ${existing.id} ` +
      `(${existing.fieldType}, mode=${existing.mode || "writable"}).`,
  );
  report(existing.id, existing);
  process.exit(0);
}

if (!create) {
  console.log(
    `Dry run — nothing has been changed.\n\n` +
      `Would create on Purchase Orders (${TABLE}):\n` +
      `  label       : ${LABEL}\n` +
      `  type        : currency\n` +
      `  decimals    : 2\n` +
      `  blankIsZero : false   (so "not set" is distinguishable from $0.00)\n` +
      `  addToForms  : false   (this app writes it; it is not hand-entered)\n\n` +
      `The table has ${fields.length} fields today. This is additive — no existing\n` +
      `field or record is touched.\n\n` +
      `Re-run with --create to make the change.\n`,
  );
  process.exit(0);
}

const created = await api(`/fields?tableId=${TABLE}`, {
  method: "POST",
  body: JSON.stringify({
    label: LABEL,
    fieldType: "currency",
    noWrap: true,
    addToForms: false,
    fieldHelp:
      "What the subcontract is worth in total. The PO line items break this down, " +
      "often a few at a time, so Total Cost (a rollup of those lines) can be lower " +
      "until the breakdown is complete. Written by the Subcontractor Award System.",
    properties: { decimalPlaces: 2, blankIsZero: false },
  }),
});

console.log(`Created "${LABEL}" as field ${created.id} on ${TABLE}.`);
report(created.id, created);

function report(id) {
  console.log(
    `\nNext: set it in src/lib/qb-award.ts\n` +
      `    contractPrice: ${id},\n\n` +
      `  It is only written for regions whose awardEntry is "contract" — Puerto\n` +
      `  Rico carries its figure in the Award Breakdown categories instead.\n`,
  );
}
