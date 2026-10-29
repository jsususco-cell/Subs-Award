/**
 * One Fondo record per field-work PO (user decision, 30 Oct 2026): tie every
 * existing record to the one PO it is for.
 *
 * For each record with no Fondo PO Record ID (49) yet, the PO is chosen from
 * the subcontractor's POs on that job, in this order:
 *   1. the "Purchase order #<id>" an award made in the app wrote in Comments;
 *   2. the only field-work PO the pair has;
 *   3. the field-work PO whose poliza amount matches the record's poliza
 *      (Insurance Amount 13, else Submitted Insurance Amount 39) to within $1
 *      or 0.5%;
 *   4. several field-work POs and one poliza that covers them all: the record
 *      goes to the largest PO and a NEW record is made for each other PO,
 *      with the same document(s) and that PO's share of the poliza amount;
 *   5. several field-work POs and no poliza yet: the largest PO (the others
 *      show on Send link as needing their own);
 *   anything else (a poliza covering only part) is left for a person.
 *
 * Writes, for each tied record: 49 PO record id, 50 PO number, and 12 Awarded
 * Amount = what that PO's poliza must cover (Required Fondo Coverage, else the
 * PO's Total Builder Cost).
 *
 * Dry run by default; `--apply` writes. `--csv=<path>` saves the plan.
 */
