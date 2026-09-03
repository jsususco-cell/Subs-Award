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
  | "formSentAt";

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
  staged: { amount: number; file: unknown; submittedAt: string },
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
  // A file field is copied by writing the same {fileName, data} payload; when
  // the staged value cannot be re-sent the amount still lands, so the case
  // stops reading as "no policy on file".
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
