import { REALM, TOKEN } from "./qb.mjs";

/**
 * Adds "PO Sent to Sub At" to the Purchase Orders table.
 *
 * Releasing a purchase order is what sends it, and the trigger for that lives
 * outside this app — a Quickbase release, an n8n run, a retry. Any of those can
 * fire twice, and the subcontractor must not receive the same purchase order
 * twice. This field is what makes the send happen once: /api/po/send writes it
 * after a successful send and refuses a purchase order that already carries it.
 *
 * "Notification Sent?" (50) cannot do the job. The Release button on the PO
 * form sets it true as part of releasing, so it is already true on a purchase
 * order whose document has never been emailed — it records the release, not
 * the delivery.
 *
 * Dry run by default. Pass --create to actually add the field, because this
 * changes a live Quickbase table.
 */

const TABLE = process.env.QB_POS_TABLE ?? "bukmrrvkz";
const LABEL = process.env.QB_PO_SENT_FIELD_LABEL ?? "PO Sent to Sub At";
const create = process.argv.includes("--create");

const adminToken = process.env.QB_ADMIN_TOKEN ?? "";
const token = adminToken || TOKEN;
console.log(
  `using ${adminToken ? "QB_ADMIN_TOKEN" : "QB_USER_TOKEN"} against ${REALM}\n`,
);

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
    `"${LABEL}" already exists as field ${existing.id} [${existing.fieldType}]. Nothing to do.`,
  );
  process.exit(0);
}

/* A writable date/time already on this table, so the type is known to work. */
const precedent = fields.find((f) => f.id === 314);
console.log(
  `precedent: fid 314 "${precedent?.label}" [${precedent?.fieldType}] ${precedent?.mode ?? "writable"}`,
);

const spec = {
  label: LABEL,
  fieldType: "timestamp",
  fieldHelp:
    "Set by the Subcontractor Award System when the purchase order document " +
    "was emailed to the subcontractor. Blank means it has not gone out. It is " +
    "what stops the same purchase order being sent twice — do not clear it " +
    "unless you intend it to be sent again.",
  addToForms: false,
};

if (!create) {
  console.log(`\nDRY RUN — would create on table ${TABLE}:\n`);
  console.log(JSON.stringify(spec, null, 2));
  console.log(`\nRe-run with --create to add it.`);
  process.exit(0);
}

const made = await api(`/fields?tableId=${TABLE}`, {
  method: "POST",
  body: JSON.stringify(spec),
});
console.log(`created field ${made.id} "${made.label}" [${made.fieldType}]`);
console.log(
  `\nPut this in src/lib/qb-award.ts as pos.sentToSubAt, and in the n8n workflow's filter.`,
);
