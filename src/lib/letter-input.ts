import type { LetterInput } from "./letter";
import { isRegionKey } from "./regions";
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

  /*
   * The region is required and is not defaulted. Everything about the letter
   * follows from it — language, conditions, payment milestones — so a payload
   * that does not say which region it is for is malformed, not a Puerto Rico
   * letter by default.
   */
  if (!isRegionKey(o.region)) return null;

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
    region: o.region,
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
    ...(Array.isArray(o.breakdown)
      ? {
          breakdown: o.breakdown.slice(0, 60).map((entry) => {
            const b = (entry ?? {}) as Record<string, unknown>;
            return {
              desc: str(b.desc),
              pct: num(b.pct),
              amount: num(b.amount),
            };
          }),
        }
      : {}),
    ...(o.categories && typeof o.categories === "object"
      ? {
          categories: (() => {
            const k = o.categories as Record<string, unknown>;
            return {
              demolition: num(k.demolition),
              site: num(k.site),
              septic: num(k.septic),
              home: num(k.home),
              ada: num(k.ada),
              changeOrder: num(k.changeOrder),
              revisedTotal: num(k.revisedTotal),
            };
          })(),
        }
      : {}),
    result,
    issuedOn: str(o.issuedOn) || new Date().toISOString(),
  };
}
