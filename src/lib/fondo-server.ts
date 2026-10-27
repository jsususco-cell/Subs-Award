import "server-only";
import { QB_CONFIG, isConfigured, queryAll } from "./quickbase";
import { QB_AWARD } from "./qb-award";
import {
  FONDO_FIELDS,
  currentFile,
  FONDO_STATUS,
  type FondoCase,
  type FondoStatus,
  fondoConfigured,
  rejectManualSend,
  fondoGap,
  isOpenAward,
  normName,
  fondoNoEmailReason,
  fondoHiddenSub,
  reminderDue,
} from "./fondo";

/**
 * Server side of the Fondo submittal form.
 *
 * Subcontractors have no Quickbase login, so the form is reached with the
 * vendor's existing AccessKey — the same token the vendor portal uses, rather
 * than a second secret to leak. The key alone is not enough: the submittal has
 * to belong to that vendor, so a key paired with someone else's case id is
 * refused. That keeps a shared link scoped to one case.
 */

/** Subs/Vendors: the AccessKey the portal already issues. */
const VENDOR_TABLE = "buskqh272";
const VENDOR_ACCESS_KEY = 66;
const VENDOR_COMPANY = 23;
const VENDOR_EMAIL = 28;

export interface Vendor {
  recordId: number;
  company: string;
  email: string;
}

type QbRow = Record<string, { value: unknown }>;

function val(rec: QbRow, fid: number): unknown {
  return rec[String(fid)]?.value;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0;
}


/**
 * The vendor an access key belongs to.
 *
 * Keys are 64-hex and compared exactly. A short or malformed key is rejected
 * before it reaches Quickbase rather than being sent as a query fragment.
 */
export async function vendorForKey(accessKey: string): Promise<Vendor | null> {
  if (!isConfigured()) return null;
  if (!/^[a-f0-9]{32,80}$/i.test(accessKey)) return null;

  const rows = await queryAll({
    from: VENDOR_TABLE,
    select: [3, VENDOR_COMPANY, VENDOR_EMAIL],
    where: `{${VENDOR_ACCESS_KEY}.EX.'${accessKey}'}`,
  });
  const r = rows[0];
  if (!r) return null;
  return {
    recordId: num(val(r, 3)),
    company: str(val(r, VENDOR_COMPANY)).trim(),
    email: str(val(r, VENDOR_EMAIL)).trim(),
  };
}

/**
 * Load one submittal, but only if it belongs to this vendor.
 *
 * Ownership is checked in the query rather than after it, so a mismatch
 * returns nothing at all instead of loading someone else's case and then
 * deciding not to show it.
 */
export async function caseForVendor(
  vendor: Vendor,
  recordId: number,
): Promise<FondoCase | null> {
  if (!fondoConfigured()) return null;
  const ins = QB_AWARD.insurance;

  const rows = await queryAll({
    from: QB_AWARD.tables.insurance,
    select: [
      ins.recordId,
      ins.caseNumber,
      23, // Job Name (lookup)
      ins.subcontractorName,
      ins.awardedAmount,
      FONDO_FIELDS.status,
      FONDO_FIELDS.reviewNotes,
      FONDO_FIELDS.submittedAmount,
      FONDO_FIELDS.submittedPolicyNumber,
      FONDO_FIELDS.submittedPoliza,
    ],
    where: `{${ins.recordId}.EX.${recordId}}AND{${ins.relatedSub}.EX.${vendor.recordId}}`,
  });
  const r = rows[0];
  if (!r) return null;

  const fileName = currentFile(val(r, FONDO_FIELDS.submittedPoliza)).name;

  return {
    recordId: num(val(r, ins.recordId)),
    caseNumber: str(val(r, ins.caseNumber)).trim(),
    jobName: str(val(r, 23)).trim(),
    subcontractor: str(val(r, ins.subcontractorName)).trim() || vendor.company,
    awardedAmount: num(val(r, ins.awardedAmount)),
    status: (str(val(r, FONDO_FIELDS.status)) as FondoStatus) || FONDO_STATUS.awaiting,
    reviewNotes: str(val(r, FONDO_FIELDS.reviewNotes)),
    submittedAmount: num(val(r, FONDO_FIELDS.submittedAmount)),
    submittedPolicyNumber: str(val(r, FONDO_FIELDS.submittedPolicyNumber)),
    submittedFileName: fileName,
  };
}

