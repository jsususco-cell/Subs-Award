import { groupByCoverage, isDemoSite } from "./award";
import type { AmountBasis, CoverageGroup, GroupTotal, ScopeItem } from "./types";

/**
 * The column order of the structured scope-of-work template. Extraction
 * reshapes a raw export into exactly these columns.
 */
export const TEMPLATE_COLUMNS = [
  "#",
  "Group Code",
  "Group Description",
  "Desc",
  "Qty",
  "Item Amount",
  "Unit Cost",
  "Coverage",
  "Sales Tax",
  "RCV",
  "ACV",
] as const;

export interface Extraction {
  /** Every coverage present in the raw file, whether kept or not. */
  allCoverages: CoverageGroup[];
  /** The coverage codes being kept. */
  keptCoverages: string[];
  /**
   * Every line in the kept coverages, in original sheet order — including the
   * ones ticked off, so the preview can still show and un-tick them.
   */
  items: ScopeItem[];
  /** Sheet row numbers the reviewer has excluded from the calculation. */
  excludedRows: number[];
  /** The lines that actually count: `items` minus the excluded ones. */
  includedItems: ScopeItem[];
  /** Coverage roll-up over the INCLUDED lines only. */
  keptGroups: CoverageGroup[];
  /** Included lines broken down by coverage then group description. */
  breakdown: GroupTotal[];
  rawCount: number;
  /** How many lines the coverage filter kept, before any exclusions. */
  keptCount: number;
  droppedCount: number;
  excludedCount: number;
  /** RCV of the excluded lines, so the reviewer can see what was set aside. */
  excludedTotal: number;
  /** Coverages the raw file was expected to have but does not. */
  missingCoverages: string[];
}

/**
 * Filter a parsed raw export down to the coverages that form the Demo/Site
 * scope, and roll the result up for preview.
 *
 * `expected` is only used to report what is absent — a raw file that contains
 * no CE-DEMO lines is a legitimate result (a repair job has none), so the
 * extraction succeeds and simply says so rather than failing.
 *
 * `excludedRows` are sheet row numbers the reviewer has ticked off. They stay
 * in `items` so the preview can show them struck through and let them back in,
 * but every total is computed without them. Row numbers are used as the key
 * because they survive a change to the coverage selection.
 */
export function extract(
  items: ScopeItem[],
  keptCoverages: string[],
  expected: string[] = [],
  excludedRows: number[] = [],
): Extraction {
  const keep = new Set(keptCoverages);
  const kept = items.filter((i) => keep.has(i.coverage));
  const present = new Set(items.map((i) => i.coverage.trim().toUpperCase()));

  const excluded = new Set(excludedRows);
  const included = kept.filter((i) => !excluded.has(i.row));
  const setAside = kept.filter((i) => excluded.has(i.row));

  return {
    allCoverages: groupByCoverage(items),
    keptCoverages,
    items: kept,
    excludedRows,
    includedItems: included,
    keptGroups: groupByCoverage(included),
    breakdown: groupTotals(included),
    rawCount: items.length,
    keptCount: kept.length,
    droppedCount: items.length - kept.length,
    excludedCount: setAside.length,
    excludedTotal: setAside.reduce((sum, i) => sum + i.rcv, 0),
    missingCoverages: expected.filter((c) => !present.has(c.trim().toUpperCase())),
  };
}

/** Toggle one line in or out of the calculation. */
export function toggleExcluded(excludedRows: number[], row: number): number[] {
  return excludedRows.includes(row)
    ? excludedRows.filter((r) => r !== row)
    : [...excludedRows, row].sort((a, b) => a - b);
}

/** Break items down by coverage, then by the group description within it. */
export function groupTotals(items: ScopeItem[]): GroupTotal[] {
  const map = new Map<string, GroupTotal>();
  for (const item of items) {
    const groupDesc = item.groupDesc || item.groupCode || "(ungrouped)";
    const key = JSON.stringify([item.coverage, groupDesc]);
    let g = map.get(key);
    if (!g) {
      g = {
        coverage: item.coverage,
        groupDesc,
        count: 0,
        rcv: 0,
        acv: 0,
        itemAmount: 0,
        salesTax: 0,
      };
      map.set(key, g);
    }
    g.count += 1;
    g.rcv += item.rcv;
    g.acv += item.acv;
    g.itemAmount += item.itemAmount;
    g.salesTax += item.salesTax;
  }
  return [...map.values()].sort(
    (a, b) => a.coverage.localeCompare(b.coverage) || b.rcv - a.rcv,
  );
}

/**
 * A human label for whatever coverages are selected. Demo/Site is only one
 * possible choice, so the label follows the selection rather than assuming it:
 * the Demo/Site shorthand is used only when the pick really is that pair.
 */
export function coverageLabel(kept: string[]): string {
  if (!kept.length) return "No coverage selected";
  if (kept.length > 1 && kept.every(isDemoSite)) return "Demo/Site";
  if (kept.length <= 3) return [...kept].sort().join(" + ");
  return `${kept.length} coverages`;
}

/** Which coverages in a raw file look like Demo/Site scope. */
export function demoSiteCoveragesIn(groups: CoverageGroup[]): string[] {
  return groups.filter((g) => isDemoSite(g.coverage)).map((g) => g.coverage);
}

/** One extracted item as a row of the structured template. */
export function templateRow(item: ScopeItem, index: number): (string | number)[] {
  return [
    index + 1,
    item.groupCode,
    item.groupDesc,
    item.desc,
    item.qty,
    round(item.itemAmount),
    round(item.unitCost),
    item.coverage,
    round(item.salesTax),
    round(item.rcv),
    round(item.acv),
  ];
}

export function totalOf(items: ScopeItem[], basis: AmountBasis): number {
  return items.reduce((sum, i) => sum + i[basis], 0);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
