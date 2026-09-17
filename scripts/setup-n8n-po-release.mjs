import { n8n } from "./n8n.mjs";
import { loadEnv } from "./qb.mjs";

/**
 * Creates the n8n workflow that emails a purchase order when it is released.
 *
 * Releasing a PO in Quickbase (the Release button, field 44) is what turns it
 * into an offer the subcontractor is meant to have. Quickbase cannot call the
 * app itself, so this polls for purchase orders that have been released and
 * not yet sent, and POSTs each one to /api/po/send.
 *
 * TWO INDEPENDENT GUARDS, because getting this wrong means emailing
 * subcontractors purchase orders they should never receive:
 *
 *   1. Record ID# > WATERMARK. 1,710 mainland purchase orders were already
 *      Released when this was written, and Date Released is blank on nearly
 *      all of them, so there is no date to filter history out by. The
 *      watermark is the highest record id at go-live: nothing that existed
 *      before this workflow can ever be picked up, whatever else goes wrong.
 *
 *   2. "PO Sent to Sub At" (319) is empty. The app writes it after a
 *      successful send and refuses a purchase order that already carries it,
 *      so a retried run, a double fire or a restored backup cannot send twice.
 *      The app enforces this too — the workflow filtering on it only saves a
 *      pointless call.
 *
 * Created INACTIVE. Activating it starts mailing real subcontractors, so that
 * is a decision made in the n8n UI, not by running a script.
 *
 * Dry run by default; pass --create to write it.
 */

loadEnv();

/* --update writes too, so it must not fall through to the dry-run branch. */
const create =
  process.argv.includes("--create") || process.argv.includes("--update");

const APP_URL = process.env.PO_SEND_APP_URL ?? "https://subs-award.vercel.app";
const SEND_KEY = process.env.LETTER_SEND_KEY ?? "";
const REALM = process.env.QB_REALM ?? "byrdsonservices.quickbase.com";
const QB_TOKEN = process.env.QB_USER_TOKEN ?? "";

/**
 * The record-id floor.
 *
 * Its job is to keep purchase orders that were ALREADY RELEASED before this
 * workflow existed from being emailed. Verified 2026-09-17: all 1,710 mainland
 * Released purchase orders have an id at or below this, and none above it is
 * Released. It is NOT "everything that existed before go-live" -- 437 records
 * sit above it -- so do not describe it that way; the four mainland ones up
 * there are Unreleased, and sending those when somebody releases them is the
 * whole point.
 */
const WATERMARK = Number(process.env.PO_SEND_WATERMARK ?? 14647);

/**
 * Most purchase orders one run may send. A run bigger than this is a symptom,
 * not a workload, and every send is an email that cannot be recalled.
 */
const MAX_PER_RUN = Number(process.env.PO_SEND_MAX_PER_RUN ?? 5);

const POS_TABLE = "bukmrrvkz";
const F = {
  recordId: 3,
  poNumber: 17,
  relatedSub: 21,
  status: 15,
  jobState: 129,
  sentToSubAt: 319,
};
/** Mainland only — Puerto Rico sends no purchase order document. */
const STATES = {
  Florida: "FL",
  "North Carolina": "NC",
  Texas: "TX",
  Louisiana: "LA",
};

if (!SEND_KEY || !QB_TOKEN) {
  console.error(
    "LETTER_SEND_KEY and QB_USER_TOKEN must be in .env.local — they go into\n" +
      "the workflow's Quickbase query and its x-send-key header.",
  );
  process.exit(1);
}

const where =
  `{${F.status}.EX.'Released'}` +
  `AND{${F.sentToSubAt}.EX.''}` +
  `AND{${F.recordId}.GT.${WATERMARK}}` +
  `AND(` +
  Object.keys(STATES)
    .map((s) => `{${F.jobState}.EX.'${s}'}`)
    .join("OR") +
  `)`;

