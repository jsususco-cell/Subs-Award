import "server-only";
import { logAudit, readAudit } from "./log";
import { QB_AWARD } from "./qb-award";
import { FONDO_FIELDS } from "./fondo";
import { queryAll } from "./quickbase";

/**
 * Fondo case history.
 *
 * Every activity on a case is written to the central System Log (Audit table,
 * app bwde929pp) as `fondo.<what>`, against this table and the case's record
 * id. The page reads them back per case. Events from before this existed
 * (28 Oct 2026) are rebuilt from the dates already on the case, and marked as
 * such, so the history never starts blank.
 *
 * Logging never throws: a failed history line must not fail the send, the
 * approval or the upload it describes.
 */

export type FondoAction =
  | "case.opened"
  | "link.sent"
  | "link.auto-sent"
  | "reminder.sent"
  | "submitted"
  | "approved"
  | "returned";

const TABLE = QB_AWARD.tables.insurance;
const ACTIONS: FondoAction[] = [
  "case.opened",
  "link.sent",
  "link.auto-sent",
  "reminder.sent",
  "submitted",
  "approved",
  "returned",
];

export async function recordFondo(
  action: FondoAction,
  recordId: number,
  actor: string,
  /** One line a person reads in the History panel. */
  note: string,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    await logAudit({
      action: `fondo.${action}`,
      actor: actor || "system",
      outcome: "ok",
      target: { table: TABLE, recordId },
      after: { note },
      details,
    });
  } catch (e) {
    console.error("[fondo-history]", e instanceof Error ? e.message : e);
  }
}

export interface HistoryEntry {
  at: string;
  actor: string;
  action: string;
  note: string;
  /** Rebuilt from the case's own dates, from before history was logged. */
  fromRecord: boolean;
}

function noteOf(after: string): string {
  try {
    const v = JSON.parse(after) as { note?: unknown };
    return typeof v.note === "string" ? v.note : "";
  } catch {
    return "";
  }
}

/** Everything that happened to one case, newest first. */
export async function caseHistory(recordId: number): Promise<HistoryEntry[]> {
  const ins = QB_AWARD.insurance;
  const [logged, rows] = await Promise.all([
    readAudit({
      action: ACTIONS.map((a) => `fondo.${a}`),
      targetTable: TABLE,
      targetIds: [String(recordId)],
      limit: 200,
    }),
    queryAll({
      from: TABLE,
      select: [
        1, // Date Created
        4, // Record Owner
        ins.recordId,
        ins.source,
        FONDO_FIELDS.formSentAt,
        FONDO_FIELDS.submittedAt,
        ins.submittedBy,
        FONDO_FIELDS.reviewedAt,
        FONDO_FIELDS.reviewedBy,
        FONDO_FIELDS.status,
        FONDO_FIELDS.reminderCount,
        FONDO_FIELDS.lastReminderAt,
      ],
      where: `{${ins.recordId}.EX.${recordId}}`,
    }).catch(() => []),
  ]);

  const entries: HistoryEntry[] = logged.map((l) => ({
    at: l.at,
    actor: l.actor,
    action: l.action.replace(/^fondo\./, ""),
    note: noteOf(l.after),
    fromRecord: false,
  }));

  // Rebuild the older steps from the case's own dates, unless the log already
  // has that kind of event (then the log's entry is the better one).
  const r = rows[0];
  if (r) {
    const v = (f: number) => {
      const x = r[String(f)]?.value;
      return x && typeof x === "object" && "name" in (x as object)
        ? String((x as { name?: unknown }).name ?? "")
        : x == null
          ? ""
          : String(x);
    };
    const has = (a: string) => entries.some((e) => e.action === a);
    const add = (at: string, action: string, actor: string, note: string) => {
      if (at) entries.push({ at, actor, action, note, fromRecord: true });
    };
    if (!has("case.opened")) {
      add(v(1), "case.opened", v(4), `Case created (${v(ins.source) || "source not recorded"}).`);
    }
    if (!has("link.sent") && !has("link.auto-sent")) {
      add(v(FONDO_FIELDS.formSentAt), "link.sent", "", "Form link emailed to the subcontractor.");
    }
    if (!has("submitted")) {
      add(v(FONDO_FIELDS.submittedAt), "submitted", v(ins.submittedBy), "Poliza submitted.");
    }
    const status = v(FONDO_FIELDS.status);
    if (!has("approved") && !has("returned") && v(FONDO_FIELDS.reviewedAt)) {
      add(
        v(FONDO_FIELDS.reviewedAt),
        status === "Returned for correction" ? "returned" : "approved",
        v(FONDO_FIELDS.reviewedBy),
        status === "Returned for correction" ? "Sent back for correction." : "Approved.",
      );
    }
  }

  return entries.sort((a, b) => b.at.localeCompare(a.at));
}
