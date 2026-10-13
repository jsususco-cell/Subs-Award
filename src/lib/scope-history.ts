import "server-only";
import { readAudit } from "./log";
import { QB_AWARD } from "./qb-award";
import type { ScopeChange } from "./scope-change";

/**
 * What a purchase order was worth before it was last changed, and what each of
 * its milestones was worth.
 *
 * Read out of the System Log rather than out of Quickbase, because Quickbase
 * does not keep it. A field that changes is overwritten: the Billing Line Item
 * table has no history fields at all, and the cost item's Previous Unit Cost
 * holds one step back at most. The before-and-after shown on Vendor status
 * exists only because applyScopeChange wrote it down on the way past.
 *
 * Which means history starts when a scope change is applied through this app.
 * A purchase order changed by hand in Quickbase has no entry here, and shows
 * no previous value — correctly, because nothing recorded one.
 */

/*
 * Both kinds of entry answer the same question.
 *
 * A scope change alters what the contract is worth; an advance moves money
 * between two lines of the schedule and leaves the contract alone. Either way
 * a milestone is worth something different afterwards from what it was worth
 * before, and that is what this is read for. Querying only the scope change
 * meant an advance wrote a perfectly good entry that nothing ever read.
 */
const ACTIONS = ["award.scope.changed", "award.advance.paid"];

interface LoggedLine {
  recordId: number;
  desc: string;
  amount: number;
  pct: number;
  locked: boolean;
}

function parse(json: string): { contract: number; delta: number; lines: LoggedLine[] } | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as Record<string, unknown>;
    return {
      contract: Number(v.contract) || 0,
      delta: Number(v.delta) || 0,
      lines: Array.isArray(v.lines) ? (v.lines as LoggedLine[]) : [],
    };
  } catch {
    // A log line that cannot be read is not worth failing a screen over.
    return null;
  }
}

/**
 * Every recorded scope change for these purchase orders, newest first.
 *
 * One query for the lot: the vendor status screen asks about a subcontractor's
 * whole list at once, and a query each would be a round trip per row.
 */
export async function scopeChangesFor(
  poRecordIds: number[],
): Promise<Map<number, ScopeChange[]>> {
  const out = new Map<number, ScopeChange[]>();
  const ids = [...new Set(poRecordIds.filter((n) => n > 0))];
  if (!ids.length) return out;

  const rows = await readAudit({
    action: ACTIONS,
    targetTable: QB_AWARD.tables.pos,
    targetIds: ids.map(String),
  });

  for (const r of rows) {
    const poRecordId = Number(r.targetId) || 0;
    if (!poRecordId) continue;
    const before = parse(r.before);
    const after = parse(r.after);
    if (!before || !after) continue;

    const lines: ScopeChange["lines"] = {};
    for (const b of before.lines) {
      const a = after.lines.find((x) => x.recordId === b.recordId);
      if (!b.recordId || !a) continue;
      lines[b.recordId] = {
        before: b.amount,
        after: a.amount,
        pctBefore: b.pct,
        pctAfter: a.pct,
        atBefore: null,
      };
    }

    const list = out.get(poRecordId) ?? [];
    list.push({
      at: r.at,
      actor: r.actor,
      contractBefore: before.contract,
      contractAfter: after.contract,
      delta: after.delta || Math.round((after.contract - before.contract) * 100) / 100,
      lines,
    });
    out.set(poRecordId, list);
  }

  // readAudit sorts newest first; keep that per purchase order.
  return out;
}

export type { ScopeChange } from "./scope-change";
export { summarise } from "./scope-change";
