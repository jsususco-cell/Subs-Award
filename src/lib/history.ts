import type { AmountBasis, ScopeItem } from "./types";

const KEY = "subs-award:history:v1";

/** Keep the store bounded — localStorage is a few megabytes at best. */
export const HISTORY_LIMIT = 25;

export interface LetterDetails {
  jobName: string;
  jobAddress: string;
  subcontractor: string;
  scopeOfWork: string;
  /** Added after the first releases, so older records may not carry these. */
  jobType?: string;
  program?: string;
  startDate?: string;
  endDate?: string;
  jobRecordId?: string;
  subRecordId?: string;
}

export interface HistorySettings {
  basis: AmountBasis;
  keptCoverages: string[];
  /** Sheet rows ticked off during review. Absent on records saved before this. */
  excludedRows?: number[];
  oandpPct: number;
  lessOandPOverride: number | null;
  tiers: number[];
  selectedTier: number;
  hc: number;
}

export interface HistoryTotals {
  base: number;
  lessOandP: number;
  subsPct: number | null;
  subsAmount: number;
  hc: number;
  award: number;
}

/**
 * One saved award. Carries the parsed line items as well as the settings, so a
 * restored award can be revised from any step — including changing which
 * coverages feed the base, which needs the lines that were filtered out.
 */
export interface AwardRecord {
  id: string;
  savedAt: string;
  updatedAt: string;
  fileName: string;
  sheetName: string;
  headerRow: number;
  letter: LetterDetails;
  /** Set once the award has been written to Quickbase. */
  createdPo?: { poRecordId: number; costItemRecordId: number; billCount: number } | null;
  settings: HistorySettings;
  totals: HistoryTotals;
  items: ScopeItem[];
}

/** What a saved award is called in the list. */
export function recordTitle(record: AwardRecord): string {
  return (
    record.letter.jobName.trim() ||
    record.letter.subcontractor.trim() ||
    record.fileName ||
    "Untitled award"
  );
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `a-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

const EMPTY: AwardRecord[] = [];

/** Drop anything that does not look like a record we wrote. */
export function sanitize(raw: unknown): AwardRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is AwardRecord => {
    if (!r || typeof r !== "object") return false;
    const rec = r as Partial<AwardRecord>;
    return (
      typeof rec.id === "string" &&
      typeof rec.updatedAt === "string" &&
      Array.isArray(rec.items) &&
      !!rec.settings &&
      !!rec.totals &&
      !!rec.letter
    );
  });
}

function byNewest(a: AwardRecord, b: AwardRecord): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

// A module-level cache keeps getSnapshot referentially stable, which
// useSyncExternalStore requires — returning a fresh array each call loops.
let cache: AwardRecord[] | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function read(): AwardRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const records = sanitize(JSON.parse(raw));
    return records.length ? records.sort(byNewest) : EMPTY;
  } catch {
    return EMPTY;
  }
}

/**
 * Persist, shedding the oldest records if the browser refuses the write.
 * Returns how many had to be dropped so the caller can say so.
 */
function persist(records: AwardRecord[]): { saved: AwardRecord[]; evicted: number } {
  let working = [...records];
  let evicted = 0;

  for (let attempt = 0; attempt < HISTORY_LIMIT + 1; attempt++) {
    try {
      localStorage.setItem(KEY, JSON.stringify(working));
      return { saved: working, evicted };
    } catch {
      if (working.length <= 1) break;
      working = working.slice(0, working.length - 1);
      evicted += 1;
    }
  }

  // Even one record will not fit; leave what was already stored alone.
  return { saved: read(), evicted };
}

export function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);

  // Another tab writing the same key should refresh this one.
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === KEY) {
      cache = null;
      emit();
    }
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function getSnapshot(): AwardRecord[] {
  if (cache === null) cache = read();
  return cache;
}

/** The server has no localStorage, so history starts empty and fills in. */
export function getServerSnapshot(): AwardRecord[] {
  return EMPTY;
}

/** Insert a new record or replace one with the same id. */
export function upsert(record: AwardRecord): { evicted: number } {
  const current = getSnapshot();
  const without = current.filter((r) => r.id !== record.id);
  const next = [record, ...without].sort(byNewest).slice(0, HISTORY_LIMIT);
  const { saved, evicted } = persist(next);
  cache = saved.length ? saved : EMPTY;
  emit();
  return { evicted };
}

export function remove(id: string): void {
  const next = getSnapshot().filter((r) => r.id !== id);
  const { saved } = persist(next);
  cache = saved.length ? saved : EMPTY;
  emit();
}

export function clear(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing we can do; the snapshot below still resets the view */
  }
  cache = EMPTY;
  emit();
}

/** Test seam: forget the cached snapshot so the next read hits storage. */
export function resetCache(): void {
  cache = null;
}
