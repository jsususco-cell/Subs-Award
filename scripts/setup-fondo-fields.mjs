/**
 * Create the Fondo submittal staging fields on the Insurance Policy Submittal
 * table. Add-only and idempotent: a field whose label already exists is left
 * alone, so re-running is safe.
 *
 * The submission is staged rather than written to Insurance Amount (13) and
 * Poliza (14) directly, because Coverage Status (21) is a formula over those
 * two -- writing them on submission would show the case as COVERED on the
 * insurance page before anyone had reviewed it. Approval copies them across.
 */
import fs from "node:fs";

const TABLE = "bwa4ktcq6";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      let v = l.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      return [l.slice(0, i).trim(), v];
    }),
);

// Creating fields needs schema rights, which the app's runtime token does not
// have. QB_ADMIN_TOKEN is used for that and nothing else -- the app itself
// keeps running as QB_USER_TOKEN.
const TOKEN = env.QB_ADMIN_TOKEN || env.QB_USER_TOKEN;

const H = {
  "QB-Realm-Hostname": env.QB_REALM,
  Authorization: `QB-USER-TOKEN ${TOKEN}`,
  "Content-Type": "application/json",
};

export const FONDO_FIELDS = [
  { label: "Fondo Submission Status", fieldType: "text-multiple-choice",
    properties: { choices: ["Awaiting submission", "Submitted - pending review", "Approved", "Returned for correction"] } },
  { label: "Submitted Insurance Amount", fieldType: "currency" },
  { label: "Submitted Poliza", fieldType: "file" },
  { label: "Submitted Policy Number", fieldType: "text" },
  { label: "Fondo Submitted At", fieldType: "timestamp", fallback: "date" },
  { label: "Fondo Review Notes", fieldType: "text-multi-line" },
  { label: "Fondo Reviewed By", fieldType: "text" },
  { label: "Fondo Reviewed At", fieldType: "timestamp", fallback: "date" },
  // Stamped when the form link goes out, so the scheduled sender never mails
  // the same subcontractor twice for one case.
  { label: "Fondo Form Sent At", fieldType: "timestamp", fallback: "date" },
];

async function create(def) {
  const body = { label: def.label, fieldType: def.fieldType, addToForms: false };
  if (def.properties) body.properties = def.properties;
  let r = await fetch(`https://api.quickbase.com/v1/fields?tableId=${TABLE}`, {
    method: "POST", headers: H, body: JSON.stringify(body),
  });
  if (!r.ok && def.fallback) {
    const t = await r.text();
    console.log(`    ${def.fieldType} rejected (${r.status}), retrying as ${def.fallback}: ${t.slice(0, 120)}`);
    body.fieldType = def.fallback;
    r = await fetch(`https://api.quickbase.com/v1/fields?tableId=${TABLE}`, {
      method: "POST", headers: H, body: JSON.stringify(body),
    });
  }
  const j = await r.json();
  if (!r.ok) throw new Error(`${def.label}: ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

const existing = await (await fetch(`https://api.quickbase.com/v1/fields?tableId=${TABLE}`, { headers: H })).json();
const byLabel = new Map(existing.map((f) => [f.label.toLowerCase(), f]));

const map = {};
for (const def of FONDO_FIELDS) {
  const have = byLabel.get(def.label.toLowerCase());
  if (have) {
    console.log(`  = ${String(have.id).padStart(4)}  ${def.label}  (already there, left alone)`);
    map[def.label] = have.id;
    continue;
  }
  const made = await create(def);
  console.log(`  + ${String(made.id).padStart(4)}  ${def.label}  (${made.fieldType})`);
  map[def.label] = made.id;
}

console.log("\nField map:");
console.log(JSON.stringify(map, null, 2));
