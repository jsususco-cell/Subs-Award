/** One line of a scope-of-work export. */
export interface ScopeItem {
  /** Row number as it appeared in the sheet (1-based, matches Excel). */
  row: number;
  lineNo: number | null;
  groupCode: string;
  groupDesc: string;
  desc: string;
  qty: number;
  unitCost: number;
  itemAmount: number;
  salesTax: number;
  rcv: number;
  acv: number;
  coverage: string;
  cat: string;
  sel: string;
}

/** A row the parser saw but did not treat as a line item. */
export interface IgnoredRow {
  row: number;
  reason: string;
  preview: string;
}

export interface ParseResult {
  sheetName: string;
  headerRow: number;
  items: ScopeItem[];
  ignored: IgnoredRow[];
  /** Header labels that were mapped, for the "what we read" disclosure. */
  mappedColumns: Record<string, string>;
}

/** Which money column feeds the totals. */
export type AmountBasis = "rcv" | "acv" | "itemAmount";

export interface CoverageGroup {
  coverage: string;
  count: number;
  rcv: number;
  acv: number;
  itemAmount: number;
  salesTax: number;
}

export interface TierRow {
  pct: number;
  amount: number;
  selected: boolean;
}

export interface AwardSettings {
  basis: AmountBasis;
  /** Coverage codes summed into the Demo/Site base. */
  baseCoverages: string[];
  /** Overhead & profit percentage baked into the base, e.g. 32. */
  oandpPct: number;
  /** Percentage tiers applied to the ex-O&P figure, e.g. [50, 60, 70]. */
  tiers: number[];
  /** Index into `tiers` of the row that feeds the award. */
  selectedTier: number;
  /** Hard-cost allowance, entered as an absolute amount. */
  hc: number;
}

export interface AwardResult {
  base: number;
  lessOandP: number;
  tierRows: TierRow[];
  hc: number;
  award: number;
}
