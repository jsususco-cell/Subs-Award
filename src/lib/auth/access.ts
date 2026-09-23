import "server-only";
import { isConfigured, queryAll } from "@/lib/quickbase";
import { accessFrom, NO_ACCESS, type RegionAccess } from "./roster";

/**
 * Which regions a signed-in person may work in.
 *
 * The source of truth is Internal Users, the same table that drives the org
 * chart, so nobody maintains a second list of who works where. Its Region
 * field is already filled in for the people who belong to one state and left
 * blank for head office, which is exactly the distinction this needs.
 *
 * Resolved per request rather than sealed into the session cookie. The ERP
 * puts roles in the cookie and accepts that a change takes effect at the next
 * sign-in; a twelve-hour lag on "which jobs can this person see" is a worse
 * trade, and the cache below makes the query cost nothing in practice.
 */

export const INTERNAL_USERS_TABLE = "buskqh27r";

const F = { recordId: 3, name: 6, adminAccess: 8, email: 11, active: 19, region: 126 } as const;

/**
 * Five minutes. Long enough that a burst of requests costs one query, short
 * enough that adding somebody to a region is visible while you are still
 * looking at the screen.
 */
const TTL_MS = 5 * 60 * 1000;

type Entry = { at: number; access: RegionAccess };
const cache = new Map<string, Entry>();

/** Quickbase where-clause string literals are single-quoted; escape any inside. */
function literal(value: string): string {
  return value.replace(/'/g, "\'");
}

export class AccessUnavailableError extends Error {
  constructor() {
    super(
      "Your regions could not be checked against Quickbase just now, so nothing is shown rather than the wrong thing. Try again in a moment.",
    );
    this.name = "AccessUnavailableError";
  }
}

/**
 * Throws rather than returning "no access" when Quickbase cannot be reached.
 *
 * The two are different and must not be confused: one is a decision, the other
 * is not knowing. Failing closed costs nothing here — every screen in this app
 * is Quickbase data, so an outage has already taken it down — but reporting it
 * as "you have no regions" would send people to IT over a blip.
 */
export async function regionAccess(email: string): Promise<RegionAccess> {
  const key = email.trim().toLowerCase();
  if (!key) return NO_ACCESS;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.access;

  if (!isConfigured()) throw new AccessUnavailableError();

  let rows;
  try {
    rows = await queryAll({
      from: INTERNAL_USERS_TABLE,
      select: [F.recordId, F.name, F.adminAccess, F.email, F.active, F.region],
      where: `{${F.email}.EX.'${literal(key)}'}`,
    });
  } catch (e) {
    console.error("[access] Internal Users lookup failed:", e instanceof Error ? e.message : e);
    throw new AccessUnavailableError();
  }

  // Emails are unique among active records today, but an active one wins if
  // that ever stops being true: a leaver's old row must not scope a rehire.
  const record =
    rows.find((r) => r[F.active]?.value === true) ?? rows[0] ?? null;

  const access = accessFrom(
    record
      ? {
          region: record[F.region]?.value,
          active: record[F.active]?.value === true,
          adminAccess: record[F.adminAccess]?.value === true,
          name: typeof record[F.name]?.value === "string" ? (record[F.name].value as string) : undefined,
          recordId: Number(record[F.recordId]?.value) || undefined,
        }
      : null,
  );

  cache.set(key, { at: Date.now(), access });
  return access;
}

/** Drop a cached decision, so a roster change can be seen without waiting. */
export function forgetAccess(email?: string): void {
  if (email) cache.delete(email.trim().toLowerCase());
  else cache.clear();
}
