import "server-only";
import { QB_CONFIG, isConfigured, queryAll } from "./quickbase";
import { QB_AWARD } from "./qb-award";
import {
  FONDO_FIELDS,
  FONDO_STATUS,
  type FondoCase,
  type FondoStatus,
  fondoConfigured,
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

function val(rec: Record<string, { value: unknown }>, fid: number): unknown {
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

  const poliza = val(r, FONDO_FIELDS.submittedPoliza);
  const fileName =
    poliza && typeof poliza === "object"
      ? str(
          (poliza as { versions?: { fileName?: string }[] }).versions?.[0]?.fileName,
        )
      : "";

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
