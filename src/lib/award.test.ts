import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_OANDP_PCT,
  DEFAULT_TIERS,
  calculateAward,
  findHcGroup,
  groupByCoverage,
  stripOandP,
  suggestBaseCoverages,
} from "./award";
import { parseWorkbook } from "./parse";
import { EXPECTED, buildSampleWorkbook } from "./__fixtures__/sample";
import type { AwardSettings } from "./types";

const CENT = 0.005;

function load() {
  const parsed = parseWorkbook(buildSampleWorkbook());
  const groups = groupByCoverage(parsed.items);
  return { parsed, groups };
}

function settings(over: Partial<AwardSettings> = {}): AwardSettings {
  const { groups } = load();
  return {
    basis: "rcv",
    baseCoverages: suggestBaseCoverages(groups),
    oandpPct: DEFAULT_OANDP_PCT,
    tiers: [...DEFAULT_TIERS],
    selectedTier: 0,
    hc: EXPECTED.hc,
    ...over,
  };
}

test("parses every line item and none of the summary block", () => {
  const { parsed } = load();
  assert.equal(parsed.items.length, EXPECTED.itemCount);
  assert.ok(
    parsed.items.every((i) => i.coverage !== ""),
    "no item should be missing a coverage code",
  );
  // The 7 summary rows plus the spacer must be reported, not silently dropped.
  assert.equal(parsed.ignored.length, 7);
  assert.ok(parsed.ignored.some((r) => r.preview.includes("Demo/Site")));
  assert.ok(parsed.ignored.some((r) => r.preview.includes("Award")));
});

test("coerces string-typed negatives from the export", () => {
  const { groups } = load();
  const sr = groups.find((g) => g.coverage === "SR");
  assert.ok(sr, "scope-reduction group should exist");
  assert.ok(sr.rcv < 0, "scope reduction must stay negative");
  assert.ok(Math.abs(sr.itemAmount - -686.63) < CENT);
  assert.ok(Math.abs(sr.acv - -975.36) < CENT);
});

test("defaults the base to the CE-DEMO and CE-SITE coverages", () => {
  const { groups } = load();
  assert.deepEqual([...suggestBaseCoverages(groups)].sort(), ["CE-DEMO", "CE-SITE"]);
});

test("reproduces the Demo/Site base to the cent", () => {
  const { groups } = load();
  const result = calculateAward(groups, settings());
  assert.ok(
    Math.abs(result.base - EXPECTED.demoSiteRcv) < CENT,
    `base ${result.base} != ${EXPECTED.demoSiteRcv}`,
  );
});

test("backs 32% O&P out of the base rather than deducting it", () => {
  const { groups } = load();
  const result = calculateAward(groups, settings());
  assert.ok(Math.abs(result.lessOandP - EXPECTED.lessOandP) < CENT);
  // Deducting 32% would give a materially different (wrong) figure.
  assert.ok(Math.abs(result.lessOandP - EXPECTED.demoSiteRcv * 0.68) > 1000);
});

test("computes the 50/60/70 tiers off the ex-O&P figure", () => {
  const { groups } = load();
  const { tierRows } = calculateAward(groups, settings());
  assert.ok(Math.abs(tierRows[0].amount - EXPECTED.tier50) < CENT);
  assert.ok(Math.abs(tierRows[1].amount - EXPECTED.tier60) < CENT);
  assert.ok(Math.abs(tierRows[2].amount - EXPECTED.tier70) < CENT);
});

test("award is HC plus the selected tier", () => {
  const { groups } = load();
  const result = calculateAward(groups, settings({ selectedTier: 0 }));
  assert.ok(
    Math.abs(result.award - EXPECTED.award) < CENT,
    `award ${result.award} != ${EXPECTED.award}`,
  );

  const at70 = calculateAward(groups, settings({ selectedTier: 2 }));
  assert.ok(Math.abs(at70.award - (EXPECTED.hc + EXPECTED.tier70)) < CENT);
});

test("HC coverage group is detected as a suggestion", () => {
  const { groups } = load();
  const hc = findHcGroup(groups);
  assert.ok(hc);
  assert.ok(Math.abs(hc.rcv - EXPECTED.hcCoverageRcv) < CENT);
});

test("stripOandP is a no-op at 0% and safe at -100%", () => {
  assert.equal(stripOandP(1000, 0), 1000);
  assert.equal(stripOandP(1000, -100), 1000);
  assert.equal(stripOandP(1000, -150), 1000);
});

test("switching basis to Item Amount changes the base", () => {
  const { groups } = load();
  const result = calculateAward(groups, settings({ basis: "itemAmount" }));
  assert.ok(Math.abs(result.base - 124188.92) < CENT);
});

test("an empty base selection yields an award of just HC", () => {
  const { groups } = load();
  const result = calculateAward(groups, settings({ baseCoverages: [] }));
  assert.equal(result.base, 0);
  assert.equal(result.award, EXPECTED.hc);
});