const findPos = `
/*
 * Ask Quickbase for released purchase orders that have not been sent.
 * The record-id floor is the important half: it is what keeps the 1,710
 * purchase orders that were already Released when this was built from ever
 * being mailed.
 */
const res = await this.helpers.httpRequest({
  method: 'POST',
  url: 'https://api.quickbase.com/v1/records/query',
  headers: {
    'QB-Realm-Hostname': ${JSON.stringify(REALM)},
    Authorization: 'QB-USER-TOKEN ' + ${JSON.stringify(QB_TOKEN)},
    'Content-Type': 'application/json',
  },
  body: {
    from: ${JSON.stringify(POS_TABLE)},
    select: [${F.recordId}, ${F.poNumber}, ${F.relatedSub}, ${F.jobState}],
    where: ${JSON.stringify(where)},
    sortBy: [{ fieldId: ${F.recordId}, order: 'ASC' }],
    options: { top: 25 },
  },
  json: true,
});

const STATES = ${JSON.stringify(STATES)};
const rows = res.data || [];
if (!rows.length) return [];

/*
 * Circuit breaker. A normal run has a handful of freshly released purchase
 * orders in it. A big number means something upstream changed -- the floor
 * stopped excluding history, a field id moved, somebody bulk-released -- and
 * the damage from sending is unrecoverable: every one of these is an email to
 * a real subcontractor. Refuse the whole run and say so instead.
 *
 * Deliberately not "send the first N": a partial send of a batch nobody
 * intended is harder to explain and to undo than no send at all.
 */
if (rows.length > ${MAX_PER_RUN}) {
  return [{
    json: {
      halted: true,
      count: rows.length,
      poNumbers: rows.slice(0, 10).map((r) => r['${F.poNumber}'].value),
    },
  }];
}

return rows.map((r) => ({
  json: {
    poRecordId: r['${F.recordId}'].value,
    poNumber: r['${F.poNumber}'].value,
    subRecordId: r['${F.relatedSub}'].value,
    region: STATES[r['${F.jobState}'].value],
  },
}));
`.trim();

const findEmail = `
/*
 * The purchase order carries the vendor's record id, not their address.
 * A purchase order with no address on file is skipped and reported rather
 * than sent to nobody -- somebody has to go and add the address.
 */
if ($json.halted) return [{ json: $json }];

const sub = $json.subRecordId;
const res = await this.helpers.httpRequest({
  method: 'POST',
  url: 'https://api.quickbase.com/v1/records/query',
  headers: {
    'QB-Realm-Hostname': ${JSON.stringify(REALM)},
    Authorization: 'QB-USER-TOKEN ' + ${JSON.stringify(QB_TOKEN)},
    'Content-Type': 'application/json',
  },
  body: {
    from: 'buskqh272',
    select: [3, 23, 28],
    where: '{3.EX.' + sub + '}',
  },
  json: true,
});

const row = (res.data || [])[0] || {};
const email = String(row['28']?.value || '').trim();
const company = String(row['23']?.value || '').trim();

return [{ json: { ...$json, email, company, skipped: email ? '' : 'no email on the subcontractor record' } }];
`.trim();

const sendOne = `
/*
 * One call per purchase order. The app re-checks the status and the sent
 * marker, so a 409 here is the guard working, not a failure -- it is recorded
 * and the run carries on.
 */
if ($json.halted) return [{ json: $json }];
if ($json.skipped) return [{ json: { ...$json, ok: false, outcome: $json.skipped } }];

let body;
let status;
try {
  const res = await this.helpers.httpRequest({
    method: 'POST',
    url: ${JSON.stringify(APP_URL)} + '/api/po/send',
    headers: {
      'Content-Type': 'application/json',
      'x-send-key': ${JSON.stringify(SEND_KEY)},
    },
    body: {
      region: $json.region,
      poRecordId: $json.poRecordId,
      to: $json.email,
    },
    json: true,
    returnFullResponse: true,
    ignoreHttpStatusErrors: true,
  });
  status = res.statusCode;
  body = res.body;
} catch (e) {
  return [{ json: { ...$json, ok: false, outcome: 'request failed: ' + e.message } }];
}

return [{
  json: {
    ...$json,
    ok: Boolean(body && body.ok),
    httpStatus: status,
    outcome: body && body.ok
      ? 'sent to ' + (body.to || []).join(', ')
      : (body && body.error) || ('HTTP ' + status),
  },
}];
`.trim();

