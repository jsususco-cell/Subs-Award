import type {
  AmountBasis,
  AwardResult,
  AwardSettings,
  CoverageGroup,
  ScopeItem,
} from "./types";

export const DEFAULT_OANDP_PCT = 32;

/** Subcontractor percentage tiers offered by default. */
export const DEFAULT_TIERS = [50, 55, 60];

/** Prefilled hard-cost allowance. */
export const DEFAULT_HC = 122000;

/** The coverages that make up the Demo/Site scope. */
export const DEMO_SITE_COVERAGES = ["CE-DEMO", "CE-SITE"];

const DEMO_SITE_EXACT = /^ce-\s*(demo|site)\b/i;
const DEMO_SITE_LOOSE = /(demo|site)/i;

/** Does this coverage code belong to the Demo/Site scope? */
export function isDemoSite(coverage: string): boolean {
  return DEMO_SITE_EXACT.test(coverage.trim());
}

export function amountOf(item: ScopeItem, basis: AmountBasis): number {
  return item[basis];
}

/** Roll line items up by coverage code, sorted by descending RCV. */
export function groupByCoverage(items: ScopeItem[]): CoverageGroup[] {
  const map = new Map<string, CoverageGroup>();
  for (const item of items) {
    const key = item.coverage;
    let g = map.get(key);
    if (!g) {
      g = { coverage: key, count: 0, rcv: 0, acv: 0, itemAmount: 0, salesTax: 0 };
      map.set(key, g);
    }
    g.count += 1;
    g.rcv += item.rcv;
    g.acv += item.acv;
    g.itemAmount += item.itemAmount;
    g.salesTax += item.salesTax;
  }
  return [...map.values()].sort((a, b) => b.rcv - a.rcv);
}

/**
 * Pick the coverages that form the Demo/Site base. Prefers the exact
 * CE-DEMO / CE-SITE codes; falls back to anything mentioning demo or site.
 */
export function suggestBaseCoverages(groups: CoverageGroup[]): string[] {
  const exact = groups.filter((g) => isDemoSite(g.coverage));
  if (exact.length) return exact.map((g) => g.coverage);
  return groups
    .filter((g) => DEMO_SITE_LOOSE.test(g.coverage))
    .map((g) => g.coverage);
}

/** Total of a coverage group under the chosen basis. */
export function groupAmount(group: CoverageGroup, basis: AmountBasis): number {
  return group[basis];
}

/** The coverage group most likely to be the HC (hard cost) allowance. */
export function findHcGroup(groups: CoverageGroup[]): CoverageGroup | null {
  return groups.find((g) => /^hc\b/i.test(g.coverage.trim())) ?? null;
}

/**
 * Back out overhead & profit that is baked into the base.
 * A 32% O&P means the base is 1.32x the ex-O&P figure, so we divide.
 */
export function stripOandP(base: number, oandpPct: number): number {
  const divisor = 1 + oandpPct / 100;
  if (!Number.isFinite(divisor) || divisor <= 0) return base;
  return base / divisor;
}

/** Sum the selected coverages under the chosen basis. */
export function baseTotal(
  groups: CoverageGroup[],
  baseCoverages: string[],
  basis: AmountBasis,
): number {
  const selected = new Set(baseCoverages);
  return groups
    .filter((g) => selected.has(g.coverage))
    .reduce((sum, g) => sum + groupAmount(g, basis), 0);
}

export function calculateAward(
  groups: CoverageGroup[],
  settings: AwardSettings,
): AwardResult {
  const base = baseTotal(groups, settings.baseCoverages, settings.basis);
  const derivedLessOandP = stripOandP(base, settings.oandpPct);

  const lessOandPIsManual = settings.lessOandPOverride !== null;
  const lessOandP = lessOandPIsManual
    ? (settings.lessOandPOverride as number)
    : derivedLessOandP;

  const tierRows = settings.tiers.map((pct, i) => ({
    pct,
    amount: lessOandP * (pct / 100),
    selected: i === settings.selectedTier,
  }));

  const chosen = tierRows[settings.selectedTier];
  // ADA only counts when ticked, so an amount left behind after unticking
  // cannot quietly inflate the award.
  const ada = settings.adaEnabled ? settings.ada : 0;
  const award = settings.hc + (chosen ? chosen.amount : 0) + ada;

  return {
    base,
    derivedLessOandP,
    lessOandP,
    lessOandPIsManual,
    tierRows,
    hc: settings.hc,
    ada,
    award,
  };
}
