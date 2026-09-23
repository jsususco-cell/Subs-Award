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
 * - "HQ" is head office and means every region, the same as leaving the field
 *   blank. It is one of the field's offered choices and nobody has picked it
 *   yet — which is exactly why it is handled here. It is the obvious value for
 *   somebody setting a region on a head-office record, and treating it as an
 *   unknown state would lock them out the moment they chose it.
 * - "VA" (Virginia) appears on inactive records only. An unknown code is
 *   dropped rather than refused — a state the roster tracks and this app does
 *   not is a fact about the business, not a broken record.
 * - No record carries "LA" (Louisiana), although the app has it. So nobody is
 *   scoped to Louisiana today, and only somebody unscoped can award there.
 */
/** The roster's own word for head office, alongside leaving the field blank. */
const HEAD_OFFICE = "HQ";

export function isHeadOffice(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  return raw
    .split(/[,;/]+|\s+/)
    .some((s) => s.trim().toUpperCase() === HEAD_OFFICE);
}

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

/** Why somebody holds the regions they hold. Drives what the app tells them. */
export type Grant =
  /** The states named on their record. */
  | "states"
  /** Admin Access is ticked, which grants every region. */
  | "admin"
  /** "HQ", or no region named at all — head office, so every region. */
  | "head-office"
  /** Nothing. */
  | "none";

export type RegionAccess = {
  /** The regions this person may work in, in the app's display order. */
  regions: RegionKey[];
  /** Why — so the app can say "because you are an admin" rather than guess. */
  grant: Grant;
  /** An active Internal Users record was found for this email. */
  linked: boolean;
  /** Set when a record was found but is marked inactive. */
  inactive: boolean;
  displayName?: string;
  userRid?: number;
};

export const NO_ACCESS: RegionAccess = {
  regions: [],
  grant: "none",
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
  record: {
    region: unknown;
    active: boolean;
    adminAccess?: boolean;
    name?: string;
    recordId?: number;
  } | null,
): RegionAccess {
  if (!record) return NO_ACCESS;
  // Checked before Admin Access, deliberately. Somebody who has left keeps
  // whatever boxes were ticked on the day they left, and a leaver holding
  // every region is the one outcome this must not produce.
  if (!record.active) return { ...NO_ACCESS, inactive: true };

  const identity = {
    linked: true as const,
    inactive: false as const,
    displayName: record.name || undefined,
    userRid: record.recordId,
  };

  // Admin Access outranks the Region field: it is how the roster says "this
  // person is not confined to one state", and it is why an administrator who
  // also happens to work Puerto Rico is not scoped to Puerto Rico.
  if (record.adminAccess === true) {
    return { regions: [...REGION_KEYS], grant: "admin", ...identity };
  }

  // "HQ" and a blank field say the same thing, so they are answered the same
  // way. Read before the state codes, so "HQ, PR" is head office rather than
  // Puerto Rico — the wider claim is the one that was written down.
  if (!record.region || isHeadOffice(record.region)) {
    return { regions: [...REGION_KEYS], grant: "head-office", ...identity };
  }

  const regions = parseRosterRegions(record.region);

  // Named, but nothing this app knows — a record scoped to Virginia only.
  // That is not head office, so it must not fall through to "every region".
  return {
    regions,
    grant: regions.length ? "states" : "none",
    ...identity,
  };
}

/** Whether an access decision covers a region. */
export function allows(access: RegionAccess, region: RegionKey): boolean {
  return access.regions.includes(region);
}

/**
 * Codes on a record that this app does not recognise, kept so that editing
 * somebody's regions cannot quietly throw them away.
 *
 * "VA" is the live example. An administrator ticking Florida on a record that
 * said "VA, FL" must not silently drop Virginia — the roster tracks states
 * this app does not award in, and that is the roster's business, not ours.
 */
export function preservedCodes(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  const known = new Set<string>([...REGION_KEYS, HEAD_OFFICE]);
  return [
    ...new Set(
      raw
        .split(/[,;/]+|\s+/)
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s && !known.has(s)),
    ),
  ];
}

/**
 * Build the Region field's value back up.
 *
 * Head office wins and is written on its own: "HQ, PR" would resolve to head
 * office anyway, so storing both would record a narrowing that has no effect
 * and invite somebody to believe it does.
 */
export function formatRosterRegions(input: {
  headOffice: boolean;
  regions: RegionKey[];
  preserved?: string[];
}): string {
  if (input.headOffice) return HEAD_OFFICE;
  const ordered = REGION_KEYS.filter((k) => input.regions.includes(k));
  return [...ordered, ...(input.preserved ?? [])].join(", ");
}
