/**
 * Teach the send workflow to handle mail with no attachment.
 *
 * It was written for the award letter, which always carries a PDF, and threw
 * on anything without one -- so the Fondo form emails came back as an n8n
 * error page rather than JSON. The award-letter path is left exactly as it
 * was; a branch is added alongside it.
 */
import { n8n } from "./n8n.mjs";

const ID = "e7NoxLszPJPsnrpk";
const w = await n8n(`/workflows/${ID}`);

const DECODE = `// The webhook node nests the POST body under \`body\`; accept either shape.
// Mail without an attachment is legitimate -- the Fondo form request has no
// document -- so a missing attachment sets a flag instead of throwing, and the
// IF node downstream picks the Gmail node that matches.
const out = [];

for (const item of $input.all()) {
  const req = item.json.body ?? item.json;
  const att = (req.attachments ?? [])[0];

  const json = {
    to: (req.to ?? []).join(', '),
    cc: (req.cc ?? []).join(', '),
    subject: req.subject,
    html: req.html,
    fromName: req.fromName ?? 'Byrdson Services',
    hasAttachment: Boolean(att),
  };

  if (!att) {
    out.push({ json });
    continue;
  }

  const b64 = String(att.contentBase64 ?? '');
  const name = att.filename ?? 'attachment.pdf';
  const dot = name.lastIndexOf('.');

  out.push({
    json,
    binary: {
      attachment: {
        data: b64,
        mimeType: att.contentType ?? 'application/pdf',
        fileName: name,
        fileExtension: dot > -1 ? name.slice(dot + 1) : 'pdf',
        fileSize: Buffer.byteLength(b64, 'base64'),
      },
    },
  });
}

return out;`;

const nodes = w.nodes.map((n) =>
  n.name === "Decode attachment" ? { ...n, parameters: { ...n.parameters, jsCode: DECODE } } : n,
);

const gmail = w.nodes.find((n) => n.type === "n8n-nodes-base.gmail");

if (!nodes.some((n) => n.name === "Has an attachment?")) {
  nodes.push({
    id: "hasatt",
    name: "Has an attachment?",
    type: "n8n-nodes-base.if",
    typeVersion: 2,
    position: [(gmail.position?.[0] ?? 400) - 60, gmail.position?.[1] ?? 0],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [
          {
            id: "att",
            leftValue: "={{ $json.hasAttachment }}",
            rightValue: "",
            operator: { type: "boolean", operation: "true", singleValue: true },
          },
        ],
        combinator: "and",
      },
      options: {},
    },
  });
}

if (!nodes.some((n) => n.name === "Send without attachment")) {
  // Same credentials and fields as the award-letter node, minus the binary.
  const { attachmentsUi, ...optionsWithoutAttachments } = gmail.parameters.options ?? {};
  void attachmentsUi;
  nodes.push({
    id: "gmailplain",
    name: "Send without attachment",
    type: gmail.type,
    typeVersion: gmail.typeVersion,
    position: [gmail.position?.[0] ?? 400, (gmail.position?.[1] ?? 0) + 180],
    parameters: { ...gmail.parameters, options: optionsWithoutAttachments },
    credentials: gmail.credentials,
    notes: "For mail that carries no document, such as the Fondo form request.",
  });
}

const connections = {
  ...w.connections,
  "Decode attachment": { main: [[{ node: "Has an attachment?", type: "main", index: 0 }]] },
  "Has an attachment?": {
    main: [
      [{ node: gmail.name, type: "main", index: 0 }],
      [{ node: "Send without attachment", type: "main", index: 0 }],
    ],
  },
  "Send without attachment": { main: [[{ node: "Respond", type: "main", index: 0 }]] },
};

await n8n(`/workflows/${ID}`, {
  method: "PUT",
  body: JSON.stringify({ name: w.name, nodes, connections, settings: w.settings }),
});
console.log("patched. nodes now:");
for (const n of nodes) console.log(`  ${n.name}`);
