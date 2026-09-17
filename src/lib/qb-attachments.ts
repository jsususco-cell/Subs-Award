import "server-only";
import { QB_CONFIG, queryAll } from "./quickbase";
import { attachFile } from "./qb-attach";
import type { AttachmentInput, AttachmentRow } from "./attachments";

/**
 * Reading and writing the company's Attachments table.
 *
 * The table is shared with the rest of Quickbase, so this touches only the
 * fields it sets and never assumes it is the only writer.
 */

export const QB_ATTACHMENTS = {
  table: "buskqh28a",
  fields: {
    recordId: 3,
    file: 10,
    /** A title for the document, separate from the uploaded file's own name. */
    title: 20,
    description: 16,
    category: 53,
    relatedJob: 21,
    relatedPo: 36,
    relatedSub: 8,
    dateCreated: 1,
  },
} as const;

type Raw = Record<string, { value: unknown } | undefined>;

const str = (row: Raw, fid: number): string => {
  const v = row[String(fid)]?.value;
  return v === null || v === undefined ? "" : String(v);
};
const numOf = (row: Raw, fid: number): number => {
  const n = Number(row[String(fid)]?.value);
  return Number.isFinite(n) ? n : 0;
};

/** Everything filed against a job, newest first. */
export async function fetchAttachments(
  jobRecordId: number,
): Promise<AttachmentRow[]> {
  const f = QB_ATTACHMENTS.fields;
  const rows = await queryAll({
    from: QB_ATTACHMENTS.table,
    select: [
      f.recordId,
      f.file,
      f.title,
      f.description,
      f.category,
      f.relatedPo,
      f.dateCreated,
    ],
    where: `{${f.relatedJob}.EX.${jobRecordId}}`,
    sortBy: [{ fieldId: f.recordId, order: "DESC" }],
  });

  return (rows as Raw[]).map((r) => {
    /*
     * A file field comes back as an object carrying its versions, newest
     * last. An attachment record with no file is possible — somebody saved
     * the row before choosing one — so this must not assume there is one.
     */
    const file = r[String(f.file)]?.value as
      { versions?: { fileName: string; versionNumber: number }[] } | undefined;
    const latest = file?.versions?.[file.versions.length - 1];
    return {
      recordId: numOf(r, f.recordId),
      fileName: latest?.fileName ?? "",
      versionNumber: latest?.versionNumber ?? 0,
      title: str(r, f.title),
      category: str(r, f.category),
      description: str(r, f.description),
      uploaded: str(r, f.dateCreated),
      poRecordId: numOf(r, f.relatedPo),
    };
  });
}

/**
 * File a document against a job.
 *
 * Two steps, and they have to be in this order: Quickbase will not take a new
 * record and its file in one call reliably, so the row is created first and
 * the file attached to it second. A failure at the second step leaves an empty
 * attachment row, which is visible and fixable — the alternative, uploading
 * first, has nowhere to put the bytes.
 */
export async function createAttachment(
  input: AttachmentInput,
): Promise<{ recordId: number }> {
  const f = QB_ATTACHMENTS.fields;

  const record: Record<number, { value: unknown }> = {
    [f.relatedJob]: { value: input.jobRecordId },
    [f.title]: { value: input.fileName },
  };
  if (input.poRecordId) record[f.relatedPo] = { value: input.poRecordId };
  if (input.subRecordId) record[f.relatedSub] = { value: input.subRecordId };
  if (input.category.trim())
    record[f.category] = { value: input.category.trim() };
  if (input.description.trim()) {
    record[f.description] = { value: input.description.trim() };
  }

  const res = await fetch("https://api.quickbase.com/v1/records", {
    method: "POST",
    headers: {
      "QB-Realm-Hostname": QB_CONFIG.realm,
      Authorization: `QB-USER-TOKEN ${QB_CONFIG.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: QB_ATTACHMENTS.table,
      data: [record],
      fieldsToReturn: [f.recordId],
    }),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Quickbase ${res.status} creating the attachment row: ${text.slice(0, 300)}`,
    );
  }
  const body = JSON.parse(text) as {
    metadata?: { createdRecordIds?: number[]; lineErrors?: unknown };
  };
  const recordId = body.metadata?.createdRecordIds?.[0];
  if (!recordId) {
    throw new Error(
      `Quickbase created no attachment row: ${JSON.stringify(
        body.metadata?.lineErrors ?? body.metadata ?? {},
      ).slice(0, 300)}`,
    );
  }

  try {
    await attachFile({
      tableId: QB_ATTACHMENTS.table,
      recordId,
      fieldId: f.file,
      fileName: input.fileName,
      bytes: Buffer.from(input.data, "base64"),
    });
  } catch (e) {
    const why = e instanceof Error ? e.message : "the upload failed";
    throw new Error(
      `Attachment record ${recordId} was created but the file did not attach ` +
        `to it: ${why}. Delete that row in Quickbase, or attach the file to it.`,
    );
  }

  return { recordId };
}
