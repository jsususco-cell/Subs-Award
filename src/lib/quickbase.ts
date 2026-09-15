/**
 * Quickbase access. SERVER ONLY — this module reads the user token and must
 * never be imported from a client component. It is used by the /api/qb route.
 */

import type { RegionConfig } from "./regions";

const API = "https://api.quickbase.com/v1";

/**
 * Which region a lookup is for is no longer a deployment setting: one
 * deployment serves every region and the caller passes the one it wants. See
 * src/lib/regions.ts. QB_REGION and QB_VENDOR_REGIONS are retired.
 */
export const QB_CONFIG = {
  realm: process.env.QB_REALM ?? "byrdsonservices.quickbase.com",
  token: process.env.QB_USER_TOKEN ?? "",
  tables: {
    jobs: process.env.QB_JOBS_TABLE ?? "buskqh27b",
    vendors: process.env.QB_VENDORS_TABLE ?? "buskqh272",
  },
  fields: {
    jobs: {
      recordId: 3,
      name: 6,
      region: 11,
      // Composite address field; returns a formatted single line such as
      // "Calle Orlando Olivero Casa 10, Canovanas, Puerto Rico 00972".
      // Field 11 is its State/Region child, which is what the region filter
      // uses, and which carries the state name for mainland jobs.
      address: Number(process.env.QB_JOB_ADDRESS_FID ?? 7),
      // Drives which payment schedule the award letter uses.
      jobType: Number(process.env.QB_JOB_TYPE_FID ?? 34),
    },
    vendors: {
      recordId: 3,
      company: 23,
      trade: 34,
      eligible: 182,
      email: Number(process.env.QB_VENDOR_EMAIL_FID ?? 28),
      // Already exists on the Vendors table. Choices are Puerto Rico,
      // Mainland, Both, No work on file — a coarse bucket, so every mainland
      // state matches the same vendors until it is split by state.
      region: Number(process.env.QB_VENDOR_REGION_FID ?? 206),
    },
  },
} as const;

export function isConfigured(): boolean {
  return QB_CONFIG.token.length > 0;
}

/**
 * Job names that are templates or scratch records. Mirrors the same list the
 * Quickbase award code page uses — note "demo" is deliberately absent so that
 * Demolition jobs are not swept up.
 */
export const EXCLUDED_JOB_NAMES =
  /\btest|template|\bdelete me\b|\bsandbox\b|\bdummy\b|\bsample\b/i;

interface QueryBody {
  from: string;
  select: number[];
  where?: string;
  sortBy?: { fieldId: number; order: "ASC" | "DESC" }[];
  options?: { skip?: number; top?: number };
}

type QbValue = { value: unknown };
type QbRecord = Record<string, QbValue>;

interface QbResponse {
  data: QbRecord[];
  metadata: { totalRecords: number; numRecords: number; skip: number };
}

