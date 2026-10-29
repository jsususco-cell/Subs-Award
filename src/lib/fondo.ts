import { QB_AWARD } from "./qb-award";

/**
 * The Fondo (CFSE) poliza submittal: what the subcontractor sends in after
 * being awarded, and what happens to it before it counts.
 *
 * The rule this module exists to enforce is that a submission is NOT insurance
 * until someone has looked at it. Coverage Status (21) on the submittal table
 * is a formula over Insurance Amount (13) and Poliza (14); writing those two
 * the moment a subcontractor uploads would show the case as COVERED on the
 * insurance page with nobody having checked the document. So a submission goes
 * to staging fields, and approval is the only thing that copies it across.
 */

/**
 * Staging fields, created on 2026-09-04 by `scripts/setup-fondo-fields.mjs`.
 *
 * Zero would mean a field does not exist yet, and `fondoConfigured()` is false
 * while any is missing so the routes refuse rather than writing to field 0.
 */
export type FondoFieldName =
  | "status"
  | "submittedAmount"
  | "submittedPoliza"
  | "submittedPolicyNumber"
  | "submittedAt"
  | "reviewNotes"
  | "reviewedBy"
  | "reviewedAt"
  | "formSentAt"
  | "reminderCount"
  | "lastReminderAt"
  | "poRecordId"
  | "poNumber";

export const FONDO_FIELDS: Record<FondoFieldName, number> = {
  status: 38,
  submittedAmount: 39,
  submittedPoliza: 40,
  submittedPolicyNumber: 41,
  submittedAt: 42,
  reviewNotes: 43,
  reviewedBy: 44,
  reviewedAt: 45,
  formSentAt: 46,
  // Added 2026-10-28 for the daily reminders.
  reminderCount: 47,
  lastReminderAt: 48,
  // One Fondo record per field-work PO (2026-10-30): the PO this record is for.
  poRecordId: 49,
  poNumber: 50,
};

export const FONDO_STATUS = {
  awaiting: "Awaiting submission",
  submitted: "Submitted - pending review",
  approved: "Approved",
  returned: "Returned for correction",
} as const;

export type FondoStatus = (typeof FONDO_STATUS)[keyof typeof FONDO_STATUS];

/** Every staging field has a real id, so writes are safe. */
export function fondoConfigured(): boolean {
  return Object.values(FONDO_FIELDS).every((id) => id > 0);
}

/** The ones still missing, so the error can say which. */
export function missingFondoFields(): string[] {
  return Object.entries(FONDO_FIELDS)
    .filter(([, id]) => !(id > 0))
    .map(([name]) => name);
}

export interface FondoSubmission {
  insuranceAmount: number;
  policyNumber: string;
  /** The poliza itself. Quickbase file fields take a name and base64. */
  file: { fileName: string; data: string } | null;
  submittedBy: string;
}

export interface FondoCase {
  recordId: number;
  caseNumber: string;
  jobName: string;
  subcontractor: string;
  awardedAmount: number;
  status: FondoStatus | "";
  reviewNotes: string;
  /** What was submitted last time, so a returned form comes back filled in. */
  submittedAmount: number;
  submittedPolicyNumber: string;
  submittedFileName: string;
}

export const MAX_POLIZA_BYTES = 10 * 1024 * 1024;

