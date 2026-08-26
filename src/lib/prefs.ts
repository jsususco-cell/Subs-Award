import { DEFAULT_OANDP_PCT, DEFAULT_TIERS } from "./award";
import type { AmountBasis } from "./types";

const KEY = "subs-award:prefs";

/**
 * Settings that are shop conventions rather than job facts, so they carry over
 * between scope files. The HC amount and the coverage selection belong to a
 * single job and are deliberately not remembered.
 */
export interface Prefs {
  basis: AmountBasis;
  oandpPct: number;
  tiers: number[];
  selectedTier: number;
}

export const DEFAULT_PREFS: Prefs = {
  basis: "rcv",
  oandpPct: DEFAULT_OANDP_PCT,
  tiers: [...DEFAULT_TIERS],
  selectedTier: 0,
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
