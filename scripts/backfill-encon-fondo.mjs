/**
 * Make the migrated Encon Fondo cases reviewable.
 *
 * The 37 Encon polizas loaded by hand on 6-7 Oct 2026 sit in "Submitted -
 * pending review", but the loader put each PDF straight into Poliza (14) and
 * left Submitted Poliza (40) empty. Approve copies 40 onto the record, so it
 * failed on every one. They also had no Awarded Amount (12), so the review page
 * had nothing to compare the poliza against.
 *
 * For each such case this writes:
 *   - 40 Submitted Poliza  <- a copy of the file in 14 (the bytes, not a link)
 *   - 12 Awarded Amount    <- the sum of the subcontractor's field-work POs on
 *                             the job (Total Builder Cost, 112). Scoping,
 *                             Xactimate, inspection and professional-service
 *                             POs are left out: they need no Fondo coverage.
 *   - 16 Comments          <- one line saying what was set and from which POs
 *
 * Nothing else changes: status stays "Submitted - pending review", and 13/14
 * keep what the loader wrote. Approving re-writes them from the staged copy.
 *
 * Dry run by default. `--apply` writes. `--only=119,120` limits the cases.
 */
import { readFileSync, writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7)
  .split(",").map(Number).filter(Boolean);
const VENDOR = 2426; // Encon Company Inc
const NON_FIELD = /xactimate|scoping|scope change serv|inspection|professional|recon|site walk|feasibility/i;

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
const v = (r, f) => r[f]?.value;
const money = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

async function query(body) {
  const res = await fetch("https://api.quickbase.com/v1/records/query", {
    method: "POST", headers: H, body: JSON.stringify({ ...body, options: { top: 5000 } }),
  });
  if (!res.ok) throw new Error(`query ${res.status}: ${await res.text()}`);
  return (await res.json()).data ?? [];
}

async function fileBytes(value) {
  const m = String(value?.url ?? "").match(/^\/files\/([a-z0-9]+)\/(\d+)\/(\d+)\/(\d+)/i);
  if (!m) return null;
  const res = await fetch(`https://api.quickbase.com/v1/files/${m[1]}/${m[2]}/${m[3]}/${m[4]}`, { headers: H });
  if (!res.ok) return null;
  const data = (await res.text()).trim(); // base64
  const versions = value.versions ?? [];
  const current = versions.find((x) => Number(x.versionNumber) === Number(m[4])) ?? versions.at(-1);
  return { fileName: current?.fileName || "poliza.pdf", data, bytes: Buffer.from(data, "base64").length };
}

const cases = (await query({
  from: "bwa4ktcq6",
  select: [3, 6, 12, 13, 14, 16, 22, 30, 38, 40],
  where: `{38.EX.'Submitted - pending review'}AND{30.EX.${VENDOR}}`,
})).filter((c) => !ONLY.length || ONLY.includes(v(c, 3)));

const jobs = [...new Set(cases.map((c) => v(c, 22)))];
const pos = jobs.length
  ? await query({
      from: "bukmrrvkz",
      select: [3, 6, 13, 15, 17, 21, 112],
      where: `(${jobs.map((j) => `{13.EX.${j}}`).join("OR")})AND{21.EX.${VENDOR}}`,
    })
  : [];

const today = new Date().toISOString().slice(0, 10);
const plan = [];
for (const c of cases) {
  const rid = v(c, 3);
  const field = pos.filter((p) => v(p, 13) === v(c, 22) && !NON_FIELD.test(v(p, 6) ?? "") && (v(p, 112) ?? 0) > 0);
  const award = Math.round(field.reduce((a, p) => a + v(p, 112), 0) * 100) / 100;
  const policy = v(c, 13) ?? 0;
  const file = await fileBytes(v(c, 14));
  const staged = (v(c, 40)?.versions ?? []).length > 0;
  const problems = [];
  if (!file || file.bytes < 100) problems.push("Poliza (14) could not be read");
  if (!field.length) problems.push("no field-work PO on the job");
  if (v(c, 12)) problems.push(`Awarded Amount already ${v(c, 12)}`);
  if (staged) problems.push("Submitted Poliza (40) already has a file");
  plan.push({
    rid, caseNumber: v(c, 6), policy, award, diff: Math.round((policy - award) * 100) / 100,
    pos: field.map((p) => `${v(p, 17)} ${money(v(p, 112))}${v(p, 15) === "Released" ? "" : ` (${v(p, 15)})`}`),
    file: file ? `${file.fileName} (${Math.round(file.bytes / 1024)} KB)` : "",
    problems, _file: file, _comments: v(c, 16) ?? "",
  });
}

const header = ["Record", "Case", "Policy amount", "Award (field POs)", "Policy - award", "POs", "File to stage", "Problems"];
const rows = plan.map((p) => [p.rid, p.caseNumber, p.policy, p.award, p.diff, p.pos.join("; "), p.file, p.problems.join("; ")]);
const csv = [header, ...rows].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\r\n");
const out = process.argv.find((a) => a.startsWith("--csv="))?.slice(6);
if (out) writeFileSync(out, csv);

console.log(`${plan.length} case(s). ${plan.filter((p) => p.problems.length).length} with problems. ${APPLY ? "APPLYING." : "Dry run: nothing written."}`);
for (const p of plan) {
  console.log(`${p.rid} ${p.caseNumber}  policy ${money(p.policy)}  award ${money(p.award)}  ${p.diff < 0 ? `SHORT ${money(-p.diff)}` : "covers"}${p.problems.length ? `  !! ${p.problems.join("; ")}` : ""}`);
}

if (APPLY) {
  let ok = 0;
  for (const p of plan) {
    if (p.problems.length) { console.log(`skip ${p.rid}: ${p.problems.join("; ")}`); continue; }
    const note = `Fondo backfill ${today}: Awarded Amount ${money(p.award)} = Encon field-work POs ${p.pos.join(", ")}. Poliza copied to Submitted Poliza so it can be approved.`;
    const res = await fetch("https://api.quickbase.com/v1/records", {
      method: "POST", headers: H,
      body: JSON.stringify({
        to: "bwa4ktcq6",
        mergeFieldId: 3,
        fieldsToReturn: [3],
        data: [{
          3: { value: p.rid },
          12: { value: p.award },
          40: { value: { fileName: p._file.fileName, data: p._file.data } },
          16: { value: p._comments ? `${p._comments}\n${note}` : note },
        }],
      }),
    });
    const body = await res.json().catch(() => ({}));
    // QB answers 200 even when it rejected the row; lineErrors is the truth.
    const errs = body?.metadata?.lineErrors;
    if (!res.ok || (errs && Object.keys(errs).length)) {
      console.log(`FAILED ${p.rid}: ${res.status} ${JSON.stringify(errs ?? body).slice(0, 300)}`);
    } else ok++;
  }
  console.log(`written ${ok} of ${plan.length}`);
}