/** Roughly how many bytes a base64 payload decodes to. */
export function base64Bytes(data: string): number {
  const clean = data.replace(/\s/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

const ALLOWED = /\.(pdf|jpg|jpeg|png|heic|webp)$/i;

/**
 * Why this submission cannot be accepted, or null if it can.
 *
 * The amount is checked against zero but deliberately NOT against the award:
 * a poliza for less than the award is a real thing that happens, and the
 * point of the review queue is that a person sees it. Refusing it here would
 * only push the subcontractor into rounding the number up to get past the
 * form, which is worse than recording what they actually hold.
 */
export function rejectSubmission(
  input: FondoSubmission,
  hasExistingFile: boolean,
): string | null {
  if (!(input.insuranceAmount > 0)) {
    return "Enter the amount the poliza is for.";
  }
  if (!Number.isFinite(input.insuranceAmount) || input.insuranceAmount > 1e9) {
    return "That amount does not look right. Check the figure on the poliza.";
  }
  if (!input.file && !hasExistingFile) {
    return "Attach the poliza before sending it.";
  }
  if (input.file) {
    if (!ALLOWED.test(input.file.fileName)) {
      return "The poliza has to be a PDF or an image (JPG, PNG, HEIC or WEBP).";
    }
    if (base64Bytes(input.file.data) > MAX_POLIZA_BYTES) {
      return "That file is larger than 10 MB. Send a smaller scan.";
    }
    if (base64Bytes(input.file.data) < 100) {
      return "That file looks empty. Attach the poliza again.";
    }
  }
  return null;
}

/** Is this case open for a subcontractor to submit against? */
export function canSubmit(status: FondoStatus | ""): boolean {
  return status !== FONDO_STATUS.approved;
}

/** The record patch a subcontractor's submission makes. */
export function buildSubmissionRecord(
  recordId: number,
  input: FondoSubmission,
): Record<string, { value: unknown }> {
  const f = FONDO_FIELDS;
  const rec: Record<string, { value: unknown }> = {
    [QB_AWARD.insurance.recordId]: { value: recordId },
    [f.status]: { value: FONDO_STATUS.submitted },
    [f.submittedAmount]: { value: round(input.insuranceAmount) },
    [f.submittedPolicyNumber]: { value: input.policyNumber },
    [f.submittedAt]: { value: new Date().toISOString() },
    // Cleared so a previous rejection does not hang around on the new attempt.
    [f.reviewNotes]: { value: "" },
  };
  if (input.submittedBy) rec[QB_AWARD.insurance.submittedBy] = { value: input.submittedBy };
  if (input.file) rec[f.submittedPoliza] = { value: input.file };
  return rec;
}

/**
 * Approval: the only place the staged poliza becomes the poliza of record.
 *
 * Insurance Amount (13), Poliza (14) and Date Submitted (11) are written here
 * and nowhere else, which is what makes Coverage Status trustworthy.
 */
export function buildApprovalRecord(
  recordId: number,
  staged: {
    amount: number;
    /**
     * The document to copy, as Quickbase accepts it for WRITING: a name and
     * base64. The shape a query returns ({url, versions}) is not writable --
     * sending that uploads nothing, silently, and the case goes on reading
     * "NO POLICY ON FILE" while looking approved.
     */
    file: { fileName: string; data: string } | null;
    submittedAt: string;
  },
  reviewer: string,
): Record<string, { value: unknown }> {
  const f = FONDO_FIELDS;
  const ins = QB_AWARD.insurance;
  const rec: Record<string, { value: unknown }> = {
    [ins.recordId]: { value: recordId },
    [ins.insuranceAmount]: { value: round(staged.amount) },
    [ins.dateSubmitted]: { value: (staged.submittedAt || new Date().toISOString()).slice(0, 10) },
    [f.status]: { value: FONDO_STATUS.approved },
    [f.reviewedBy]: { value: reviewer },
    [f.reviewedAt]: { value: new Date().toISOString() },
    [f.reviewNotes]: { value: "" },
  };
  // Coverage Status is a formula that reads "NO POLICY ON FILE" whenever the
  // Poliza field is empty, so without this the case never counts as covered no
  // matter what the amount says. The caller has to have fetched the bytes.
  if (staged.file) rec[ins.poliza] = { value: staged.file };
  return rec;
}

/** Sending it back: the notes are the whole point, so they are required. */
export function buildReturnRecord(
  recordId: number,
  notes: string,
  reviewer: string,
): Record<string, { value: unknown }> {
  const f = FONDO_FIELDS;
  return {
    [QB_AWARD.insurance.recordId]: { value: recordId },
    [f.status]: { value: FONDO_STATUS.returned },
    [f.reviewNotes]: { value: notes },
    [f.reviewedBy]: { value: reviewer },
    [f.reviewedAt]: { value: new Date().toISOString() },
  };
}

export function rejectReturn(notes: string): string | null {
  if (!notes.trim()) {
    return "Say what needs correcting — the subcontractor sees this and cannot act on a blank reason.";
  }
  return null;
}

/**
 * Can a staff member send this case's form link by hand, and why not if not.
 *
 * Open cases only: waiting for the poliza, sent back for correction, or one of
 * the migrated cases that never had a status and has no poliza on record. A
 * case already submitted is waiting on the reviewer, not the subcontractor, and
 * an approved one is closed — mailing either would invite a second upload over
 * a document someone is reading or has accepted.
 */
export function rejectManualSend(
  status: FondoStatus | "",
  hasPolizaOnRecord: boolean,
  /** An older poliza on file is less than the open award needs: ask for a bigger one. */
  short = false,
): string | null {
  if (status === FONDO_STATUS.submitted) {
    return "The subcontractor already sent it. It is waiting for review, not for them.";
  }
  // Approved is final: it lives in the Approved tab and is never chased from
  // Send link, short or not (user decision, 27 Oct 2026).
  if (status === FONDO_STATUS.approved) {
    return "This poliza is already approved. There is nothing to ask for.";
  }
  if (short) return null;
  if (status === "" && hasPolizaOnRecord) {
    return "This case already has a poliza on record.";
  }
  return null;
}

/*
 * Which purchase orders are open awards that need Fondo coverage.
 *
 * Copied from the Fondo Coverage & Audit page (CM v2 code page 206) so the two
 * pages count the same 113 awards. If the rule changes there, change it here.
 */
export const AWARD_TITLE = /^\s*(award|reconstr|relocat|relocaci|demol|repair|rehab)/i;

/*
 * Field-work POs: the ones that need their own Fondo poliza (user decision,
 * 30 Oct 2026). The Fondo Coverage page's "core" and "other" field-work
 * words, minus scoping / inspection / professional fees.
 */
const FIELD_CORE =
  /award|reconstr|relocat|relocaci|demol|demolici|repair|rehab|cambio de orden|change order|orden de cambio|movilizaci|mobiliz/i;
const FIELD_OTHER =
  /lead|abatement|asbestos abat|slab|retaining|photovolt|mitigation|window|septic|cistern|roof|solar|cabinet|tile|paint|pv /i;
export const FEE_PO_TITLE =
  /xactimate|scoping|scope change serv|inspection|professional|\brecon\b|site walk|feasibility/i;
export function isFieldWorkTitle(title: string): boolean {
  return (FIELD_CORE.test(title) || FIELD_OTHER.test(title)) && !FEE_PO_TITLE.test(title);
}

/**
 * What one PO's poliza has to cover: its Required Fondo Coverage (award plus
 * approved change orders) when it has one, otherwise its Total Builder Cost.
 */
export function poFondoAmount(required: number, builderCost: number): number {
  return round(required > 0 ? required : builderCost > 0 ? builderCost : 0);
}
const EXEMPT = ["kimberlycruz", "towerwindows", "tileinternational"];
export const OPEN_JOB_STATUSES = ["OPEN", "ON-HOLD"];
/**
 * Only released POs whose work has started, finished or not started yet
 * (user filter, 29 Oct 2026). Values as Quickbase spells them: PO Status
 * (fid 15) and Work Status Options (fid 16). "Work Incomplete" and blank are out.
 */
export const FONDO_PO_STATUSES = ["Released"];
export const FONDO_WORK_STATUSES = ["Work Complete", "Partially Completed", "Not Started"];

/** Lowercase letters and digits only: how page 206 compares names. */
export function normName(s: string): string {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Suppliers and scoping vendors that need no Fondo coverage. */
export function exemptFromFondo(subName: string): boolean {
  const n = normName(subName);
  return EXEMPT.some((x) => n.startsWith(x));
}

/**
 * Subcontractors page 206 never emails about Fondo, and why. Shown in place of
 * the Send button so nobody mails them by accident.
 */
export function fondoNoEmailReason(subName: string): string {
  const n = normName(subName);
  if (n.startsWith("angconstruction")) return "ANG: own policy under contract, not emailed";
  if (["rofconstruction", "toprojectmanagement"].some((x) => n.startsWith(x))) {
    return "No longer with us, not emailed";
  }
  return "";
}

/**
 * Subcontractors left out of Fondo chasing altogether: hidden from Send link
 * and never emailed (link, automatic link, reminders). User decision,
 * 28 Oct 2026: Mohr Construction / Mohr Construction Services.
 */
const HIDDEN_SUBS = ["mohrconstruction"];
export function fondoHiddenSub(subName: string): boolean {
  const n = normName(subName);
  return HIDDEN_SUBS.some((x) => n.startsWith(x));
}

/**
 * Subcontractors whose open awards are chased as ONE: a single Send link row
 * with the summed amount, one email, one poliza for the total, and approving
 * it records that poliza on every case with that case's share. User decision,
 * 28 Oct 2026: Civil Consulting Engineers LLC.
 */
const POOLED_SUBS: { key: string; label: string }[] = [
  { key: "civilconsultingengineers", label: "Civil Consulting Engineers LLC" },
];
/** The pool a subcontractor belongs to, or "" when it is chased case by case. */
export function fondoPoolOf(subName: string): string {
  const n = normName(subName);
  return POOLED_SUBS.find((p) => n.startsWith(p.key))?.key ?? "";
}
export function fondoPoolLabel(key: string): string {
  return POOLED_SUBS.find((p) => p.key === key)?.label ?? key;
}

/**
 * Split one poliza amount across cases in proportion to what each needs, to
 * the cent, with any rounding left on the last case so the shares add up
 * exactly. Equal split when nothing has a weight.
 */
export function splitByShare(total: number, weights: number[]): number[] {
  if (!weights.length) return [];
  const sum = weights.reduce((a, b) => a + Math.max(0, b), 0);
  const raw = weights.map((w) => (sum > 0 ? (total * Math.max(0, w)) / sum : total / weights.length));
  const out = raw.map((x) => Math.round(x * 100) / 100);
  const drift = Math.round((total - out.reduce((a, b) => a + b, 0)) * 100) / 100;
  out[out.length - 1] = Math.round((out[out.length - 1] + drift) * 100) / 100;
  return out;
}

/**
 * Does this PO need its own Fondo poliza now? Every input is what the PO and
 * its job say; `required` is poFondoAmount(...).
 */
export function isOpenAward(po: {
  region: string;
  cancelled: boolean;
  title: string;
  jobStatus: string;
  caseNumber: string;
  required: number;
  subName: string;
  poStatus: string;
  workStatus: string;
}): boolean {
  return (
    po.region === "Puerto Rico" &&
    !po.cancelled &&
    isFieldWorkTitle(po.title) &&
    Boolean(po.caseNumber) &&
    OPEN_JOB_STATUSES.includes(po.jobStatus) &&
    po.required > 0 &&
    FONDO_PO_STATUSES.includes(po.poStatus) &&
    FONDO_WORK_STATUSES.includes(po.workStatus) &&
    !exemptFromFondo(po.subName)
  );
}

/** The gap, using the larger of the PO's stamp and the policies actually on file. */
export function fondoGap(required: number, stamped: number, onFile: number): number {
  return Math.max(0, round(required - Math.max(stamped, onFile)));
}

/** Daily reminders after the link: this many, then stop (user decision, 28 Oct 2026). */
export const REMINDER_MAX = 7;
/**
 * "Daily" with slack: the sender runs once a day, and a run a few minutes
 * earlier than yesterday's must not skip a day.
 */
const REMINDER_GAP_MS = 20 * 60 * 60 * 1000;

/**
 * Is a reminder due for this case now?
 *
 * Only while the case is waiting on the subcontractor (awaiting, or returned
 * for correction) and the link has actually gone out. A submission moves the
 * case to "Submitted - pending review", which is what stops the reminders.
 */
export function reminderDue(c: {
  status: FondoStatus | "";
  formSentAt: string;
  reminderCount: number;
  lastReminderAt: string;
  now: Date;
}): boolean {
  if (c.status !== FONDO_STATUS.awaiting && c.status !== FONDO_STATUS.returned) return false;
  if (!c.formSentAt) return false;
  if (c.reminderCount >= REMINDER_MAX) return false;
  const last = Date.parse(c.lastReminderAt || c.formSentAt);
  if (!Number.isFinite(last)) return false;
  return c.now.getTime() - last >= REMINDER_GAP_MS;
}

/** Does the submitted poliza cover the award? Advisory only, for the reviewer. */
export function coverageOf(
  submitted: number,
  awarded: number,
): { covers: boolean; shortfall: number } {
  const shortfall = round(awarded - submitted);
  return { covers: shortfall <= 0, shortfall: shortfall > 0 ? shortfall : 0 };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * A Quickbase file field keeps every upload as a version, oldest first, and
 * `url` points at the current one. Reading `versions[0]` therefore names the
 * FIRST document ever attached -- so after a resubmission the reviewer would
 * see the previous file's name beside the current file's link, which is a good
 * way to approve the wrong document.
 *
 * The version in the url wins; failing that, the highest version number.
 */
interface QbFileVersion {
  fileName?: string;
  versionNumber?: number;
  uploaded?: string;
}

export function currentFile(
  value: unknown,
  realm = "",
): { name: string; url: string } {
  if (!value || typeof value !== "object") return { name: "", url: "" };
  const o = value as { url?: string; versions?: QbFileVersion[] };
  const versions = Array.isArray(o.versions) ? o.versions : [];
  if (!versions.length) return { name: "", url: "" };

  const m = String(o.url ?? "").match(/^\/files\/([a-z0-9]+)\/(\d+)\/(\d+)\/(\d+)/i);
  const wanted = m ? Number(m[4]) : 0;

  const chosen =
    versions.find((v) => Number(v.versionNumber) === wanted) ??
    versions.reduce((a, b) => (Number(b.versionNumber) >= Number(a.versionNumber) ? b : a));

  return {
    name: String(chosen?.fileName ?? ""),
    url: m && realm ? `https://${realm}/up/${m[1]}/a/r${m[2]}/e${m[3]}/v${m[4]}` : "",
  };
}
