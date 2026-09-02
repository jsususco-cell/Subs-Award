import type { LetterInput } from "./letter";
import type { AwardResult, TierRow } from "./types";

/**
 * Validate a letter payload arriving from the browser.
 *
 * The API renders the letter itself from these values rather than accepting
 * ready-made HTML, so a caller cannot have the server render arbitrary markup.
 */
export function parseLetterInput(raw: unknown): LetterInput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const str = (v: unknown): string => (typeof v === "string" ? v.slice(0, 2000) : "");
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

  const rawResult = o.result;
  if (!rawResult || typeof rawResult !== "object") return null;
  const r = rawResult as Record<string, unknown>;

  const tierRows: TierRow[] = Array.isArray(r.tierRows)
    ? r.tierRows.slice(0, 20).map((t) => {
        const row = (t ?? {}) as Record<string, unknown>;
        return {
          pct: num(row.pct),
          amount: num(row.amount),
          selected: row.selected === true,
        };
      })
    : [];

  const result: AwardResult = {
    base: num(r.base),
    derivedLessOandP: num(r.derivedLessOandP),
    lessOandP: num(r.lessOandP),
    lessOandPIsManual: r.lessOandPIsManual === true,
    tierRows,
    hc: num(r.hc),
    ada: num(r.ada),
    award: num(r.award),
  };

  return {
    jobName: str(o.jobName),
    jobAddress: str(o.jobAddress),
    subcontractor: str(o.subcontractor),
    scopeOfWork: str(o.scopeOfWork),
    jobType: str(o.jobType),
    program: str(o.program),
    startDate: str(o.startDate),
    endDate: str(o.endDate),
    coverages: Array.isArray(o.coverages)
      ? o.coverages.slice(0, 40).map((c) => str(c)).filter(Boolean)
      : [],
    result,
    issuedOn: str(o.issuedOn) || new Date().toISOString(),
  };
}
