import type {
  AmountBasis,
  AwardResult,
  AwardSettings,
  CoverageGroup,
  ScopeItem,
} from "./types";

export const DEFAULT_OANDP_PCT = 32;
export const DEFAULT_TIERS = [50, 60, 70];

/** Coverage codes that make up the Demo/Site base by default. */
const DEFAULT_BASE_EXACT = /^ce-\s*(demo|site)$/i;
const DEFAULT_BASE_LOOSE = /(demo|site)/i;

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
  const exact = groups.filter((g) => DEFAULT_BASE_EXACT.test(g.coverage.trim()));
  if (exact.length) return exact.map((g) => g.coverage);
  return groups
    .filter((g) => DEFAULT_BASE_LOOSE.test(g.coverage))
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

export function calculateAward(
  groups: CoverageGroup[],
  settings: AwardSettings,
): AwardResult {
  const selected = new Set(settings.baseCoverages);
  const base = groups
    .filter((g) => selected.has(g.coverage))
    .reduce((sum, g) => sum + groupAmount(g, settings.basis), 0);

  const lessOandP = stripOandP(base, settings.oandpPct);

  const tierRows = settings.tiers.map((pct, i) => ({
    pct,
    amount: lessOandP * (pct / 100),
    selected: i === settings.selectedTier,
  }));

  const chosen = tierRows[settings.selectedTier];
  const award = settings.hc + (chosen ? chosen.amount : 0);

  return { base, lessOandP, tierRows, hc: settings.hc, award };
}
