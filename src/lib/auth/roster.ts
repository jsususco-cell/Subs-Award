import { REGION_KEYS, type RegionKey } from "@/lib/regions";

/**
 * Reading the Region field on a Quickbase Internal Users record.
 *
 * It is a multiple-choice text field holding state codes, and the live values
 * are exactly this shape: "PR", "FL", "TX", "FL, NC", "FL, TX, NC". Parsing is
 * kept here, away from the Quickbase call, so the rules below are testable
 * against those strings without a network.
 *
 * Two values in the table are not regions this app awards in:
 *
 * - "VA" (Virginia) appears on inactive records only. An unknown code is
 *   dropped rather than refused — a state the roster tracks and this app does
 *   not is a fact about the business, not a broken record.
 * - No record carries "LA" (Louisiana), although the app has it. So nobody is
 *   scoped to Louisiana today, and only somebody unscoped can award there.
 */
export function parseRosterRegions(raw: unknown): RegionKey[] {
  if (typeof raw !== "string") return [];
  const codes = new Set(
    raw
      .split(/[,;/]+|\s+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  );
  return REGION_KEYS.filter((key) => codes.has(key));
}

export type RegionAccess = {
  /** The regions this person may work in, in the app's display order. */
  regions: RegionKey[];
  /**
   * True when the record exists and is active but names no region, which in
   * this roster means head office: the ones with no region set are the CEO,
   * the Owner, the VP of Operations, the Financial Controller, finance and
   * IT. Scoping them to nothing would lock out exactly the people who need
   * every region.
   */
  unscoped: boolean;
  /** An active Internal Users record was found for this email. */
  linked: boolean;
  /** Set when a record was found but is marked inactive. */
  inactive: boolean;
  displayName?: string;
  userRid?: number;
};

export const NO_ACCESS: RegionAccess = {
  regions: [],
  unscoped: false,
  linked: false,
  inactive: false,
};

/**
 * Turn one Internal Users record into an access decision.
 *
 * Passing `null` means no record matched the email, which is refused: the
 * roster is the access list, so somebody it does not know has nothing to work
 * on here. An inactive record is refused the same way and says so, because
 * "you have left" and "IT has not added you" need different answers.
 */
export function accessFrom(
  record: { region: unknown; active: boolean; name?: string; recordId?: number } | null,
): RegionAccess {
  if (!record) return NO_ACCESS;
  if (!record.active) return { ...NO_ACCESS, inactive: true };

  const named = typeof record.region === "string" && record.region.trim().length > 0;
  const regions = parseRosterRegions(record.region);

  // Named but nothing this app knows — a record scoped to Virginia only. That
  // is not head office, so it must not fall through to "every region".
  if (named && regions.length === 0) {
    return { regions: [], unscoped: false, linked: true, inactive: false,
      displayName: record.name || undefined, userRid: record.recordId };
  }

  return {
    // Unscoped is expanded here, so no caller has to remember to special-case it.
    regions: named ? regions : [...REGION_KEYS],
    unscoped: !named,
    linked: true,
    inactive: false,
    displayName: record.name || undefined,
    userRid: record.recordId,
  };
}

/** Whether an access decision covers a region. */
export function allows(access: RegionAccess, region: RegionKey): boolean {
  return access.regions.includes(region);
}
