/**
 * Quickbase access. SERVER ONLY — this module reads the user token and must
 * never be imported from a client component. It is used by the /api/qb route.
 */

const API = "https://api.quickbase.com/v1";

export const QB_CONFIG = {
  realm: process.env.QB_REALM ?? "byrdsonservices.quickbase.com",
  token: process.env.QB_USER_TOKEN ?? "",
  region: process.env.QB_REGION ?? "Puerto Rico",
  tables: {
    jobs: process.env.QB_JOBS_TABLE ?? "buskqh27b",
    vendors: process.env.QB_VENDORS_TABLE ?? "buskqh272",
  },
  fields: {
    jobs: {
      recordId: 3,
      name: 6,
      region: 11,
      // Not confirmed in the Jobs table — run `npm run qb:introspect` to find
      // it, then set QB_JOB_ADDRESS_FID. Zero means "do not select it".
      address: Number(process.env.QB_JOB_ADDRESS_FID ?? 0),
    },
    vendors: {
      recordId: 3,
      company: 23,
      trade: 34,
      eligible: 182,
      // Created by `npm run qb:add-vendor-region`; zero means the region
      // filter cannot be applied yet.
      region: Number(process.env.QB_VENDOR_REGION_FID ?? 0),
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

function text(record: QbRecord, fid: number): string {
  const v = record[String(fid)]?.value;
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

export interface JobOption {
  id: string;
  name: string;
  address: string;
}

export interface SubOption {
  id: string;
  company: string;
  trade: string;
}

/** Jobs in the configured region, minus templates and scratch records. */
export async function fetchJobs(): Promise<{ items: JobOption[]; warning?: string }> {
  const f = QB_CONFIG.fields.jobs;
  const select: number[] = [f.recordId, f.name, f.region];
  if (f.address) select.push(f.address);

  const rows = await queryAll({
    from: QB_CONFIG.tables.jobs,
    select,
    where: `{${f.region}.EX.'${QB_CONFIG.region}'}`,
    sortBy: [{ fieldId: f.name, order: "ASC" }],
  });

  const items = rows
    .map((r) => ({
      id: text(r, f.recordId),
      name: text(r, f.name),
      address: f.address ? text(r, f.address) : "",
    }))
    .filter((j) => j.name && !EXCLUDED_JOB_NAMES.test(j.name));

  return {
    items,
    warning: f.address
      ? undefined
      : "Job address is not wired up — set QB_JOB_ADDRESS_FID (see npm run qb:introspect).",
  };
}

/** Award-eligible vendors, region-filtered once the Region field exists. */
export async function fetchSubs(): Promise<{ items: SubOption[]; warning?: string }> {
  const f = QB_CONFIG.fields.vendors;
  const select: number[] = [f.recordId, f.company, f.trade];
  if (f.region) select.push(f.region);

  const eligible = `{${f.eligible}.EX.true}`;
  const regional = f.region
    ? `${eligible}AND{${f.region}.EX.'${QB_CONFIG.region}'}`
    : eligible;

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
      }))
      .filter((s) => s.company);
  };

  if (!f.region) {
    return {
      items: await read(eligible),
      warning: `Showing all award-eligible vendors — not filtered to ${QB_CONFIG.region}. Run npm run qb:add-vendor-region, then set QB_VENDOR_REGION_FID.`,
    };
  }

  const items = await read(regional);
  if (items.length > 0) return { items };

  // An empty result usually means the Region field exists but has not been
  // filled in yet. Falling back keeps the letter workable, and the warning
  // makes it obvious the list is not actually region-filtered.
  const fallback = await read(eligible);
  if (fallback.length === 0) return { items: [] };

  return {
    items: fallback,
    warning: `No vendors are marked "${QB_CONFIG.region}" yet, so all ${fallback.length} award-eligible vendors are shown. Populate the Region field on the Vendors table to filter this list.`,
  };
}
