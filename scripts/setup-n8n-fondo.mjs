/**
 * Create (or update) the n8n workflow that asks subcontractors for their Fondo
 * poliza.
 *
 * The schedule lives here rather than in vercel.json: Vercel rejects a
 * sub-daily cron on the Hobby plan, and it does so when the deployment is
 * CREATED, so the push silently produces no deployment at all.
 *
 * Idempotent — re-running updates the workflow in place rather than making a
 * second one. It is left inactive; activate it once production is serving the
 * route.
 */
import { readFileSync } from "node:fs";
import { n8n } from "./n8n.mjs";

const NAME = "Subs Award — Fondo poliza form sender";
const URL = "https://subs-award.vercel.app/api/fondo/notify";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      let v = l.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      return [l.slice(0, i).trim(), v];
    }),
);

const KEY = env.LETTER_SEND_KEY;
if (!KEY) throw new Error("LETTER_SEND_KEY missing from .env.local");

const CHECK = `// A 200 from this endpoint does not mean every case went out. It reports
// per-case problems in \`failed\`, so treating the status code as success would
// hide subcontractors who were never asked for their poliza. Anything in
// \`failed\` throws, and the execution shows as failed in n8n.
const res = $input.first().json;
const body = res.body ?? res;
const status = res.statusCode ?? 200;

if (status === 503) {
  // Not configured yet is a real state, not a crash. Record it and stop.
  return [{ json: { skipped: true, status, reason: body?.error ?? 'not configured' } }];
}
if (status !== 200 || body?.ok !== true) {
  throw new Error(\`Fondo notifier returned \${status}: \${JSON.stringify(body).slice(0, 400)}\`);
}
const failed = body.failed ?? [];
if (failed.length) {
  throw new Error(\`\${failed.length} case(s) were not emailed: \${JSON.stringify(failed).slice(0, 500)}\`);
}
return [{ json: { sent: body.sent ?? 0, sentRecordIds: body.sentRecordIds ?? [], unreachable: body.unreachable ?? [] } }];`;

const workflow = {
  name: NAME,
  settings: { executionOrder: "v1" },
  nodes: [
    {
      id: "trigger",
      name: "Every 5 minutes",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1.2,
      position: [0, 0],
      parameters: { rule: { interval: [{ field: "minutes", minutesInterval: 5 }] } },
    },
    {
      id: "call",
      name: "Ask subs for the poliza",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [240, 0],
      parameters: {
        method: "POST",
        url: URL,
        sendHeaders: true,
        headerParameters: { parameters: [{ name: "x-send-key", value: KEY }] },
        options: {
          timeout: 60000,
          response: { response: { neverError: true, fullResponse: true } },
        },
      },
      notes: "The key is required: this endpoint mails subcontractors.",
    },
    {
      id: "check",
      name: "Fail loudly on a partial send",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [480, 0],
      parameters: { jsCode: CHECK },
    },
  ],
  connections: {
    "Every 5 minutes": { main: [[{ node: "Ask subs for the poliza", type: "main", index: 0 }]] },
    "Ask subs for the poliza": { main: [[{ node: "Fail loudly on a partial send", type: "main", index: 0 }]] },
  },
};

const existing = (await n8n("/workflows?limit=250")).data.find((w) => w.name === NAME);

if (existing) {
  await n8n(`/workflows/${existing.id}`, { method: "PUT", body: JSON.stringify(workflow) });
  console.log(`updated ${existing.id}  "${NAME}"  active=${existing.active}`);
} else {
  const made = await n8n("/workflows", { method: "POST", body: JSON.stringify(workflow) });
  console.log(`created ${made.id}  "${NAME}"  active=${made.active}`);
  console.log("\nInactive until production serves the route. Activate with:");
  console.log(`  node scripts/setup-n8n-fondo.mjs --activate`);
}

if (process.argv.includes("--activate")) {
  const id = existing?.id ?? (await n8n("/workflows?limit=250")).data.find((w) => w.name === NAME).id;
  await n8n(`/workflows/${id}/activate`, { method: "POST" });
  console.log(`activated ${id}`);
}
