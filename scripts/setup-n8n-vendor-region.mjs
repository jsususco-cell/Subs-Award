import { n8n } from "./n8n.mjs";
import { loadEnv } from "./qb.mjs";

/**
 * Creates the n8n workflow that assigns Region to newly added subcontractors.
 *
 * WHY THIS EXISTS. Region (fid 206) is what every subcontractor list in the
 * award app filters on. A vendor added without one matches no region and is
 * silently missing from every list — which is how NORTH FLORIDA CUSTOM HOMES
 * OF CHIEFLAND reached a user as "this company is not in the list".
 *
 * WHAT IT ASSIGNS FROM. The vendor's own address state (fid 10). Measured
 * against the 196 vendors that carry both a state and a work-derived Region,
 * the address agrees with, or is subsumed by, that derivation 194 times —
 * the two misses are mainland addresses doing Puerto Rico work, which the
 * existing evidence-based derivation will correct once they have records.
 *
 * WHAT IT NEVER DOES.
 *   • Never overwrites a Region somebody or something already set, including
 *     "No work on file". It only ever fills a blank. A wrong value that looks
 *     deliberate is worse than a blank that is visibly missing.
 *   • Never guesses without an address. A vendor with no state is reported for
 *     a person to classify, not assigned on a hunch.
 *   • Never assigns a vendor whose Country is set to somewhere outside the US,
 *     where "Mainland" would be meaningless.
 *
 * It writes Region Evidence (fid 207) alongside, in the same spirit as the
 * existing evidence strings, so the basis for the value is on the record.
 *
 * Created INACTIVE. Dry run by default; pass --create to write it.
 */

loadEnv();

const create = process.argv.includes("--create");

const REALM = process.env.QB_REALM ?? "byrdsonservices.quickbase.com";
const QB_TOKEN = process.env.QB_USER_TOKEN ?? "";
const VENDORS = process.env.QB_VENDORS_TABLE ?? "buskqh272";

/** The space the Org Chart Watcher already posts to. */
const CHAT_SPACE = process.env.VENDOR_REGION_CHAT_SPACE ?? "spaces/AAQA39ZvVrU";
const CHAT_CRED = { id: "Twxw02caKFbl448A", name: "Byrdiie Google Service Account" };

const F = { recordId: 3, company: 23, state: 10, country: 12, region: 206, evidence: 207 };

if (!QB_TOKEN) {
  console.error("QB_USER_TOKEN must be in .env.local — it goes into the workflow's calls.");
  process.exit(1);
}

const assign = `
/*
 * Find vendors with no Region and work out which one their address says.
 * Only blanks are read, so a Region anybody already chose is never touched.
 */
const qb = (body) => this.helpers.httpRequest({
  method: 'POST',
  url: 'https://api.quickbase.com/v1/records/query',
  headers: {
    'QB-Realm-Hostname': ${JSON.stringify(REALM)},
    Authorization: 'QB-USER-TOKEN ' + ${JSON.stringify(QB_TOKEN)},
    'Content-Type': 'application/json',
  },
  body,
  json: true,
});

const res = await qb({
  from: ${JSON.stringify(VENDORS)},
  select: [${F.recordId}, ${F.company}, ${F.state}, ${F.country}],
  where: "{${F.region}.EX.''}",
  sortBy: [{ fieldId: ${F.recordId}, order: 'ASC' }],
});

const txt = (row, fid) => String((row[String(fid)] || {}).value || '').trim();
const rows = res.data || [];

const assigned = [];
const stuck = [];

for (const row of rows) {
  const id = row['${F.recordId}'].value;
  const company = txt(row, ${F.company});
  const state = txt(row, ${F.state});
  const country = txt(row, ${F.country});

  /* Somewhere outside the US: "Mainland" would say nothing true. */
  const foreign = country && !/^(us|usa|united states)/i.test(country);
  if (!state) { stuck.push({ id, company, why: 'no address state on the record' }); continue; }
  if (foreign) { stuck.push({ id, company, why: 'address is in ' + country }); continue; }

  const region = /puerto rico/i.test(state) ? 'Puerto Rico' : 'Mainland';
  assigned.push({ id, company, state, region });
}

return [{ json: { assigned, stuck, blanks: rows.length } }];
`.trim();