/** Apply a record patch to the submittal table. */
export async function updateSubmittal(
  record: Record<string, { value: unknown }>,
): Promise<void> {
  const res = await fetch("https://api.quickbase.com/v1/records", {
    method: "POST",
    headers: {
      "QB-Realm-Hostname": QB_CONFIG.realm,
      Authorization: `QB-USER-TOKEN ${QB_CONFIG.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: QB_AWARD.tables.insurance,
      data: [record],
      // Merging on Record ID# updates rather than inserting a duplicate.
      mergeFieldId: QB_AWARD.insurance.recordId,
      fieldsToReturn: [QB_AWARD.insurance.recordId],
    }),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Quickbase ${res.status}: ${text.slice(0, 300)}`);
  }
  const body = JSON.parse(text) as {
    metadata?: { lineErrors?: unknown; updatedRecordIds?: number[] };
  };
  const errors = body.metadata?.lineErrors;
  if (errors && Object.keys(errors).length) {
    throw new Error(`Quickbase rejected the update: ${JSON.stringify(errors).slice(0, 300)}`);
  }
}

/** A case waiting for its form link to go out. */
export interface PendingNotice {
  recordId: number;
  caseNumber: string;
  subcontractor: string;
  awardedAmount: number;
  vendorRecordId: number;
  accessKey: string;
  email: string;
}

/**
 * Cases awarded but not yet asked for their poliza.
 *
 * The Form Sent stamp is what stops a subcontractor being mailed twice for one
 * case: the sender stamps it immediately after a successful send, so a later
 * run skips it. Cases whose vendor has no access key or no email address are
 * left out and reported rather than silently dropped — somebody has to fix
 * those by hand.
 */
export async function pendingNotices(limit = 25): Promise<{
  ready: PendingNotice[];
  unreachable: { recordId: number; caseNumber: string; reason: string }[];
}> {
  const ins = QB_AWARD.insurance;
  const rows = await queryAll({
    from: QB_AWARD.tables.insurance,
    select: [
      ins.recordId,
      ins.caseNumber,
      ins.subcontractorName,
      ins.awardedAmount,
      ins.relatedSub,
    ],
    where: `{${FONDO_FIELDS.status}.EX.'${FONDO_STATUS.awaiting}'}AND{${FONDO_FIELDS.formSentAt}.EX.''}`,
  });

  const ready: PendingNotice[] = [];
  const unreachable: { recordId: number; caseNumber: string; reason: string }[] = [];

  for (const r of rows.slice(0, limit)) {
    const recordId = num(val(r, ins.recordId));
    const caseNumber = str(val(r, ins.caseNumber)).trim();
    const vendorRecordId = num(val(r, ins.relatedSub));

    const vendors = vendorRecordId
      ? await queryAll({
          from: VENDOR_TABLE,
          select: [3, VENDOR_ACCESS_KEY, VENDOR_COMPANY, VENDOR_EMAIL],
          where: `{3.EX.${vendorRecordId}}`,
        })
      : [];
    const v = vendors[0];
    const accessKey = v ? str(val(v, VENDOR_ACCESS_KEY)).trim() : "";
    const email = v ? str(val(v, VENDOR_EMAIL)).trim() : "";

    if (!v) {
      unreachable.push({ recordId, caseNumber, reason: "no subcontractor on the case" });
      continue;
    }
    if (fondoHiddenSub(str(val(v, VENDOR_COMPANY)) || str(val(r, ins.subcontractorName)))) {
      unreachable.push({ recordId, caseNumber, reason: "excluded from Fondo emails" });
      continue;
    }
    if (!accessKey) {
      unreachable.push({ recordId, caseNumber, reason: "the subcontractor has no access key" });
      continue;
    }
    if (!email) {
      unreachable.push({ recordId, caseNumber, reason: "the subcontractor has no email address" });
      continue;
    }

    ready.push({
      recordId,
      caseNumber,
      subcontractor:
        str(val(r, ins.subcontractorName)).trim() || str(val(v, VENDOR_COMPANY)).trim(),
      awardedAmount: num(val(r, ins.awardedAmount)),
      vendorRecordId,
      accessKey,
      email,
    });
  }

  return { ready, unreachable };
}

/** One row of the reviewer's queue. */
export interface ReviewItem {
  recordId: number;
  caseNumber: string;
  jobName: string;
  subcontractor: string;
  awardedAmount: number;
  submittedAmount: number;
  submittedPolicyNumber: string;
  submittedBy: string;
  submittedAt: string;
  polizaUrl: string;
  polizaName: string;
}

/** Everything sitting in "submitted, pending review", oldest first. */
export async function reviewQueue(): Promise<ReviewItem[]> {
  const ins = QB_AWARD.insurance;
  const rows = await queryAll({
    from: QB_AWARD.tables.insurance,
    select: [
      ins.recordId,
      ins.caseNumber,
      23,
      ins.subcontractorName,
      ins.awardedAmount,
      ins.submittedBy,
      FONDO_FIELDS.submittedAmount,
      FONDO_FIELDS.submittedPolicyNumber,
      FONDO_FIELDS.submittedAt,
      FONDO_FIELDS.submittedPoliza,
    ],
    where: `{${FONDO_FIELDS.status}.EX.'${FONDO_STATUS.submitted}'}`,
  });

  return rows
    .map((r) => {
      // The current version, not the first: see currentFile above.
      const { name: polizaName, url: polizaUrl } = currentFile(
        val(r, FONDO_FIELDS.submittedPoliza),
        QB_CONFIG.realm,
      );
      return {
        recordId: num(val(r, ins.recordId)),
        caseNumber: str(val(r, ins.caseNumber)).trim(),
        jobName: str(val(r, 23)).trim(),
        subcontractor: str(val(r, ins.subcontractorName)).trim(),
        awardedAmount: num(val(r, ins.awardedAmount)),
        submittedAmount: num(val(r, FONDO_FIELDS.submittedAmount)),
        submittedPolicyNumber: str(val(r, FONDO_FIELDS.submittedPolicyNumber)),
        submittedBy: str(val(r, ins.submittedBy)).trim(),
        submittedAt: str(val(r, FONDO_FIELDS.submittedAt)).slice(0, 19).replace("T", " "),
        polizaUrl,
        polizaName,
      };
    })
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}

/** One row of the "send the link" list. */
export interface SendItem {
  /** Stable row key: `c<case id>`, or `p<PO id>` for an award with no case yet. */
  key: string;
  /** The Fondo case, or 0 when sending would have to create it. */
  recordId: number;
  /** The open award behind the row, when there is one. */
  poRecordId: number;
  poNumber: string;
  /**
   * case: still owed a poliza (awaiting, returned, never had one).
   * new: an open award with no Fondo case at all.
   * short: a poliza is on file but is less than the award needs.
   */
  kind: "case" | "new" | "short";
  caseNumber: string;
  jobName: string;
  subcontractor: string;
  /** What the poliza has to cover: the award plus approved change orders. */
  awardedAmount: number;
  onFile: number;
  gap: number;
  status: FondoStatus | "";
  formSentAt: string;
  /** Daily reminders sent since the link (0..7). */
  reminderCount: number;
  reviewNotes: string;
  /** Where the email goes. Blank means it cannot be sent until fixed. */
  email: string;
  /** Why it cannot be sent, when it cannot. Short: it sits in a table cell. */
  blocked: string;
}

/** An open award, read the way the Fondo Coverage page (code page 206) reads it. */
export interface OpenAward {
  poRecordId: number;
  poNumber: string;
  caseNumber: string;
  jobRecordId: number;
  subRecordId: number;
  subcontractor: string;
  required: number;
  onFile: number;
  gap: number;
  /** Fondo cases already on this job for this subcontractor, newest first. */
  caseRecordIds: number[];
}

const PO = {
  recordId: 3,
  title: 6,
  job: 13,
  number: 17,
  sub: 21,
  cancelled: 122,
  state: 129,
  stampedOnFile: 282,
  required: 294,
};
const JOB = { recordId: 3, status: 35, caseId: 919 };

/**
 * Every open award, with the Fondo cases that already exist for it.
 *
 * A case belongs to an award when it is on the same job for the same
 * subcontractor, or (how page 206 matches) has the same case number and
 * subcontractor name. Either is enough, so a case is never opened twice.
 */
export async function openAwards(): Promise<OpenAward[]> {
  const ins = QB_AWARD.insurance;
  const [pos, jobs, subs, cases] = await Promise.all([
    queryAll({
      from: QB_AWARD.tables.pos,
      select: Object.values(PO),
      where: `{${PO.state}.EX.'Puerto Rico'}AND{${PO.required}.GT.0}`,
    }),
    queryAll({
      from: QB_CONFIG.tables.jobs,
      select: Object.values(JOB),
      where: `{${JOB.caseId}.XEX.''}`,
    }),
    queryAll({ from: VENDOR_TABLE, select: [3, VENDOR_COMPANY] }),
    queryAll({
      from: QB_AWARD.tables.insurance,
      select: [
        ins.recordId,
        ins.caseNumber,
        ins.subcontractorName,
        ins.insuranceAmount,
        ins.relatedJob,
        ins.relatedSub,
        31, // Related Subcontractor - Company (lookup)
      ],
    }),
  ]);

  const jobBy = new Map(jobs.map((j) => [num(val(j, JOB.recordId)), j]));
  const subName = new Map(subs.map((s) => [num(val(s, 3)), str(val(s, VENDOR_COMPANY)).trim()]));

  const byIds = new Map<string, QbRow[]>();
  const byName = new Map<string, QbRow[]>();
  for (const c of cases) {
    const a = `${num(val(c, ins.relatedJob))}|${num(val(c, ins.relatedSub))}`;
    const b = `${str(val(c, ins.caseNumber)).trim()}|${normName(
      str(val(c, 31)) || str(val(c, ins.subcontractorName)),
    )}`;
    byIds.set(a, [...(byIds.get(a) ?? []), c]);
    byName.set(b, [...(byName.get(b) ?? []), c]);
  }

  const out: OpenAward[] = [];
  for (const p of pos) {
    const job = jobBy.get(num(val(p, PO.job)));
    const caseNumber = job ? str(val(job, JOB.caseId)).trim() : "";
    const subRecordId = num(val(p, PO.sub));
    const name = subName.get(subRecordId) ?? "";
    const required = num(val(p, PO.required));
    if (
      !isOpenAward({
        region: str(val(p, PO.state)),
        cancelled: val(p, PO.cancelled) === true,
        title: str(val(p, PO.title)),
        jobStatus: job ? str(val(job, JOB.status)) : "",
        caseNumber,
        required,
        subName: name,
      })
    ) {
      continue;
    }
    const mine = new Map<number, QbRow>();
    for (const c of [
      ...(byIds.get(`${num(val(p, PO.job))}|${subRecordId}`) ?? []),
      ...(byName.get(`${caseNumber}|${normName(name)}`) ?? []),
    ]) {
      mine.set(num(val(c, ins.recordId)), c);
    }
    const onFile = [...mine.values()].reduce((s, c) => s + num(val(c, ins.insuranceAmount)), 0);
    const stamped = num(val(p, PO.stampedOnFile));
    out.push({
      poRecordId: num(val(p, PO.recordId)),
      poNumber: str(val(p, PO.number)),
      caseNumber,
      jobRecordId: num(val(p, PO.job)),
      subRecordId,
      subcontractor: name,
      required: Math.round(required * 100) / 100,
      onFile: Math.round(Math.max(onFile, stamped) * 100) / 100,
      gap: fondoGap(required, stamped, onFile),
      caseRecordIds: [...mine.keys()].sort((a, b) => b - a),
    });
  }
  return out;
}

/**
 * Everything a staff member might send the form link for by hand:
 *
 *  - cases still owed a poliza (awaiting, returned, migrated without one);
 *  - open awards with no Fondo case at all, where sending opens the case first;
 *  - open awards whose poliza on file is short of what the award needs.
 *
 * The access key is resolved here and never leaves the server; the page only
 * learns whether the row is reachable.
 */
export async function sendQueue(): Promise<SendItem[]> {
  const ins = QB_AWARD.insurance;
  const [rows, awards] = await Promise.all([
    queryAll({
      from: QB_AWARD.tables.insurance,
      select: [
        ins.recordId,
        ins.caseNumber,
        23,
        ins.subcontractorName,
        ins.awardedAmount,
        ins.insuranceAmount,
        ins.poliza,
        ins.relatedSub,
        FONDO_FIELDS.status,
        FONDO_FIELDS.formSentAt,
        FONDO_FIELDS.reviewNotes,
        FONDO_FIELDS.reminderCount,
      ],
    }),
    openAwards(),
  ]);
  const caseBy = new Map(rows.map((r) => [num(val(r, ins.recordId)), r]));

  // A few vendor lookups for the lot, not one per row.
  const vendorIds = new Set<number>();
  rows.forEach((r) => vendorIds.add(num(val(r, ins.relatedSub))));
  awards.forEach((a) => vendorIds.add(a.subRecordId));
  vendorIds.delete(0);
  const vendors = new Map<number, { accessKey: string; email: string; company: string }>();
  const ids = [...vendorIds];
  for (let i = 0; i < ids.length; i += 100) {
    const vrows = await queryAll({
      from: VENDOR_TABLE,
      select: [3, VENDOR_ACCESS_KEY, VENDOR_COMPANY, VENDOR_EMAIL],
      where: ids
        .slice(i, i + 100)
        .map((id) => `{3.EX.${id}}`)
        .join("OR"),
    });
    for (const v of vrows) {
      vendors.set(num(val(v, 3)), {
        accessKey: str(val(v, VENDOR_ACCESS_KEY)).trim(),
        email: str(val(v, VENDOR_EMAIL)).trim(),
        company: str(val(v, VENDOR_COMPANY)).trim(),
      });
    }
  }
  const reach = (vendorId: number) => {
    const v = vendors.get(vendorId);
    return {
      email: v?.email ?? "",
      company: v?.company ?? "",
      blocked: !v
        ? "No subcontractor on the case"
        : fondoNoEmailReason(v.company) || (!v.accessKey ? "Vendor has no access key" : ""),
    };
  };

  const items = new Map<string, SendItem>();
  const fromCase = (r: QbRow, kind: SendItem["kind"], award?: OpenAward): SendItem => {
    const v = reach(num(val(r, ins.relatedSub)));
    const recordId = num(val(r, ins.recordId));
    return {
      key: `c${recordId}`,
      recordId,
      poRecordId: award?.poRecordId ?? 0,
      poNumber: award?.poNumber ?? "",
      kind,
      caseNumber: str(val(r, ins.caseNumber)).trim(),
      jobName: str(val(r, 23)).trim(),
      subcontractor: str(val(r, ins.subcontractorName)).trim() || v.company,
      awardedAmount: award?.required ?? num(val(r, ins.awardedAmount)),
      onFile: award?.onFile ?? num(val(r, ins.insuranceAmount)),
      gap: award?.gap ?? 0,
      status: str(val(r, FONDO_FIELDS.status)) as FondoStatus | "",
      formSentAt: str(val(r, FONDO_FIELDS.formSentAt)),
      reminderCount: num(val(r, FONDO_FIELDS.reminderCount)),
      reviewNotes: str(val(r, FONDO_FIELDS.reviewNotes)),
      email: v.email,
      blocked: v.blocked,
    };
  };

  // Cases still owed a poliza, whatever their award looks like.
  for (const r of rows) {
    const status = str(val(r, FONDO_FIELDS.status)) as FondoStatus | "";
    if (status !== FONDO_STATUS.awaiting && status !== FONDO_STATUS.returned && status !== "") {
      continue;
    }
    if (rejectManualSend(status, currentFile(val(r, ins.poliza)).name !== "")) continue;
    const item = fromCase(r, "case");
    items.set(item.key, item);
  }

  // Open awards: no case yet, or a poliza short of what the award needs.
  for (const a of awards) {
    if (!a.caseRecordIds.length) {
      const v = reach(a.subRecordId);
      items.set(`p${a.poRecordId}`, {
        key: `p${a.poRecordId}`,
        recordId: 0,
        poRecordId: a.poRecordId,
        poNumber: a.poNumber,
        kind: "new",
        caseNumber: a.caseNumber,
        jobName: "",
        subcontractor: a.subcontractor || v.company,
        awardedAmount: a.required,
        onFile: a.onFile,
        gap: a.gap,
        status: "",
        formSentAt: "",
        reminderCount: 0,
        reviewNotes: "",
        email: v.email,
        blocked: v.blocked,
      });
      continue;
    }
    const newest = caseBy.get(a.caseRecordIds[0]);
    if (!newest) continue;
    const key = `c${a.caseRecordIds[0]}`;
    const listed = items.get(key);
    if (listed) {
      // Already listed as owed a poliza: carry the award's figures.
      items.set(key, {
        ...listed,
        poRecordId: a.poRecordId,
        poNumber: a.poNumber,
        awardedAmount: a.required,
        onFile: a.onFile,
        gap: a.gap,
      });
      continue;
    }
    if (a.gap <= 0) continue;
    const status = str(val(newest, FONDO_FIELDS.status)) as FondoStatus | "";
    if (status === FONDO_STATUS.submitted) continue; // the review queue has it
    if (status === FONDO_STATUS.approved) continue; // the Approved tab has it
    items.set(key, fromCase(newest, "short", a));
  }

  return [...items.values()]
    .filter((i) => !fondoHiddenSub(i.subcontractor))
    .sort((a, b) => a.caseNumber.localeCompare(b.caseNumber));
}

/** Open a Fondo case, the same record an award made in this app creates. */
export async function createSubmittal(award: OpenAward, openedBy: string): Promise<number> {
  const f = QB_AWARD.insurance;
  const res = await fetch("https://api.quickbase.com/v1/records", {
    method: "POST",
    headers: {
      "QB-Realm-Hostname": QB_CONFIG.realm,
      Authorization: `QB-USER-TOKEN ${QB_CONFIG.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: QB_AWARD.tables.insurance,
      data: [
        {
          [f.caseNumber]: { value: award.caseNumber },
          [f.subcontractorName]: { value: award.subcontractor },
          [f.awardedAmount]: { value: award.required },
          [f.relatedJob]: { value: award.jobRecordId },
          [f.relatedSub]: { value: award.subRecordId },
          [f.source]: { value: QB_AWARD.insuranceSource },
          [FONDO_FIELDS.status]: { value: FONDO_STATUS.awaiting },
          [f.comments]: {
            value: `Opened from the Fondo page (Send link) by ${openedBy || "staff"}. Purchase order ${award.poNumber}. Awarded = required Fondo coverage (award + approved change orders).`,
          },
        },
      ],
      fieldsToReturn: [f.recordId],
    }),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Quickbase ${res.status}: ${text.slice(0, 300)}`);
  const body = JSON.parse(text) as {
    metadata?: { lineErrors?: unknown; createdRecordIds?: number[] };
  };
  const errors = body.metadata?.lineErrors;
  if (errors && Object.keys(errors).length) {
    throw new Error(`Quickbase rejected the new case: ${JSON.stringify(errors).slice(0, 300)}`);
  }
  const id = body.metadata?.createdRecordIds?.[0];
  if (!id) throw new Error("Quickbase did not return the new case's id.");
  return id;
}

/** One row of the Approved tab. */
export interface ApprovedItem {
  recordId: number;
  caseNumber: string;
  jobName: string;
  subcontractor: string;
  awardedAmount: number;
  insuranceAmount: number;
  /** Quickbase's own Coverage Status formula (21): COVERED, SHORT, AMOUNT NOT RECORDED... */
  coverage: string;
  /** true: approved through the review queue. false: on file from before it existed. */
  approvedHere: boolean;
  reviewedBy: string;
  reviewedAt: string;
  dateSubmitted: string;
  source: string;
  polizaName: string;
}

/**
 * Polizas that count: approved through the review queue, plus the ones that
 * were already on file before the queue existed (no status, document on the
 * record). Those older ones were never reviewed here and are marked so.
 */
export async function approvedQueue(): Promise<ApprovedItem[]> {
  const ins = QB_AWARD.insurance;
  const rows = await queryAll({
    from: QB_AWARD.tables.insurance,
    select: [
      ins.recordId,
      ins.caseNumber,
      23,
      ins.subcontractorName,
      ins.awardedAmount,
      ins.insuranceAmount,
      ins.poliza,
      ins.coverageStatus,
      ins.dateSubmitted,
      ins.source,
      FONDO_FIELDS.status,
      FONDO_FIELDS.reviewedBy,
      FONDO_FIELDS.reviewedAt,
    ],
    where: `{${FONDO_FIELDS.status}.EX.'${FONDO_STATUS.approved}'}OR{${FONDO_FIELDS.status}.EX.''}`,
  });
  return (
    rows
      .map((r) => ({
        recordId: num(val(r, ins.recordId)),
        caseNumber: str(val(r, ins.caseNumber)).trim(),
        jobName: str(val(r, 23)).trim(),
        subcontractor: str(val(r, ins.subcontractorName)).trim(),
        awardedAmount: num(val(r, ins.awardedAmount)),
        insuranceAmount: num(val(r, ins.insuranceAmount)),
        coverage: str(val(r, ins.coverageStatus)).trim(),
        approvedHere: str(val(r, FONDO_FIELDS.status)) === FONDO_STATUS.approved,
        reviewedBy: str(val(r, FONDO_FIELDS.reviewedBy)).trim(),
        reviewedAt: str(val(r, FONDO_FIELDS.reviewedAt)),
        dateSubmitted: str(val(r, ins.dateSubmitted)),
        source: str(val(r, ins.source)).trim(),
        polizaName: currentFile(val(r, ins.poliza)).name,
      }))
      // A blank status with no document is still owed one: Send link has it.
      .filter((i) => i.approvedHere || i.polizaName)
      // Approved here first, newest decision first, then by case.
      .sort(
        (a, b) =>
          Number(b.approvedHere) - Number(a.approvedHere) ||
          b.reviewedAt.localeCompare(a.reviewedAt) ||
          a.caseNumber.localeCompare(b.caseNumber),
      )
  );
}

/** A case owed a reminder today. */
export interface DueReminder {
  recordId: number;
  caseNumber: string;
  subcontractor: string;
  awardedAmount: number;
  /** Which reminder this will be: 1..REMINDER_MAX. */
  n: number;
  email: string;
  accessKey: string;
  /** Why it cannot go, when it cannot. */
  blocked: string;
}

/**
 * Cases waiting on the subcontractor whose daily reminder is due now.
 * Submitting moves a case to "Submitted - pending review", which is what
 * takes it off this list.
 */
export async function dueReminders(now = new Date()): Promise<DueReminder[]> {
  const ins = QB_AWARD.insurance;
  const f = FONDO_FIELDS;
  const rows = await queryAll({
    from: QB_AWARD.tables.insurance,
    select: [
      ins.recordId,
      ins.caseNumber,
      ins.subcontractorName,
      ins.awardedAmount,
      ins.relatedSub,
      f.status,
      f.formSentAt,
      f.reminderCount,
      f.lastReminderAt,
    ],
    where:
      `({${f.status}.EX.'${FONDO_STATUS.awaiting}'}OR{${f.status}.EX.'${FONDO_STATUS.returned}'})` +
      `AND{${f.formSentAt}.XEX.''}`,
  });
  const due = rows.filter((r) =>
    reminderDue({
      status: str(val(r, f.status)) as FondoStatus | "",
      formSentAt: str(val(r, f.formSentAt)),
      reminderCount: num(val(r, f.reminderCount)),
      lastReminderAt: str(val(r, f.lastReminderAt)),
      now,
    }),
  );
  const out: DueReminder[] = [];
  for (const r of due) {
    const v = await vendorById(num(val(r, ins.relatedSub)));
    const name = str(val(r, ins.subcontractorName)).trim() || v?.company || "";
    out.push({
      recordId: num(val(r, ins.recordId)),
      caseNumber: str(val(r, ins.caseNumber)).trim(),
      subcontractor: name,
      awardedAmount: num(val(r, ins.awardedAmount)),
      n: num(val(r, f.reminderCount)) + 1,
      email: v?.email ?? "",
      accessKey: v?.accessKey ?? "",
      blocked: !v
        ? "No subcontractor on the case"
        : fondoHiddenSub(v.company || name)
          ? "Excluded from Fondo emails"
          : fondoNoEmailReason(v.company || name) ||
          (!v.accessKey ? "Vendor has no access key" : !v.email ? "No email on file" : ""),
    });
  }
  return out;
}

/** What a manual send needs for one case, re-read at send time. */
export async function caseForSend(recordId: number): Promise<{
  caseNumber: string;
  subcontractor: string;
  awardedAmount: number;
  status: FondoStatus | "";
  hasPoliza: boolean;
  reviewNotes: string;
  vendor: { accessKey: string; email: string; company: string } | null;
} | null> {
  const ins = QB_AWARD.insurance;
  const rows = await queryAll({
    from: QB_AWARD.tables.insurance,
    select: [
      ins.recordId,
      ins.caseNumber,
      ins.subcontractorName,
      ins.awardedAmount,
      ins.poliza,
      ins.relatedSub,
      FONDO_FIELDS.status,
      FONDO_FIELDS.reviewNotes,
    ],
    where: `{${ins.recordId}.EX.${recordId}}`,
  });
  const r = rows[0];
  if (!r) return null;
  const vendor = await vendorById(num(val(r, ins.relatedSub)));
  return {
    caseNumber: str(val(r, ins.caseNumber)).trim(),
    subcontractor: str(val(r, ins.subcontractorName)).trim() || vendor?.company || "",
    awardedAmount: num(val(r, ins.awardedAmount)),
    status: str(val(r, FONDO_FIELDS.status)) as FondoStatus | "",
    hasPoliza: currentFile(val(r, ins.poliza)).name !== "",
    reviewNotes: str(val(r, FONDO_FIELDS.reviewNotes)),
    vendor,
  };
}

/** The raw staged values, needed to copy a submission onto the record. */
export async function stagedFor(recordId: number): Promise<{
  amount: number;
  file: unknown;
  submittedAt: string;
  caseNumber: string;
  subcontractor: string;
  awardedAmount: number;
  vendorRecordId: number;
} | null> {
  const ins = QB_AWARD.insurance;
  const rows = await queryAll({
    from: QB_AWARD.tables.insurance,
    select: [
      ins.recordId,
      ins.caseNumber,
      ins.subcontractorName,
      ins.awardedAmount,
      ins.relatedSub,
      FONDO_FIELDS.submittedAmount,
      FONDO_FIELDS.submittedAt,
      FONDO_FIELDS.submittedPoliza,
    ],
    where: `{${ins.recordId}.EX.${recordId}}`,
  });
  const r = rows[0];
  if (!r) return null;
  return {
    amount: num(val(r, FONDO_FIELDS.submittedAmount)),
    file: val(r, FONDO_FIELDS.submittedPoliza),
    submittedAt: str(val(r, FONDO_FIELDS.submittedAt)),
    caseNumber: str(val(r, ins.caseNumber)).trim(),
    subcontractor: str(val(r, ins.subcontractorName)).trim(),
    awardedAmount: num(val(r, ins.awardedAmount)),
    vendorRecordId: num(val(r, ins.relatedSub)),
  };
}

/** A vendor's access key and email, for links and notifications. */
export async function vendorById(
  recordId: number,
): Promise<{ accessKey: string; email: string; company: string } | null> {
  if (!recordId) return null;
  const rows = await queryAll({
    from: VENDOR_TABLE,
    select: [3, VENDOR_ACCESS_KEY, VENDOR_COMPANY, VENDOR_EMAIL],
    where: `{3.EX.${recordId}}`,
  });
  const v = rows[0];
  if (!v) return null;
  return {
    accessKey: str(val(v, VENDOR_ACCESS_KEY)).trim(),
    email: str(val(v, VENDOR_EMAIL)).trim(),
    company: str(val(v, VENDOR_COMPANY)).trim(),
  };
}

/**
 * Fetch the staged poliza itself, so it can be shown to the reviewer without
 * sending them to Quickbase.
 *
 * The /up/ link only opens for someone with a live Quickbase session, which
 * the review page cannot assume. Quickbase's file endpoint returns the bytes
 * base64-encoded to a token holder, so the server reads it and hands it on.
 * The token stays here; the browser only ever sees the document.
 */
export async function polizaFile(
  recordId: number,
  /** staged: what the sub sent (40), for review. record: the approved poliza (14). */
  which: "staged" | "record" = "staged",
): Promise<{
  body: Buffer;
  contentType: string;
  fileName: string;
} | null> {
  if (!fondoConfigured()) return null;
  const field = which === "record" ? QB_AWARD.insurance.poliza : FONDO_FIELDS.submittedPoliza;

  const rows = await queryAll({
    from: QB_AWARD.tables.insurance,
    select: [QB_AWARD.insurance.recordId, field],
    where: `{${QB_AWARD.insurance.recordId}.EX.${recordId}}`,
  });
  const raw = rows[0] ? val(rows[0], field) : null;
  if (!raw || typeof raw !== "object") return null;

  const url = String((raw as { url?: string }).url ?? "");
  const m = url.match(/^\/files\/([a-z0-9]+)\/(\d+)\/(\d+)\/(\d+)/i);
  if (!m) return null;

  const res = await fetch(
    `https://api.quickbase.com/v1/files/${m[1]}/${m[2]}/${m[3]}/${m[4]}`,
    {
      headers: {
        "QB-Realm-Hostname": QB_CONFIG.realm,
        Authorization: `QB-USER-TOKEN ${QB_CONFIG.token}`,
      },
      cache: "no-store",
    },
  );
  if (!res.ok) return null;

  // The endpoint answers with the file base64-encoded, not as raw bytes.
  const base64 = (await res.text()).trim();
  return {
    body: Buffer.from(base64, "base64"),
    contentType: res.headers.get("content-type") ?? "application/pdf",
    fileName: currentFile(raw).name || "poliza",
  };
}
