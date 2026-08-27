import { randomBytes } from "node:crypto";
import { appendFileSync, readFileSync, existsSync } from "node:fs";
import { n8n, BASE } from "./n8n.mjs";

/**
 * Create (or update) the n8n workflow that emails the award letter.
 *
 * Creates the workflow INACTIVE. Pass --activate to turn it on.
 *
 * The webhook token is generated here, stored as an n8n credential and written
 * to .env.local — it is never printed, so it does not end up in a log or a
 * transcript. Re-running reuses the credential named by
 * N8N_WEBHOOK_CREDENTIAL_ID rather than minting a second one and orphaning the
 * token already on disk.
 */

const NAME = "Subs Award — Send Award Letter";
const PATH = "subs-award-send-letter";
const GMAIL_CREDENTIAL = { id: "VFSVlQJu0WvJeCVE", name: "Byrdson Admin Gmail account" };
const activate = process.argv.includes("--activate");

/**
 * Turn the base64 attachment into an n8n binary.
 *
 * Built inline rather than with this.helpers.prepareBinaryData, which writes to
 * ~/.n8n/binaryData and fails on this instance with a path error. Keeping the
 * payload in memory needs no disk access.
 *
 * Assembled from lines so the snippet can contain backticks safely.
 */
const DECODE = [
  "// The webhook node nests the POST body under `body`; accept either shape.",
  "const out = [];",
  "",
  "for (const item of $input.all()) {",
  "  const req = item.json.body ?? item.json;",
  "  const att = (req.attachments ?? [])[0];",
  "  if (!att) throw new Error('No attachment on the request');",
  "",
  "  const b64 = String(att.contentBase64 ?? '');",
  "  const name = att.filename ?? 'attachment.pdf';",
  "  const dot = name.lastIndexOf('.');",
  "",
  "  out.push({",
  "    json: {",
  "      to: (req.to ?? []).join(', '),",
  "      cc: (req.cc ?? []).join(', '),",
  "      subject: req.subject,",
  "      html: req.html,",
  "      fromName: req.fromName ?? 'Byrdson Services',",
  "    },",
  "    binary: {",
  "      attachment: {",
  "        data: b64,",
  "        mimeType: att.contentType ?? 'application/pdf',",
  "        fileName: name,",
  "        fileExtension: dot > -1 ? name.slice(dot + 1) : 'pdf',",
  "        fileSize: Buffer.byteLength(b64, 'base64'),",
  "      },",
  "    },",
  "  });",
  "}",
  "",
  "return out;",
].join("\n");

function nodes(credentialId) {
  return [
    {
      parameters: {
        httpMethod: "POST",
        path: PATH,
        authentication: "headerAuth",
        responseMode: "responseNode",
        options: {},
      },
      id: "webhook",
      name: "Webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [0, 0],
      webhookId: PATH,
      credentials: {
        httpHeaderAuth: { id: credentialId, name: "Subs Award webhook token" },
      },
      notes:
        "Header auth is required: this URL can send mail as the company to anyone who finds it.",
    },
    {
      parameters: { jsCode: DECODE },
      id: "decode",
      name: "Decode attachment",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [220, 0],
      notes:
        "Builds the binary inline; prepareBinaryData fails on this instance with a binaryData path error.",
    },
    {
      parameters: {
        sendTo: "={{ $json.to }}",
        subject: "={{ $json.subject }}",
        emailType: "html",
        message: "={{ $json.html }}",
        options: {
          ccList: "={{ $json.cc }}",
          senderName: "={{ $json.fromName }}",
          attachmentsUi: { attachmentsBinary: [{ property: "attachment" }] },
        },
      },
      id: "gmail",
      name: "Send award letter",
      type: "n8n-nodes-base.gmail",
      typeVersion: 2.1,
      position: [440, 0],
      credentials: { gmailOAuth2: GMAIL_CREDENTIAL },
    },
    {
      parameters: {
        respondWith: "json",
        responseBody:
          "={{ JSON.stringify({ messageId: $json.id ?? 'sent', threadId: $json.threadId ?? null }) }}",
        options: {},
      },
      id: "respond",
      name: "Respond",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.1,
      position: [660, 0],
      notes:
        "The app requires this messageId; without it a send is treated as failed.",
    },
  ];
}

const CONNECTIONS = {
  Webhook: { main: [[{ node: "Decode attachment", type: "main", index: 0 }]] },
  "Decode attachment": {
    main: [[{ node: "Send award letter", type: "main", index: 0 }]],
  },
  "Send award letter": { main: [[{ node: "Respond", type: "main", index: 0 }]] },
};

// ---------------------------------------------------------------- run

const existing = ((await n8n("/workflows?limit=250")).data ?? []).find(
  (w) => w.name === NAME,
);

let credentialId = process.env.N8N_WEBHOOK_CREDENTIAL_ID ?? "";
let token = "";

if (!credentialId) {
  token = randomBytes(24).toString("base64url");
  const cred = await n8n("/credentials", {
    method: "POST",
    body: JSON.stringify({
      name: "Subs Award webhook token",
      type: "httpHeaderAuth",
      data: { name: "x-webhook-token", value: token },
    }),
  });
  credentialId = cred.id;
  console.log(
    `created webhook credential ${credentialId} (value ${token.length} chars, not shown)`,
  );
}

const payload = {
  name: NAME,
  nodes: nodes(credentialId),
  connections: CONNECTIONS,
  settings: { executionOrder: "v1" },
};

let workflow;
if (existing) {
  workflow = await n8n(`/workflows/${existing.id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  console.log(`updated workflow ${workflow.id}`);
} else {
  workflow = await n8n("/workflows", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  console.log(`created workflow ${workflow.id} (inactive)`);
}

if (activate) {
  await n8n(`/workflows/${workflow.id}/activate`, { method: "POST" });
  console.log("activated");
}

const url = `${BASE}/webhook/${PATH}`;
console.log("production webhook:", url);

if (token) {
  const envFile = ".env.local";
  const current = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
  if (current.includes("N8N_SEND_WEBHOOK_URL")) {
    console.log("\n.env.local already names N8N_SEND_WEBHOOK_URL — not touching it.");
  } else {
    appendFileSync(
      envFile,
      "\n# n8n send transport (token generated by scripts/setup-n8n-send.mjs)\n" +
        `N8N_SEND_WEBHOOK_URL=${url}\n` +
        `N8N_WEBHOOK_TOKEN=${token}\n` +
        `N8N_WEBHOOK_CREDENTIAL_ID=${credentialId}\n`,
    );
    console.log("\nwrote the webhook URL, token and credential id to .env.local");
  }
  console.log("Set N8N_SEND_WEBHOOK_URL and N8N_WEBHOOK_TOKEN in Vercel too.");
}