const report = `
/*
 * Only speak up when something needs a person. A quiet run is the normal one.
 */
const items = $input.all().map((i) => i.json);

const halt = items.find((i) => i.halted);
if (halt) {
  return [{
    json: {
      text: '*Purchase order sending HALTED*\n' + halt.count +
        ' released purchase orders were queued in one run, over the safety cap. ' +
        'Nothing was sent.\n' + halt.poNumbers.join(', ') +
        '\n\nCheck the record-id floor and the Sent-to-Sub marker before releasing the brake.',
      count: halt.count,
    },
  }];
}

const failed = items.filter((i) => !i.ok);
if (!failed.length) return [];

const lines = failed.map((f) => '• ' + (f.poNumber || f.poRecordId) + ' — ' + f.outcome);
return [{
  json: {
    text: '*Purchase orders not sent to subcontractors*\\n' + lines.join('\\n'),
    count: failed.length,
  },
}];
`.trim();

const workflow = {
  name: "Subs Award — Send PO on Release",
  settings: {
    executionOrder: "v1",
    timezone: "America/Chicago",
    callerPolicy: "workflowsFromSameOwner",
  },
  nodes: [
    {
      id: "trigger",
      name: "Every 15 minutes",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1.2,
      position: [0, 0],
      parameters: { rule: { interval: [{ field: "minutes", minutesInterval: 15 }] } },
    },
    {
      id: "find",
      name: "Released, not yet sent",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [220, 0],
      parameters: { mode: "runOnceForAllItems", jsCode: findPos },
    },
    {
      id: "email",
      name: "Subcontractor email",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [440, 0],
      parameters: { mode: "runOnceForEachItem", jsCode: findEmail },
    },
    {
      id: "send",
      name: "POST /api/po/send",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [660, 0],
      parameters: { mode: "runOnceForEachItem", jsCode: sendOne },
    },
    {
      id: "report",
      name: "Anything that needs a person",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [880, 0],
      parameters: { mode: "runOnceForAllItems", jsCode: report },
    },
  ],
  connections: {
    "Every 15 minutes": { main: [[{ node: "Released, not yet sent", type: "main", index: 0 }]] },
    "Released, not yet sent": { main: [[{ node: "Subcontractor email", type: "main", index: 0 }]] },
    "Subcontractor email": { main: [[{ node: "POST /api/po/send", type: "main", index: 0 }]] },
    "POST /api/po/send": {
      main: [[{ node: "Anything that needs a person", type: "main", index: 0 }]],
    },
  },
};

console.log(`app        ${APP_URL}`);
console.log(`watermark  PO record id > ${WATERMARK}`);
console.log(`regions    ${Object.values(STATES).join(", ")}`);
console.log(`where      ${where}\n`);

if (!create) {
  console.log("DRY RUN — nothing was created. Re-run with --create.");
  console.log(`\nIt would create "${workflow.name}", INACTIVE, with nodes:`);
  for (const n of workflow.nodes) console.log(`  ${n.name}`);
  process.exit(0);
}

/* --update <id> replaces the workflow in place, keeping its id and history. */
const updateIdx = process.argv.indexOf("--update");
const updateId = updateIdx > -1 ? process.argv[updateIdx + 1] : null;

if (updateId) {
  const made = await n8n(`/workflows/${updateId}`, {
    method: "PUT",
    body: JSON.stringify(workflow),
  });
  console.log(`updated workflow ${made.id} "${made.name}" — active: ${made.active}`);
  process.exit(0);
}

const made = await n8n("/workflows", {
  method: "POST",
  body: JSON.stringify(workflow),
});
console.log(`created workflow ${made.id} "${made.name}" — active: ${made.active}`);
console.log(
  "\nIt is INACTIVE. Before activating it, check LETTER_SEND_ALLOWLIST on the\n" +
    "deployment: while that is set, nothing reaches a real subcontractor.",
);
