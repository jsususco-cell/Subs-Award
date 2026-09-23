import "server-only";
import { QB_CONFIG, isConfigured, queryAll } from "@/lib/quickbase";
import { logAudit } from "@/lib/log";
import { accessFrom, type RegionAccess } from "./roster";
import { forgetAccess, INTERNAL_USERS_TABLE } from "./access";

/**
 * Reading and writing the roster that decides who sees which region.
 *
 * Kept deliberately narrow. This edits two fields — Region and Admin Access —
 * and nothing else. Active is shown but never written: whether somebody still
 * works here is an employment fact with consequences well beyond this app, and
 * an award tool is not where it should be settled.
 */

export const ROSTER_FIELDS = {
  recordId: 3,
  name: 6,
  adminAccess: 8,
  email: 11,
  active: 19,
  designation: 7,
  region: 126,
} as const;

export type RosterRow = {
  recordId: number;
  name: string;
  email: string;
  designation: string;
  active: boolean;
  adminAccess: boolean;
  /** Exactly what the field holds, so the screen can show the truth. */
  region: string;
  /** What that resolves to, which is what the person actually experiences. */
  access: RegionAccess;
};

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

export async function listRoster(): Promise<RosterRow[]> {
  if (!isConfigured()) return [];
  const rows = await queryAll({
    from: INTERNAL_USERS_TABLE,
    select: Object.values(ROSTER_FIELDS) as number[],
  });

  return rows
    .map((r) => {
      const active = r[ROSTER_FIELDS.active]?.value === true;
      const adminAccess = r[ROSTER_FIELDS.adminAccess]?.value === true;
      const region = str(r[ROSTER_FIELDS.region]?.value);
      return {
        recordId: Number(r[ROSTER_FIELDS.recordId]?.value) || 0,
        name: str(r[ROSTER_FIELDS.name]?.value),
        email: str(r[ROSTER_FIELDS.email]?.value).toLowerCase(),
        designation: str(r[ROSTER_FIELDS.designation]?.value),
        active,
        adminAccess,
        region,
        access: accessFrom({ region, active, adminAccess }),
      };
    })
    // Somebody with no email cannot sign in, so they cannot be given access
    // here either. Listing them would only invite edits that do nothing.
    .filter((r) => r.recordId && r.email)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function rosterRow(recordId: number): Promise<RosterRow | null> {
  const all = await listRoster();
  return all.find((r) => r.recordId === recordId) ?? null;
}

/**
 * Write one person's access, and record who changed it.
 *
 * The audit entry carries before and after, because "who widened this" is the
 * question anybody will actually ask later.
 */
export async function updateRosterAccess(input: {
  recordId: number;
  region: string;
  adminAccess: boolean;
  actor: string;
}): Promise<RosterRow> {
  const before = await rosterRow(input.recordId);
  if (!before) throw new Error("That person is no longer on the roster.");

  const res = await fetch("https://api.quickbase.com/v1/records", {
    method: "POST",
    headers: {
      "QB-Realm-Hostname": QB_CONFIG.realm,
      Authorization: `QB-USER-TOKEN ${QB_CONFIG.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: INTERNAL_USERS_TABLE,
      data: [
        {
          [ROSTER_FIELDS.recordId]: { value: input.recordId },
          [ROSTER_FIELDS.region]: { value: input.region },
          [ROSTER_FIELDS.adminAccess]: { value: input.adminAccess },
        },
      ],
      fieldsToReturn: [ROSTER_FIELDS.recordId],
    }),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Quickbase ${res.status}: ${text.slice(0, 300)}`);
  }

  // The cached decision lives in whichever instance answered that person's
  // last request, so clearing it here only helps if that was this one. The
  // five-minute ceiling is what actually bounds the wait, and the screen says
  // so rather than promising an immediacy it cannot deliver.
  forgetAccess(before.email);

  await logAudit({
    action: "access.region.changed",
    actor: input.actor,
    outcome: "ok",
    target: { table: INTERNAL_USERS_TABLE, recordId: input.recordId },
    changedFields: [
      ...(before.region !== input.region ? ["Region"] : []),
      ...(before.adminAccess !== input.adminAccess ? ["Admin Access"] : []),
    ],
    before: { region: before.region, adminAccess: before.adminAccess },
    after: { region: input.region, adminAccess: input.adminAccess },
    details: { subject: before.email },
  });

  const after = await rosterRow(input.recordId);
  if (!after) throw new Error("The change was written but the record could not be read back.");
  return after;
}
