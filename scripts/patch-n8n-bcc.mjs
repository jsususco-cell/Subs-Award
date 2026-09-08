/**
 * Teach the send workflow to carry a blind copy.
 *
 * The app blind-copies the office on award letters and approvals. Blind
 * matters: the archive address is internal and a Cc would disclose it to every
 * subcontractor. The Gmail nodes only handled ccList, so a bcc in the payload
 * was silently dropped -- the send succeeded and the copy never arrived.
 */
import { n8n } from "./n8n.mjs";

const ID = "e7NoxLszPJPsnrpk";
const w = await n8n(`/workflows/${ID}`);

const nodes = w.nodes.map((n) => {
  if (n.name === "Decode attachment") {
    const jsCode = n.parameters.jsCode.replace(
      "    cc: (req.cc ?? []).join(', '),",
      "    cc: (req.cc ?? []).join(', '),\n    bcc: (req.bcc ?? []).join(', '),",
    );
    if (!jsCode.includes("bcc:")) throw new Error("could not add bcc to the decode node");
    return { ...n, parameters: { ...n.parameters, jsCode } };
  }
  if (n.type === "n8n-nodes-base.gmail") {
    return {
      ...n,
      parameters: {
        ...n.parameters,
        options: { ...(n.parameters.options ?? {}), bccList: "={{ $json.bcc }}" },
      },
    };
  }
  return n;
});

await n8n(`/workflows/${ID}`, {
  method: "PUT",
  body: JSON.stringify({ name: w.name, nodes, connections: w.connections, settings: w.settings }),
});

// A PUT drops the webhook registration on this instance; re-register it.
await n8n(`/workflows/${ID}/deactivate`, { method: "POST" });
await n8n(`/workflows/${ID}/activate`, { method: "POST" });

const after = await n8n(`/workflows/${ID}`);
console.log("active:", after.active);
for (const n of after.nodes.filter((x) => x.type === "n8n-nodes-base.gmail")) {
  console.log(`  ${n.name}: bccList = ${n.parameters.options?.bccList}`);
}
console.log("  decode passes bcc:", after.nodes.find((n) => n.name === "Decode attachment").parameters.jsCode.includes("bcc:"));
