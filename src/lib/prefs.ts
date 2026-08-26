import { DEFAULT_HC, DEFAULT_OANDP_PCT, DEFAULT_TIERS } from "./award";
import type { AmountBasis } from "./types";

/**
 * Versioned: v1 stored 50/60/70 tiers and no HC. Bumping the key retires that
 * shape cleanly rather than letting a stale entry mask the current defaults.
 */
const KEY = "subs-award:prefs:v2";

/**
 * Settings that are shop conventions rather than job facts, so they carry over
 * between scope files. The coverage selection belongs to a single job and is
 * deliberately not remembered — it is re-derived from each file.
 */
export interface Prefs {
  basis: AmountBasis;
  oandpPct: number;
  /** Subcontractor percentage tiers. */
  tiers: number[];
  selectedTier: number;
  /** Hard-cost allowance carried between jobs as a starting point. */
  hc: number;
}

export const DEFAULT_PREFS: Prefs = {
  basis: "rcv",
  oandpPct: DEFAULT_OANDP_PCT,
  tiers: [...DEFAULT_TIERS],
  selectedTier: 0,
  hc: DEFAULT_HC,
};

const BASES: AmountBasis[] = ["rcv", "acv", "itemAmount"];

/**
 * Read stored preferences, falling back to defaults for anything missing or
 * malformed. Safe to call only on the client.
 */
export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFS, tiers: [...DEFAULT_PREFS.tiers] };

    const p = JSON.parse(raw) as Partial<Prefs>;
    const tiers =
      Array.isArray(p.tiers) && p.tiers.length && p.tiers.every(Number.isFinite)
        ? p.tiers
        : [...DEFAULT_PREFS.tiers];

    return {
      basis: BASES.includes(p.basis as AmountBasis)
        ? (p.basis as AmountBasis)
        : DEFAULT_PREFS.basis,
      oandpPct: Number.isFinite(p.oandpPct)
        ? (p.oandpPct as number)
        : DEFAULT_PREFS.oandpPct,
      tiers,
      selectedTier:
        Number.isInteger(p.selectedTier) &&
        (p.selectedTier as number) >= 0 &&
        (p.selectedTier as number) < tiers.length
          ? (p.selectedTier as number)
          : 0,
      hc: Number.isFinite(p.hc) ? (p.hc as number) : DEFAULT_PREFS.hc,
    };
  } catch {
    return { ...DEFAULT_PREFS, tiers: [...DEFAULT_PREFS.tiers] };
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* private browsing or a full quota just means they do not persist */
  }
}
