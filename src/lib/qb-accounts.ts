import "server-only";
import { queryAll } from "./quickbase";
import type { RegionConfig } from "./regions";

/**
 * Which QuickBooks account a region's subcontractor cost posts to.
 *
 * SERVER ONLY — this reaches Quickbase with the user token, and the import
 * above makes that a build error rather than a code review note if a client
 * component ever pulls it in.
 *
 * Resolved from the QB Line Items table rather than pinned in code, because
 * the chart of accounts moves: on 2026-09-01 the Puerto Rico account #182
 * "Subcontractors - Puerto Rico" was marked inactive and #233 "Subcontractors"
 * took over, and this app went on pointing at the inactive one. Reading the
 * rule at write time instead of the answer means the next such change is
 * followed rather than repeated.
 *
 * The rule: the account named "Subcontractors" whose QBO Location matches the
 * region and whose Status is Active. Anything other than exactly one match is
 * an error — posting cost to a guessed account is worse than refusing.
 */

/** The QB Line Items table, and the fields the rule reads. */
export const QB_LINE_ITEMS = {
  table: "bukmmdyxt",
  fields: {
    recordId: 3,
    name: 6,
    /** The QuickBooks account id, one per location. */
    qboAccountIdUs: 22,
    qboAccountIdPr: 23,
    /** "US" or "PR". */
    location: 24,
    inactiveCoa: 26,
    /** "Active" / "Inactive". */
    status: 27,
  },
} as const;

/** The account name the subcontractor cost posts to, in both locations. */
export const SUBCONTRACTOR_ACCOUNT = "Subcontractors";

export interface QbAccount {
  /** Record id, written to Cost Items fid 13 (Related QB Line Item). */
  id: number;
  /** Account name, written to Billing Line Item fid 41 as plain text. */
  label: string;
  /** The QuickBooks account id, for reference — never written from here. */
  qboAccountId: number;
}

interface Cached {
  at: number;
  account: QbAccount;
}

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, Cached>();

/** Drop the cache, so a chart-of-accounts change is picked up at once. */
export function clearAccountCache(): void {
  cache.clear();
}

export async function resolveSubcontractorAccount(
  region: RegionConfig,
): Promise<QbAccount> {
  const location = region.qboLocation;

  const hit = cache.get(location);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.account;

  const f = QB_LINE_ITEMS.fields;
  const rows = await queryAll({
    from: QB_LINE_ITEMS.table,
    select: [
      f.recordId,
      f.name,
      f.location,
      f.status,
      f.inactiveCoa,
      f.qboAccountIdUs,
      f.qboAccountIdPr,
    ],
    where:
      `{${f.name}.EX.'${SUBCONTRACTOR_ACCOUNT}'}` +
      `AND{${f.location}.EX.'${location}'}` +
      `AND{${f.status}.EX.'Active'}`,
  });

  const num = (r: Record<string, { value: unknown }>, fid: number): number =>
    Number(r[String(fid)]?.value) || 0;
  const str = (r: Record<string, { value: unknown }>, fid: number): string =>
    String(r[String(fid)]?.value ?? "").trim();

  if (rows.length !== 1) {
    throw new Error(
      `Expected exactly one active "${SUBCONTRACTOR_ACCOUNT}" account for QBO ` +
        `location ${location} (${region.label}), found ${rows.length}. ` +
        (rows.length === 0
          ? `Nothing was written. Check the QB Line Items table: the account ` +
            `must be named "${SUBCONTRACTOR_ACCOUNT}" exactly, carry QBO ` +
            `Location ${location}, and have Status "Active".`
          : `Nothing was written rather than posting cost to a guessed one — ` +
            `records ${rows.map((r) => `#${num(r, f.recordId)}`).join(", ")} ` +
            `all match. Deactivate the ones that are no longer in use.`),
    );
  }

  const row = rows[0];
  const account: QbAccount = {
    id: num(row, f.recordId),
    label: str(row, f.name),
    qboAccountId:
      location === "PR" ? num(row, f.qboAccountIdPr) : num(row, f.qboAccountIdUs),
  };

  cache.set(location, { at: Date.now(), account });
  return account;
}

/**
 * The account, or the reason there isn't one. Used where a failure should be
 * reported rather than thrown — the award route checks this before its first
 * write, since Quickbase has no transactions and a purchase order created
 * without a cost item carries no contract amount.
 */
export async function trySubcontractorAccount(
  region: RegionConfig,
): Promise<{ account: QbAccount } | { error: string }> {
  try {
    return { account: await resolveSubcontractorAccount(region) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not resolve the account." };
  }
}

/** Unused ids kept as documentation of what the rule deliberately excludes. */
export const RETIRED_ACCOUNTS = {
  /** "Subcontractors - Puerto Rico". Inactive since 2026-09-01, replaced by #233. */
  prExpense: 182,
} as const;
