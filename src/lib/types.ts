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

/** A coverage broken down by the group description within it. */
export interface GroupTotal {
  coverage: string;
  groupDesc: string;
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
  /**
   * Less O&P is a manual entry. It starts out derived from the base and the
   * O&P rate, and holds whatever the user types once they override it.
   */
  lessOandPOverride: number | null;
  /** Subcontractor percentage tiers applied to the ex-O&P figure. */
  tiers: number[];
  /** Index into `tiers` of the row that feeds the award. */
  selectedTier: number;
  /** Hard-cost allowance, entered as an absolute amount. */
  hc: number;
}

export interface AwardResult {
  base: number;
  /** What base ÷ (1 + O&P) works out to, regardless of any override. */
  derivedLessOandP: number;
  /** The figure the tiers are actually taken from. */
  lessOandP: number;
  lessOandPIsManual: boolean;
  tierRows: TierRow[];
  hc: number;
  award: number;
}
