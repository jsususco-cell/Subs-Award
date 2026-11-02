/**
 * Copy every Fondo poliza already in Quickbase into Google Drive:
 *
 *   Fondo Poliza / <case number> / "<PO> - <subcontractor> - <STATUS> - <date>.pdf"
 *
 * One file per record: the approved / on-file poliza (14) when there is one,
 * otherwise the latest submission (40). STATUS is APPROVED, ON FILE (older
 * polizas never reviewed here), SUBMITTED or RETURNED. Records already filed
 * directly in Fondo Poliza are skipped, so re-running only adds what is missing.
 * The record's Drive fields (34-37) are updated to point at the new copy.
 *
 * Goes through the n8n workflow "Subs Award — Fondo poliza to Drive".
 * Dry run by default; `--apply` uploads.
 */
import { readFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const ROOT = "13hReruRL566lvBqzUUW3rSs3n2-0xzrf";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const H = {
  "QB-Realm-Hostname": env.QB_REALM || env.QB_REALM_HOSTNAME,
  Authorization: `QB-USER-TOKEN ${env.QB_USER_TOKEN || env.QB_TOKEN}`,
  "Content-Type": "application/json",
};
const HOOK = `${new URL(env.N8N_SEND_WEBHOOK_URL).origin}/webhook/fondo-poliza-drive`;
const v = (r, f) => r[f]?.value;
const s = (r, f) => (v(r, f) == null ? "" : String(v(r, f))).trim();
const clean = (x) => String(x ?? "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();

async function hook(body) {
  const res = await fetch(HOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-send-key": env.LETTER_SEND_KEY },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const out = (() => { try { return JSON.parse(text); } catch { return {}; } })();
  if (!res.ok || out.ok !== true) throw new Error(`drive ${res.status}: ${text.slice(0, 160)}`);
  return out;
}

function currentFile(value) {
  const versions = value?.versions ?? [];
  if (!versions.length) return null;
  const m = String(value.url ?? "").match(/^\/files\/([a-z0-9]+)\/(\d+)\/(\d+)\/(\d+)/i);
  if (!m) return null;
  const cur = versions.find((x) => Number(x.versionNumber) === Number(m[4])) ?? versions.at(-1);
  return { m, fileName: cur?.fileName || "poliza.pdf", uploaded: cur?.uploaded || "" };
}

const rows = (await (await fetch("https://api.quickbase.com/v1/records/query", {
  method: "POST", headers: H,
  body: JSON.stringify({ from: "bwa4ktcq6", select: [3, 6, 8, 14, 34, 37, 38, 40, 42, 45, 50], options: { top: 5000 } }),
})).json()).data;

// Which folders already sit directly in Fondo Poliza.
const parentOf = new Map();
async function inFondo(folderId) {
  if (!folderId) return false;
  if (!parentOf.has(folderId)) {
    try { parentOf.set(folderId, (await hook({ action: "parent", fileId: folderId })).parentId); }
    catch { parentOf.set(folderId, null); }
  }
  return parentOf.get(folderId) === ROOT;
}

const plan = [];
let already = 0;
for (const r of rows) {
  const approvedFile = currentFile(v(r, 14));
  const submittedFile = currentFile(v(r, 40));
  const status = s(r, 38);
  const pick =
    status === "Approved" || (!status && approvedFile)
      ? approvedFile ?? submittedFile
      : submittedFile ?? approvedFile;
  if (!pick) continue;
  if (s(r, 37) && (await inFondo(s(r, 34)))) { already++; continue; }
  const label = status === "Approved" ? "APPROVED" : !status ? "ON FILE" : status === "Returned for correction" ? "RETURNED" : "SUBMITTED";
  const when = (s(r, 45) || s(r, 42) || pick.uploaded || new Date().toISOString()).slice(0, 10);
  const ext = /\.([a-z0-9]{2,5})$/i.exec(pick.fileName)?.[1]?.toLowerCase() ?? "pdf";
  plan.push({
    rid: v(r, 3),
    caseNumber: s(r, 6) || "Sin caso",
    name: `${clean(s(r, 50)) || "sin PO"} - ${clean(s(r, 8)) || "Subcontratista"} - ${label} - ${when}.${ext}`,
    ext,
    m: pick.m,
  });
}

console.log(`${rows.length} records; ${plan.length} polizas to copy; ${already} already in Fondo Poliza.`);
const byLabel = {};
for (const p of plan) { const k = p.name.split(" - ").at(-2); byLabel[k] = (byLabel[k] || 0) + 1; }
console.log("by status:", JSON.stringify(byLabel), "| case folders:", new Set(plan.map((p) => p.caseNumber)).size);
for (const p of plan.slice(0, 5)) console.log("  e.g.", `${p.caseNumber} / ${p.name}`);

if (APPLY) {
  let ok = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const p of plan) {
    try {
      const fr = await fetch(`https://api.quickbase.com/v1/files/${p.m[1]}/${p.m[2]}/${p.m[3]}/${p.m[4]}`, { headers: H });
      if (!fr.ok) throw new Error(`quickbase file ${fr.status}`);
      const data = (await fr.text()).trim();
      const mime = p.ext === "pdf" ? "application/pdf" : p.ext === "png" ? "image/png" : /jpe?g/.test(p.ext) ? "image/jpeg" : "application/octet-stream";
      const out = await hook({ action: "upload", caseNumber: p.caseNumber, fileName: p.name, mimeType: mime, data });
      const res = await fetch("https://api.quickbase.com/v1/records", {
        method: "POST", headers: H,
        body: JSON.stringify({ to: "bwa4ktcq6", mergeFieldId: 3, fieldsToReturn: [3], data: [{
          3: { value: p.rid }, 37: { value: out.fileId }, 34: { value: out.folderId }, 35: { value: "MIRRORED" }, 36: { value: today },
        }] }),
      });
      const body = await res.json();
      const errs = body?.metadata?.lineErrors; // a 200 can still carry a rejected row
      if (!res.ok || (errs && Object.keys(errs).length)) throw new Error(`stamp: ${JSON.stringify(errs ?? body).slice(0, 160)}`);
      ok++;
      if (ok % 20 === 0) console.log(`  ${ok}/${plan.length}`);
    } catch (e) {
      console.log(`FAILED ${p.rid} ${p.caseNumber}: ${e.message}`);
    }
  }
  console.log(`copied ${ok} of ${plan.length}`);
}
