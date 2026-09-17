/**
 * Documents filed against a job.
 *
 * Quickbase's Attachments table is the company's general document store —
 * 49,000 records, every kind of file, hung off whichever record it belongs to.
 * This app writes to the same table rather than somewhere of its own, so a
 * document attached here is one anybody already looking at the job will find.
 */

/** What a file can be filed as. */
export interface AttachmentInput {
  jobRecordId: number;
  /** Set when the document belongs to a purchase order as well. */
  poRecordId?: number;
  subRecordId?: number;
  category: string;
  /** What it is, in the uploader's words. Optional. */
  description: string;
  fileName: string;
  /** The file itself, base64. */
  data: string;
}

export interface AttachmentRow {
  recordId: number;
  fileName: string;
  title: string;
  category: string;
  description: string;
  uploaded: string;
  poRecordId: number;
  /** Where the file can be fetched from, once the caller has a token. */
  versionNumber: number;
}

/**
 * The categories already in use on the table, commonest first.
 *
 * Taken from what is actually filed rather than invented: "Invoice" and
 * "Award Letter" are both existing values, and adding a near-synonym of an
 * existing category is how a document store stops being searchable. Anything
 * not here can still be typed.
 */
export const ATTACHMENT_CATEGORIES = [
  "Invoice",
  "Invoice Supporting Documents",
  "Award Letter",
  "Contracts",
  "NTP",
  "Permits",
  "Inspections",
  "Bid Submission",
  "Schedule",
  "Site Photos",
  "Weekly Report",
  "Program Provided Documents",
  "Others",
] as const;

/**
 * The largest file this can take, in bytes.
 *
 * Not a Quickbase limit — it is the request body a serverless function will
 * accept. The file is carried base64, which inflates it by a third, so the
 * cap is set against the raw file with room left for the rest of the request.
 */
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

export function tooBig(bytes: number): boolean {
  return bytes > MAX_ATTACHMENT_BYTES;
}

/** A size a person can read, for the message when a file is refused. */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Why this file cannot be filed, or null.
 *
 * A blank category is allowed — the table is full of records without one and
 * refusing would only teach people to pick any value to get past it.
 */
export function attachmentProblem(input: {
  jobRecordId: number;
  fileName: string;
  bytes: number;
}): string | null {
  if (!input.jobRecordId) {
    return "Pick a job first — an attachment has to hang off a record.";
  }
  if (!input.fileName.trim()) return "That file has no name.";
  if (!input.bytes) return "That file is empty.";
  if (tooBig(input.bytes)) {
    return (
      `${humanSize(input.bytes)} is over the ${humanSize(MAX_ATTACHMENT_BYTES)} ` +
      `limit for uploads from here. Attach it on the Quickbase record instead.`
    );
  }
  return null;
}