const write = `
/*
 * Write the regions worked out above. One call for all of them; Quickbase
 * upserts on Record ID#. Nothing is written when there is nothing to assign.
 */
const { assigned } = $json;
if (!assigned.length) return [{ json: { ...$json, written: 0 } }];

const data = assigned.map((a) => ({
  ${F.recordId}: { value: a.id },
  ${F.region}: { value: a.region },
  ${F.evidence}: { value: 'auto-assigned from vendor address: ' + a.state },
}));

const res = await this.helpers.httpRequest({
  method: 'POST',
  url: 'https://api.quickbase.com/v1/records',
  headers: {
    'QB-Realm-Hostname': ${JSON.stringify(REALM)},
    Authorization: 'QB-USER-TOKEN ' + ${JSON.stringify(QB_TOKEN)},
    'Content-Type': 'application/json',
  },
  body: { to: ${JSON.stringify(VENDORS)}, data },
  json: true,
});

const meta = res.metadata || {};
return [{ json: { ...$json, written: (meta.updatedRecordIds || []).length || assigned.length, lineErrors: meta.lineErrors || null } }];
`.trim();

const report = `
/*
 * Speak only about what could not be assigned. Everything else was handled,
 * and a message every quarter of an hour saying so would train people to
 * ignore the one that matters.
 */
const { assigned, stuck, written } = $json;
if (!stuck.length) return [];

const lines = stuck.map((s) => '• ' + s.company + ' (#' + s.id + ') — ' + s.why);
const head = written
  ? '*Subcontractor Region: ' + written + ' assigned, ' + stuck.length + ' need a person*'
  : '*Subcontractor Region needs a person*';

return [{
  json: {
    text: head + '\\n' + lines.join('\\n') +
      '\\n\\nSet Region on the Subs/Vendors record. Until it is set, the vendor is missing from every subcontractor list in the award app.',
    count: stuck.length,
  },
}];
`.trim();

const workflow = {
  name: "Byrdson — Vendor Region Auto-Assign",
  settings: {
    executionOrder: "v1",
    timezone: "America/Chicago",
    callerPolicy: "workflowsFromSameOwner",
  },
  nodes: [
    {
      id: "manual",
      name: "Execute (test)",
      type: "n8n-nodes-base.manualTrigger",
      typeVersion: 1,
      position: [0, -140],
      parameters: {},
    },
    {
      id: "cron",
      name: "Every 15 minutes",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1.1,
      position: [0, 40],
      parameters: { rule: { interval: [{ field: "minutes", minutesInterval: 15 }] } },
    },
    {
      id: "work",
      name: "Region from address",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [240, -50],
      parameters: { mode: "runOnceForAllItems", jsCode: assign },
    },
    {
      id: "write",
      name: "Write Region",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [480, -50],
      parameters: { mode: "runOnceForAllItems", jsCode: write },
    },
    {
      id: "report",
      name: "Anything needing a person",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [720, -50],
      parameters: { mode: "runOnceForAllItems", jsCode: report },
    },
    {
      id: "chat",
      name: "Google Chat: Alert",
      type: "n8n-nodes-base.googleChat",
      typeVersion: 1,
      position: [960, -50],
      parameters: {
        spaceId: CHAT_SPACE,
        messageUi: { text: "={{ $json.text }}" },
        additionalFields: {},
      },
      credentials: { googleApi: CHAT_CRED },
    },
  ],
  connections: {
    "Execute (test)": { main: [[{ node: "Region from address", type: "main", index: 0 }]] },
    "Every 15 minutes": { main: [[{ node: "Region from address", type: "main", index: 0 }]] },
    "Region from address": { main: [[{ node: "Write Region", type: "main", index: 0 }]] },
    "Write Region": { main: [[{ node: "Anything needing a person", type: "main", index: 0 }]] },
    "Anything needing a person": {
      main: [[{ node: "Google Chat: Alert", type: "main", index: 0 }]],
    },
  },
};

console.log(`vendors table  ${VENDORS}`);
console.log(`reads          Region (${F.region}) blank`);
console.log(`writes         Region (${F.region}) + Region Evidence (${F.evidence})`);
console.log(`never          overwrites a Region that is already set`);
console.log(`alerts         ${CHAT_SPACE} — only about vendors it could not assign\n`);

if (!create) {
  console.log(`DRY RUN — nothing created. Re-run with --create.`);
  console.log(`\nWould create "${workflow.name}", INACTIVE:`);
  for (const n of workflow.nodes) console.log(`  ${n.name}`);
  process.exit(0);
}

const made = await n8n("/workflows", { method: "POST", body: JSON.stringify(workflow) });
console.log(`created workflow ${made.id} "${made.name}" — active: ${made.active}`);
console.log(`\nIt is INACTIVE. Run it once from the "Execute (test)" trigger and check\nwhat it wrote before activating.`);
