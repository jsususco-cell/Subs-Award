/**
 * Create (or update) the n8n workflow that files Fondo polizas in Google Drive:
 *
 *   Fondo Poliza (shared drive folder 13hReruRL566lvBqzUUW3rSs3n2-0xzrf)
 *     / <case number> /
 *         "<PO> - <subcontractor> - <STATUS> - <date>.pdf"
 *
 * POST /webhook/fondo-poliza-drive with header x-send-key and JSON
 *   { action: "upload", caseNumber, fileName, mimeType, data (base64) }
 *     -> { ok, fileId, folderId, webViewLink }
 *   { action: "rename", fileId, name }   (status changed: APPROVED, RETURNED)
 *     -> { ok, fileId, name }
 *   { action: "parent", fileId }          (is this folder directly in Fondo Poliza?)
 *     -> { ok, parentId }
 *
 * Uses the "Byrdson Admin Google Drive account" credential the Environmental
 * Tracker's Drive upload already uses. Idempotent: re-running updates the
 * workflow in place. `--activate` turns it on.
 */
import { readFileSync } from "node:fs";
import { n8n } from "./n8n.mjs";

const NAME = "Subs Award — Fondo poliza to Drive";
const ROOT = "13hReruRL566lvBqzUUW3rSs3n2-0xzrf";
const CRED = { googleDriveOAuth2Api: { id: "dgQ2YAV9YKro3G8w", name: "Byrdson Admin Google Drive account" } };

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const KEY = env.LETTER_SEND_KEY;
if (!KEY) throw new Error("LETTER_SEND_KEY missing from .env.local");

const drive = (name, position, parameters) => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  name,
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position,
  credentials: CRED,
  parameters: { authentication: "predefinedCredentialType", nodeCredentialType: "googleDriveOAuth2Api", options: {}, ...parameters },
});
const respond = (name, position, code, body) => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  name,
  type: "n8n-nodes-base.respondToWebhook",
  typeVersion: 1.1,
  position,
  parameters: { respondWith: "json", responseBody: body, options: { responseCode: code } },
});
const iff = (name, position, expr) => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  name,
  type: "n8n-nodes-base.if",
  typeVersion: 2,
  position,
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "loose" },
      conditions: [{ id: "c1", leftValue: expr, rightValue: true, operator: { type: "boolean", operation: "true", singleValue: true } }],
      combinator: "and",
    },
    options: {},
  },
});
const code = (name, position, jsCode) => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  name,
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position,
  parameters: { mode: "runOnceForEachItem", jsCode },
});
const q = (pairs) => ({ sendQuery: true, queryParameters: { parameters: pairs.map(([name, value]) => ({ name, value })) } });