import { readFileSync, writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const CSV = (process.argv.find((a) => a.startsWith("--csv=")) ?? "").slice(6);

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
const n = (r, f) => Number(v(r, f)) || 0;
const s = (r, f) => (v(r, f) == null ? "" : String(v(r, f))).trim();
const norm = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const round = (x) => Math.round(x * 100) / 100;

// Same rule as src/lib/fondo.ts (isFieldWorkTitle / poFondoAmount).
const FIELD_CORE =
  /award|reconstr|relocat|relocaci|demol|demolici|repair|rehab|cambio de orden|change order|orden de cambio|movilizaci|mobiliz/i;
const FIELD_OTHER =
  /lead|abatement|asbestos abat|slab|retaining|photovolt|mitigation|window|septic|cistern|roof|solar|cabinet|tile|paint|pv /i;
const FEE = /xactimate|scoping|scope change serv|inspection|professional|\brecon\b|site walk|feasibility/i;
const isField = (t) => (FIELD_CORE.test(t) || FIELD_OTHER.test(t)) && !FEE.test(t);
const poAmount = (p) => round(n(p, 294) > 0 ? n(p, 294) : n(p, 112) > 0 ? n(p, 112) : 0);

/** Split an amount by weights, to the cent, adding up exactly (as splitByShare). */
function share(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = weights.map((w) => round(sum > 0 ? (total * w) / sum : total / weights.length));
  out[out.length - 1] = round(out[out.length - 1] + round(total - out.reduce((a, b) => a + b, 0)));
  return out;
}

async function query(body) {
  const res = await fetch("https://api.quickbase.com/v1/records/query", {
    method: "POST", headers: H, body: JSON.stringify({ ...body, options: { top: 20000 } }),
  });
  if (!res.ok) throw new Error(`query ${res.status}: ${await res.text()}`);
  return (await res.json()).data ?? [];
}

async function fileOf(value) {
  const m = String(value?.url ?? "").match(/^\/files\/([a-z0-9]+)\/(\d+)\/(\d+)\/(\d+)/i);
  if (!m) return null;
  const res = await fetch(`https://api.quickbase.com/v1/files/${m[1]}/${m[2]}/${m[3]}/${m[4]}`, { headers: H });
  if (!res.ok) return null;
  const versions = value.versions ?? [];
  const cur = versions.find((x) => Number(x.versionNumber) === Number(m[4])) ?? versions.at(-1);
  return { fileName: cur?.fileName || "poliza.pdf", data: (await res.text()).trim() };
}

// Plain fields copied onto the extra records a split makes (files separately).
const COPY = [6, 8, 11, 17, 18, 22, 30, 38, 41, 42, 43, 44, 45, 46, 47, 48];

const cases = await query({
  from: "bwa4ktcq6",
  select: [3, 6, 8, 11, 12, 13, 14, 16, 17, 18, 22, 30, 31, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49],
  where: "{49.EX.''}",
});
const jobs = [...new Set(cases.map((c) => n(c, 22)).filter(Boolean))];
const pos = [];
for (let i = 0; i < jobs.length; i += 80) {
  pos.push(
    ...(await query({
      from: "bukmrrvkz",
      select: [3, 6, 13, 15, 16, 17, 21, 22, 112, 294],
      where: jobs.slice(i, i + 80).map((j) => `{13.EX.${j}}`).join("OR"),
    })),
  );
}

const taken = new Set(); // POs already claimed in this run
const plan = [];
for (const c of cases.sort((a, b) => n(a, 3) - n(b, 3))) {
  const onJob = pos.filter((p) => n(p, 13) === n(c, 22));
  let mine = onJob.filter((p) => n(p, 21) === n(c, 30));
  if (!mine.length) {
    const nm = norm(s(c, 31) || s(c, 8)).slice(0, 12);
    mine = nm ? onJob.filter((p) => norm(s(p, 22)).startsWith(nm)) : [];
  }
  const field = mine.filter((p) => isField(s(p, 6)) && !taken.has(n(p, 3)));
  const target = n(c, 13) > 0 ? n(c, 13) : n(c, 39);
  let pick = null;
  let how = "";
  let extra = [];
  let mainShare = 0;

  const fromComment = /Purchase order #(\d+)/.exec(s(c, 16));
  if (fromComment) {
    pick = mine.find((p) => n(p, 3) === Number(fromComment[1])) ?? null;
    how = pick ? "award made in the app" : "";
  }
  if (!pick && field.length === 1) {
    pick = field[0];
    how = "only field-work PO";
  }
  if (!pick && field.length > 1 && target > 0) {
    const close = field.filter((p) => Math.abs(poAmount(p) - target) <= Math.max(1, target * 0.005));
    if (close.length === 1) {
      pick = close[0];
      how = `poliza amount matches (${round(target)})`;
    }
  }
  if (!pick && field.length > 1) {
    const byAmount = [...field].sort((a, b) => poAmount(b) - poAmount(a));
    const sum = round(field.reduce((t, p) => t + poAmount(p), 0));
    if (target > 0 && target >= sum - 1) {
      pick = byAmount[0];
      how = `one poliza covers all ${field.length} POs: split`;
      const shares = share(target, byAmount.map(poAmount));
      mainShare = shares[0];
      extra = byAmount.slice(1).map((p, i) => ({ po: p, share: shares[i + 1] }));
    } else if (!(target > 0)) {
      pick = byAmount[0];
      how = `no poliza yet: largest of ${field.length} POs`;
    }
  }
  const others = mine.filter((p) => isField(s(p, 6)) && p !== pick && !extra.some((e) => e.po === p));
  if (pick) taken.add(n(pick, 3));
  for (const e of extra) taken.add(n(e.po, 3));
  plan.push({
    rid: n(c, 3),
    caseNumber: s(c, 6),
    sub: s(c, 8),
    status: s(c, 38) || "(blank)",
    poliza: round(target),
    awardedBefore: round(n(c, 12)),
    po: pick ? s(pick, 17) : "",
    poRid: pick ? n(pick, 3) : 0,
    poTitle: pick ? s(pick, 6) : "",
    awardedAfter: pick ? poAmount(pick) : round(n(c, 12)),
    how: pick
      ? how
      : field.length
        ? `${field.length} field-work POs, poliza covers only part: for a person`
        : "no field-work PO for this sub on the job",
    otherPos: others.map((p) => `${s(p, 17)} ${s(p, 6)} $${poAmount(p)} [${s(p, 15)}/${s(p, 16) || "-"}]`).join("; "),
    extra,
    mainShare,
    row: c,
    newRecords: extra.map((e) => `${s(e.po, 17)} ${s(e.po, 6)} awarded $${poAmount(e.po)}, poliza share $${e.share}`).join("; "),
  });
}

const tied = plan.filter((p) => p.poRid);
const untied = plan.filter((p) => !p.poRid);
const splits = plan.filter((p) => p.extra.length);
const changed = tied.filter((p) => p.awardedAfter !== p.awardedBefore);
console.log(`${plan.length} records without a PO. Tie ${tied.length}; leave ${untied.length} for a person. Awarded changes on ${changed.length}.`);
console.log(`Splits: ${splits.length} records -> ${splits.reduce((t, p) => t + p.extra.length, 0)} new records (one per extra PO, same document, its share).`);
console.log(`Other field-work POs left without a record (show on Send link when open + released): on ${tied.filter((p) => p.otherPos).length} records.`);

if (CSV) {
  const head = ["Record", "Case", "Sub", "Status", "Poliza on file", "PO", "PO title", "How", "Awarded before", "Awarded after", "New records (split)", "Other field-work POs"];
  const rows = plan.map((p) => [p.rid, p.caseNumber, p.sub, p.status, p.poliza, p.po, p.poTitle, p.how, p.awardedBefore, p.awardedAfter, p.newRecords, p.otherPos]);
  writeFileSync(CSV, [head, ...rows].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\r\n"));
  console.log(`plan saved to ${CSV}`);
}

async function write(record, merge) {
  const res = await fetch("https://api.quickbase.com/v1/records", {
    method: "POST", headers: H,
    body: JSON.stringify({ to: "bwa4ktcq6", ...(merge ? { mergeFieldId: 3 } : {}), fieldsToReturn: [3], data: [record] }),
  });
  const body = await res.json().catch(() => ({}));
  const errs = body?.metadata?.lineErrors; // a 200 can still carry a rejected row
  if (!res.ok || (errs && Object.keys(errs).length)) throw new Error(JSON.stringify(errs ?? body).slice(0, 200));
  return body?.metadata?.createdRecordIds?.[0] ?? 0;
}

if (APPLY) {
  let ok = 0;
  let made = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const p of tied) {
    try {
      const rec = { 3: { value: p.rid }, 49: { value: p.poRid }, 50: { value: p.po }, 12: { value: p.awardedAfter } };
      if (p.extra.length) {
        // This record keeps its share of the poliza; each other PO gets a copy.
        if (n(p.row, 13) > 0) rec[13] = { value: p.mainShare };
        if (n(p.row, 39) > 0) rec[39] = { value: p.mainShare };
        rec[16] = { value: `${s(p.row, 16)}\nSplit per PO ${today}: this record is for ${p.po}; also ${p.newRecords}.`.trim() };
      }
      await write(rec, true);
      ok++;
      if (p.extra.length) {
        const f14 = v(p.row, 14)?.versions?.length ? await fileOf(v(p.row, 14)) : null;
        const f40 = v(p.row, 40)?.versions?.length ? await fileOf(v(p.row, 40)) : null;
        for (const e of p.extra) {
          const nr = {};
          for (const f of COPY) {
            const x = v(p.row, f);
            if (x == null || x === "" || (typeof x === "object" && !Array.isArray(x))) continue;
            nr[f] = { value: x };
          }
          nr[49] = { value: n(e.po, 3) };
          nr[50] = { value: s(e.po, 17) };
          nr[12] = { value: poAmount(e.po) };
          if (n(p.row, 13) > 0) nr[13] = { value: e.share };
          if (n(p.row, 39) > 0) nr[39] = { value: e.share };
          if (f14) nr[14] = { value: f14 };
          if (f40) nr[40] = { value: f40 };
          nr[16] = { value: `Split per PO ${today} from record ${p.rid} (${p.caseNumber}): same poliza, this record is for ${s(e.po, 17)} with its share $${e.share}.` };
          await write(nr, false);
          made++;
        }
      }
    } catch (err) {
      console.log(`FAILED ${p.rid}: ${err.message}`);
    }
  }
  console.log(`tied ${ok} of ${tied.length}; new split records ${made}`);
}
