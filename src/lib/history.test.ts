import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
// history.ts only touches localStorage lazily inside its functions, so
// installing the stubs below (after the hoisted import) is soon enough.
import * as history from "./history";
import type { AwardRecord } from "./history";

/** A minimal localStorage, with an optional byte ceiling to force quota errors. */
class MemoryStorage {
  private map = new Map<string, string>();
  limit = Infinity;

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (value.length > this.limit) {
      const err = new Error("QuotaExceededError");
      err.name = "QuotaExceededError";
      throw err;
    }
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

const storage = new MemoryStorage();
(globalThis as { localStorage?: unknown }).localStorage = storage;
(globalThis as { window?: unknown }).window = {
  addEventListener() {},
  removeEventListener() {},
};

function record(over: Partial<AwardRecord> = {}): AwardRecord {
  const stamp = over.updatedAt ?? "2026-08-27T10:00:00.000Z";
  return {
    id: over.id ?? history.newId(),
    savedAt: stamp,
    updatedAt: stamp,
    fileName: "scope.xls",
    sheetName: "Sheet1",
    headerRow: 1,
    letter: {
      jobName: "PR-R3-03073",
      jobAddress: "",
      subcontractor: "Acme",
      scopeOfWork: "",
    },
    settings: {
      basis: "rcv",
      keptCoverages: ["CE-DEMO", "CE-SITE"],
      oandpPct: 32,
      lessOandPOverride: null,
      tiers: [50, 55, 60],
      selectedTier: 0,
      hc: 122000,
    },
    totals: {
      base: 148566.6,
      lessOandP: 112550.45,
      subsPct: 50,
      subsAmount: 56275.23,
      hc: 122000,
      award: 178275.23,
    },
    items: [],
    ...over,
  };
}

beforeEach(() => {
  storage.limit = Infinity;
  storage.removeItem("subs-award:history:v1");
  history.resetCache();
});

test("a saved award round-trips through storage", () => {
  const r = record({ id: "one" });
  history.upsert(r);
  history.resetCache();

  const [loaded] = history.getSnapshot();
  assert.equal(loaded.id, "one");
  assert.equal(loaded.letter.jobName, "PR-R3-03073");
  assert.equal(loaded.totals.award, 178275.23);
  assert.deepEqual(loaded.settings.tiers, [50, 55, 60]);
});

test("saving the same id updates in place rather than duplicating", () => {
  history.upsert(record({ id: "one", updatedAt: "2026-08-27T10:00:00.000Z" }));
  history.upsert(
    record({
      id: "one",
      updatedAt: "2026-08-27T12:00:00.000Z",
      letter: {
        jobName: "Revised",
        jobAddress: "",
        subcontractor: "Acme",
        scopeOfWork: "",
      },
    }),
  );

  const all = history.getSnapshot();
  assert.equal(all.length, 1);
  assert.equal(all[0].letter.jobName, "Revised");
});

test("records list newest first", () => {
  history.upsert(record({ id: "old", updatedAt: "2026-08-01T09:00:00.000Z" }));
  history.upsert(record({ id: "new", updatedAt: "2026-08-27T09:00:00.000Z" }));
  history.upsert(record({ id: "mid", updatedAt: "2026-08-15T09:00:00.000Z" }));

  assert.deepEqual(
    history.getSnapshot().map((r) => r.id),
    ["new", "mid", "old"],
  );
});

test("history is capped and the oldest fall off", () => {
  for (let i = 0; i < history.HISTORY_LIMIT + 5; i++) {
    history.upsert(
      record({
        id: `r${i}`,
        updatedAt: `2026-08-${String((i % 27) + 1).padStart(2, "0")}T09:00:00.000Z`,
      }),
    );
  }
  assert.equal(history.getSnapshot().length, history.HISTORY_LIMIT);
});

test("a quota error sheds the oldest records instead of losing the save", () => {
  history.upsert(record({ id: "a", updatedAt: "2026-08-01T09:00:00.000Z" }));
  history.upsert(record({ id: "b", updatedAt: "2026-08-02T09:00:00.000Z" }));
  const twoFit = (storage.getItem("subs-award:history:v1") as string).length;

  // Only about one record's worth of room from here on.
  storage.limit = Math.floor(twoFit * 0.6);
  const { evicted } = history.upsert(record({ id: "c", updatedAt: "2026-08-03T09:00:00.000Z" }));

  const ids = history.getSnapshot().map((r) => r.id);
  assert.ok(evicted > 0, "should report what it dropped");
  assert.ok(ids.includes("c"), "the new award must survive");
  assert.ok(!ids.includes("a"), "the oldest should be the one dropped");
});

test("delete and clear", () => {
  history.upsert(record({ id: "a", updatedAt: "2026-08-01T09:00:00.000Z" }));
  history.upsert(record({ id: "b", updatedAt: "2026-08-02T09:00:00.000Z" }));

  history.remove("a");
  assert.deepEqual(
    history.getSnapshot().map((r) => r.id),
    ["b"],
  );

  history.clear();
  assert.equal(history.getSnapshot().length, 0);
});

test("getSnapshot is referentially stable so useSyncExternalStore cannot loop", () => {
  history.upsert(record({ id: "a" }));
  assert.equal(history.getSnapshot(), history.getSnapshot());
  assert.equal(history.getServerSnapshot(), history.getServerSnapshot());
});

test("corrupt or foreign entries are discarded, not rendered", () => {
  assert.deepEqual(history.sanitize(null), []);
  assert.deepEqual(history.sanitize("nonsense"), []);
  assert.deepEqual(history.sanitize([{ id: "x" }]), []);
  assert.deepEqual(history.sanitize([{ nope: true }, 42, null]), []);
  assert.equal(history.sanitize([record({ id: "ok" })]).length, 1);
});

test("unparseable storage falls back to an empty list", () => {
  storage.setItem("subs-award:history:v1", "{not json");
  history.resetCache();
  assert.deepEqual(history.getSnapshot(), []);
});

test("the title prefers the job name, then the subcontractor, then the file", () => {
  const blank = { jobName: "", jobAddress: "", subcontractor: "", scopeOfWork: "" };
  assert.equal(history.recordTitle(record()), "PR-R3-03073");
  assert.equal(
    history.recordTitle(record({ letter: { ...blank, subcontractor: "Acme" } })),
    "Acme",
  );
  assert.equal(
    history.recordTitle(record({ letter: blank, fileName: "raw.xls" })),
    "raw.xls",
  );
  assert.equal(
    history.recordTitle(record({ letter: blank, fileName: "" })),
    "Untitled award",
  );
});

test("ids are unique", () => {
  const ids = new Set(Array.from({ length: 200 }, () => history.newId()));
  assert.equal(ids.size, 200);
});