const nodes = [
  {
    id: "webhook",
    name: "Webhook",
    type: "n8n-nodes-base.webhook",
    typeVersion: 2,
    position: [0, 0],
    parameters: { httpMethod: "POST", path: "fondo-poliza-drive", responseMode: "responseNode", options: {} },
  },
  iff("Key ok?", [220, 0], `={{ $json.headers['x-send-key'] === ${JSON.stringify(KEY)} }}`),
  respond("Refuse", [440, 200], 401, '={{ { ok: false, error: "not authorised" } }}'),
  iff("Rename?", [440, 0], "={{ $json.body.action === 'rename' }}"),

  // rename
  drive("Rename file", [660, -200], {
    method: "PATCH",
    url: "=https://www.googleapis.com/drive/v3/files/{{ $json.body.fileId }}",
    ...q([["supportsAllDrives", "true"], ["fields", "id,name,webViewLink"]]),
    sendBody: true,
    specifyBody: "json",
    jsonBody: "={{ JSON.stringify({ name: $json.body.name }) }}",
  }),
  respond("Renamed", [880, -200], 200, "={{ { ok: true, fileId: $json.id, name: $json.name, webViewLink: $json.webViewLink } }}"),

  // parent lookup
  iff("Parent?", [660, 100], "={{ $('Webhook').item.json.body.action === 'parent' }}"),
  drive("Get parent", [880, 200], {
    method: "GET",
    url: "=https://www.googleapis.com/drive/v3/files/{{ $('Webhook').item.json.body.fileId }}",
    ...q([["supportsAllDrives", "true"], ["fields", "id,parents"]]),
  }),
  respond("Parent", [1100, 200], 200, "={{ { ok: true, fileId: $json.id, parentId: ($json.parents || [])[0] || null } }}"),

  // upload
  code(
    "Prepare",
    [660, 0],
    `const b = $json.body || {};
const name = String(b.fileName || 'poliza.pdf').replace(/[\\\\/:*?"<>|]+/g, '-').slice(0, 200);
const folder = String(b.caseNumber || 'Sin caso').replace(/[\\\\/:*?"<>|]+/g, '-').trim();
const mime = b.mimeType || 'application/pdf';
const bin = await this.helpers.prepareBinaryData(Buffer.from(String(b.data || ''), 'base64'), name, mime);
return { json: { name, folder, mime }, binary: { file: bin } };`,
  ),
  drive("Find case folder", [880, 0], {
    method: "GET",
    url: "https://www.googleapis.com/drive/v3/files",
    ...q([
      ["q", `=name = '{{ $json.folder.replace(/'/g, "\\\\'") }}' and '${ROOT}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`],
      ["fields", "files(id,name)"],
      ["supportsAllDrives", "true"],
      ["includeItemsFromAllDrives", "true"],
      ["corpora", "allDrives"],
      ["pageSize", "1"],
    ]),
  }),
  iff("Folder exists?", [1100, 0], "={{ ($json.files || []).length > 0 }}"),
  code("Use folder", [1320, -100], "return { json: { folderId: $json.files[0].id } };"),
  drive("Create case folder", [1320, 100], {
    method: "POST",
    url: "https://www.googleapis.com/drive/v3/files",
    ...q([["supportsAllDrives", "true"], ["fields", "id,name"]]),
    sendBody: true,
    specifyBody: "json",
    jsonBody: `={{ JSON.stringify({ name: $('Prepare').item.json.folder, mimeType: 'application/vnd.google-apps.folder', parents: ['${ROOT}'] }) }}`,
  }),
  code("New folder", [1540, 100], "return { json: { folderId: $json.id } };"),
  drive("Create file", [1760, 0], {
    method: "POST",
    url: "https://www.googleapis.com/drive/v3/files",
    ...q([["supportsAllDrives", "true"], ["fields", "id,name,webViewLink"]]),
    sendBody: true,
    specifyBody: "json",
    jsonBody: "={{ JSON.stringify({ name: $('Prepare').item.json.name, mimeType: $('Prepare').item.json.mime, parents: [$json.folderId] }) }}",
  }),
  code(
    "Bytes",
    [1980, 0],
    "return { json: { fileId: $json.id }, binary: { file: $('Prepare').item.binary.file } };",
  ),
  drive("Upload content", [2200, 0], {
    method: "PATCH",
    url: "=https://www.googleapis.com/upload/drive/v3/files/{{ $json.fileId }}",
    ...q([["uploadType", "media"], ["supportsAllDrives", "true"], ["fields", "id,name,webViewLink,size,parents"]]),
    sendBody: true,
    contentType: "binaryData",
    inputDataFieldName: "file",
  }),
  respond(
    "Uploaded",
    [2420, 0],
    200,
    "={{ { ok: true, fileId: $json.id, name: $json.name, webViewLink: $json.webViewLink, folderId: ($json.parents || [])[0] || null, size: $json.size } }}",
  ),
];

const link = (to) => ({ main: [[{ node: to, type: "main", index: 0 }]] });
const connections = {
  Webhook: link("Key ok?"),
  "Key ok?": { main: [[{ node: "Rename?", type: "main", index: 0 }], [{ node: "Refuse", type: "main", index: 0 }]] },
  "Rename?": { main: [[{ node: "Rename file", type: "main", index: 0 }], [{ node: "Parent?", type: "main", index: 0 }]] },
  "Parent?": { main: [[{ node: "Get parent", type: "main", index: 0 }], [{ node: "Prepare", type: "main", index: 0 }]] },
  "Get parent": link("Parent"),
  "Rename file": link("Renamed"),
  Prepare: link("Find case folder"),
  "Find case folder": link("Folder exists?"),
  "Folder exists?": { main: [[{ node: "Use folder", type: "main", index: 0 }], [{ node: "Create case folder", type: "main", index: 0 }]] },
  "Use folder": link("Create file"),
  "Create case folder": link("New folder"),
  "New folder": link("Create file"),
  "Create file": link("Bytes"),
  Bytes: link("Upload content"),
  "Upload content": link("Uploaded"),
};

const workflow = { name: NAME, settings: { executionOrder: "v1" }, nodes, connections };
const existing = (await n8n("/workflows?limit=250")).data.find((w) => w.name === NAME);
let id = existing?.id;
if (existing) {
  await n8n(`/workflows/${id}`, { method: "PUT", body: JSON.stringify(workflow) });
  console.log(`updated ${id}  "${NAME}"`);
} else {
  id = (await n8n("/workflows", { method: "POST", body: JSON.stringify(workflow) })).id;
  console.log(`created ${id}  "${NAME}"`);
}
if (process.argv.includes("--activate")) {
  await n8n(`/workflows/${id}/activate`, { method: "POST" });
  console.log(`activated ${id}`);
}
