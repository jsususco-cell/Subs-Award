import { DEFAULT_HC, DEFAULT_OANDP_PCT, DEFAULT_TIERS } from "./award";
import { DEFAULT_REGION, isRegionKey, type RegionKey } from "./regions";

/**
 * Versioned: v1 stored 50/60/70 tiers and no HC; v2 stored one set of settings
 * for the whole app. v3 keys them by region, because a hard-cost allowance
 * tuned for Puerto Rico is not the right starting point for a Florida job —
 * carrying it across silently would put a wrong figure on an award letter.
 */
const KEY = "subs-award:prefs:v3";
const KEY_V2 = "subs-award:prefs:v2";

/**
 * Settings that are shop conventions rather than job facts, so they carry over
 * between scope files. The coverage selection belongs to a single job and is
 * deliberately not remembered — it is re-derived from each file.
 */
export interface Prefs {
  oandpPct: number;
  /** Subcontractor percentage tiers. */
  tiers: number[];
  selectedTier: number;
  /** Hard-cost allowance carried between jobs as a starting point. */
  hc: number;
}

/** The whole store: which region was last in use, and each region's settings. */
export interface PrefsStore {
  region: RegionKey;
  byRegion: Partial<Record<RegionKey, Prefs>>;
}

export const DEFAULT_PREFS: Prefs = {
  oandpPct: DEFAULT_OANDP_PCT,
  tiers: [...DEFAULT_TIERS],
  selectedTier: 0,
  hc: DEFAULT_HC,
};

export function defaultPrefs(): Prefs {
  return { ...DEFAULT_PREFS, tiers: [...DEFAULT_PREFS.tiers] };
}

/** Coerce anything stored into a usable Prefs, falling back per field. */
function normalise(raw: unknown): Prefs {
  const p = (raw ?? {}) as Partial<Prefs>;
  const tiers =
    Array.isArray(p.tiers) && p.tiers.length && p.tiers.every(Number.isFinite)
      ? p.tiers
      : [...DEFAULT_PREFS.tiers];

  return {
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
}

/**
 * Read the store, falling back to defaults for anything missing or malformed.
 * Safe to call only on the client.
 *
 * A v2 entry is migrated rather than discarded: those settings were tuned for
 * Puerto Rico, which was the only region at the time, so they land there.
 */
export function loadPrefsStore(): PrefsStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<PrefsStore>;
      const byRegion: Partial<Record<RegionKey, Prefs>> = {};
      for (const [key, value] of Object.entries(s.byRegion ?? {})) {
        if (isRegionKey(key)) byRegion[key] = normalise(value);
      }
      return {
        region: isRegionKey(s.region) ? s.region : DEFAULT_REGION,
        byRegion,
      };
    }

    const legacy = localStorage.getItem(KEY_V2);
    if (legacy) {
      return {
        region: DEFAULT_REGION,
        byRegion: { [DEFAULT_REGION]: normalise(JSON.parse(legacy)) },
      };
    }
  } catch {
    /* fall through to defaults */
  }
  return { region: DEFAULT_REGION, byRegion: {} };
}

/** One region's settings, defaulted when it has none of its own yet. */
export function prefsFor(store: PrefsStore, region: RegionKey): Prefs {
  const p = store.byRegion[region];
  return p ? { ...p, tiers: [...p.tiers] } : defaultPrefs();
}

export function savePrefsStore(store: PrefsStore): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* private browsing or a full quota just means they do not persist */
  }
}