async function queryOnce(body: QueryBody): Promise<QbResponse> {
  const res = await fetch(`${API}/records/query`, {
    method: "POST",
    headers: {
      "QB-Realm-Hostname": QB_CONFIG.realm,
      Authorization: `QB-USER-TOKEN ${QB_CONFIG.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // Never echo the token back, even indirectly.
    throw new Error(
      `Quickbase ${res.status} querying ${body.from}: ${detail.slice(0, 300)}`,
    );
  }
  return (await res.json()) as QbResponse;
}

/** Query every page of a table, not just the first. */
export async function queryAll(body: QueryBody): Promise<QbRecord[]> {
  const rows: QbRecord[] = [];
  let skip = 0;

  for (let page = 0; page < 50; page++) {
    const chunk = await queryOnce({
      ...body,
      options: { ...body.options, skip, top: 1000 },
    });
    rows.push(...chunk.data);
    skip += chunk.metadata.numRecords;
    if (chunk.metadata.numRecords === 0 || rows.length >= chunk.metadata.totalRecords) {
      break;
    }
  }
  return rows;
}

/**
 * Read a field as text. Strips zero-width and non-breaking characters, which
 * some vendor records carry from pasted data — they are invisible but break
 * sorting and exact-match comparisons.
 */
function text(record: QbRecord, fid: number): string {
  const v = record[String(fid)]?.value;
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .trim();
}

export interface JobOption {
  id: string;
  name: string;
  address: string;
  jobType: string;
}

export interface SubOption {
  id: string;
  company: string;
  trade: string;
  email: string;
}

/** Jobs in the given region, minus templates and scratch records. */
export async function fetchJobs(
  region: RegionConfig,
): Promise<{ items: JobOption[]; warning?: string }> {
  const f = QB_CONFIG.fields.jobs;
  const select: number[] = [f.recordId, f.name, f.region];
  if (f.address) select.push(f.address);
  if (f.jobType) select.push(f.jobType);

  const rows = await queryAll({
    from: QB_CONFIG.tables.jobs,
    select,
    where: `{${f.region}.EX.'${region.jobRegion.replace(/'/g, "")}'}`,
    sortBy: [{ fieldId: f.name, order: "ASC" }],
  });

  const items = rows
    .map((r) => ({
      id: text(r, f.recordId),
      name: text(r, f.name),
      address: f.address ? text(r, f.address) : "",
      jobType: f.jobType ? text(r, f.jobType) : "",
    }))
    .filter((j) => j.name && !EXCLUDED_JOB_NAMES.test(j.name))
    // Sort here, not in the query: Quickbase orders by the raw stored value,
    // so a record with an invisible prefix would sort ahead of everything.
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    items,
    warning: f.address
      ? undefined
      : "Job address is not wired up — set QB_JOB_ADDRESS_FID (see npm run qb:introspect).",
  };
}

/** Award-eligible vendors for a region. */
export async function fetchSubs(
  region: RegionConfig,
): Promise<{ items: SubOption[]; warning?: string }> {
  const f = QB_CONFIG.fields.vendors;
  const select: number[] = [f.recordId, f.company, f.trade];
  if (f.region) select.push(f.region);
  if (f.email) select.push(f.email);

  const eligible = `{${f.eligible}.EX.true}`;
  const regionOr = region.vendorRegions
    .map((v) => `{${f.region}.EX.'${v.replace(/'/g, "")}'}`)
    .join("OR");
  const regional =
    f.region && regionOr ? `${eligible}AND(${regionOr})` : eligible;

  const read = async (where: string) => {
    const rows = await queryAll({
      from: QB_CONFIG.tables.vendors,
      select,
      where,
      sortBy: [{ fieldId: f.company, order: "ASC" }],
    });
    return rows
      .map((r) => ({
        id: text(r, f.recordId),
        company: text(r, f.company),
        trade: text(r, f.trade),
        email: f.email ? text(r, f.email) : "",
      }))
      .filter((s) => s.company)
      .sort((a, b) => a.company.localeCompare(b.company));
  };

  if (!f.region) {
    return {
      items: await read(eligible),
      warning: `Showing all award-eligible vendors — not filtered to ${region.label}. Set QB_VENDOR_REGION_FID (see npm run qb:vendor-regions).`,
    };
  }

  const items = await read(regional);
  if (items.length > 0) return { items };

  /*
   * No vendor matches. This used to fall back to every award-eligible vendor,
   * which was harmless while Puerto Rico was the only region and actively
   * wrong now: the mainland states have no award-eligible vendor at all, so
   * the fallback would offer Puerto Rico subcontractors for a Florida job and
   * only whisper about it in a warning. An empty list that says why is safer
   * than a plausible list that is wrong.
   */
  const eligibleCount = (await read(eligible)).length;
  return {
    items: [],
    warning:
      `No subcontractor is both award-eligible and marked ${region.vendorRegions
        .map((v) => `"${v}"`)
        .join(" or ")} on the Subs/Vendors table, so there is nobody to award ` +
      `${region.label} work to. ${eligibleCount} vendor${eligibleCount === 1 ? " is" : "s are"} ` +
      `award-eligible overall — none of them in this region. Set Eligible for Award ` +
      `and Region in Quickbase, then reopen this list.`,
  };
}
