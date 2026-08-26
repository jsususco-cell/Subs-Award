import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import {
  coverageLabel,
  demoSiteCoveragesIn,
  extract,
  templateRow,
  totalOf,
} from "./extract";
import {
  DEFAULT_HC,
  DEFAULT_TIERS,
  DEMO_SITE_COVERAGES,
  calculateAward,
  groupByCoverage,
  isDemoSite,
  suggestBaseCoverages,
} from "./award";
import { parseWorkbook } from "./parse";
import { EXPECTED, buildSampleWorkbook } from "./__fixtures__/sample";
import type { AwardSettings } from "./types";

const CENT = 0.005;

function loadSample() {
  const parsed = parseWorkbook(buildSampleWorkbook());
  return parsed.items;
}

function settings(over: Partial<AwardSettings> = {}): AwardSettings {
  return {
    basis: "rcv",
    baseCoverages: DEMO_SITE_COVERAGES,
    oandpPct: 32,
    lessOandPOverride: null,
    tiers: [...DEFAULT_TIERS],
    selectedTier: 0,
    hc: DEFAULT_HC,
    ...over,
  };
}

test("the default subs tiers are 50 / 55 / 60", () => {
  assert.deepEqual(DEFAULT_TIERS, [50, 55, 60]);
});

test("HC is prefilled at 122,000", () => {
  assert.equal(DEFAULT_HC, 122000);
});

test("isDemoSite matches only the CE-DEMO and CE-SITE codes", () => {
  assert.ok(isDemoSite("CE-DEMO"));
  assert.ok(isDemoSite("CE-SITE"));
  assert.ok(isDemoSite(" ce-site "));
  assert.ok(!isDemoSite("CE-ENV"));
  assert.ok(!isDemoSite("ECR"));
  assert.ok(!isDemoSite("SC-SD"));
  assert.ok(!isDemoSite("CE-PVS"));
});

test("extraction keeps only the Demo/Site lines and drops the rest", () => {
  const items = loadSample();
  const ex = extract(items, DEMO_SITE_COVERAGES, DEMO_SITE_COVERAGES);

  assert.equal(ex.rawCount, EXPECTED.itemCount);
  assert.equal(ex.keptCount, 41); // 9 CE-DEMO + 32 CE-SITE
  assert.equal(ex.droppedCount, EXPECTED.itemCount - 41);
  assert.ok(ex.items.every((i) => isDemoSite(i.coverage)));
  assert.deepEqual(ex.missingCoverages, []);
  assert.ok(Math.abs(totalOf(ex.items, "rcv") - EXPECTED.demoSiteRcv) < CENT);
});

test("extraction preserves the original sheet order", () => {
  const ex = extract(loadSample(), DEMO_SITE_COVERAGES);
  const rows = ex.items.map((i) => i.row);
  assert.deepEqual(rows, [...rows].sort((a, b) => a - b));
});

test("the breakdown subtotals reconcile to the coverage totals", () => {
  const ex = extract(loadSample(), DEMO_SITE_COVERAGES);
  for (const group of ex.keptGroups) {
    const rows = ex.breakdown.filter((b) => b.coverage === group.coverage);
    const sum = rows.reduce((s, r) => s + r.rcv, 0);
    const count = rows.reduce((s, r) => s + r.count, 0);
    assert.ok(Math.abs(sum - group.rcv) < CENT, `${group.coverage} rcv mismatch`);
    assert.equal(count, group.count);
  }
  const grand = ex.breakdown.reduce((s, r) => s + r.rcv, 0);
  assert.ok(Math.abs(grand - EXPECTED.demoSiteRcv) < CENT);
});

test("a raw file with no CE-DEMO lines extracts cleanly and reports the gap", () => {
  // Mirrors "Raw-for extraction.xls": a repair job, so no demolition scope.
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Desc", "Coverage", "RCV", "Item Amount"],
      ["Exterior - paint two coats", "ECR", 195.6, 144],
      ["Solar water heater system", "ECR SAFETY HAZARD", 5045.79, 3650.07],
      ['Concrete slab on grade - 4"', "CE-SITE", 149.54, 110],
      ["Concrete slab reinforcement", "CE-SITE", 122.94, 89],
      ["Taxes - Construction", "TAX-SD", 4431.65, 4431.65],
    ]),
    "Sheet1",
  );
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

  const items = parseWorkbook(buf).items;
  const groups = groupByCoverage(items);

  assert.deepEqual(demoSiteCoveragesIn(groups), ["CE-SITE"]);
  assert.deepEqual(suggestBaseCoverages(groups), ["CE-SITE"]);

  const ex = extract(items, suggestBaseCoverages(groups), DEMO_SITE_COVERAGES);
  assert.equal(ex.keptCount, 2);
  assert.equal(ex.droppedCount, 3);
  assert.deepEqual(ex.missingCoverages, ["CE-DEMO"]);
  assert.ok(Math.abs(totalOf(ex.items, "rcv") - 272.48) < CENT);

  // "ECR SAFETY HAZARD" must not be mistaken for a Demo/Site coverage.
  assert.ok(!ex.keptCoverages.includes("ECR SAFETY HAZARD"));
});

test("templateRow emits the structured template's column order", () => {
  const ex = extract(loadSample(), DEMO_SITE_COVERAGES);
  const row = templateRow(ex.items[0], 0);
  assert.equal(row.length, 11);
  assert.equal(row[0], 1); // renumbered from 1, not the raw sheet row
  assert.equal(row[7], ex.items[0].coverage);
});

test("Less O&P is Demo/Site divided by 1.32", () => {
  const groups = groupByCoverage(loadSample());
  const r = calculateAward(groups, settings());
  assert.ok(Math.abs(r.base - EXPECTED.demoSiteRcv) < CENT);
  assert.ok(Math.abs(r.lessOandP - EXPECTED.demoSiteRcv / 1.32) < CENT);
  assert.ok(Math.abs(r.lessOandP - EXPECTED.lessOandP) < CENT);
  assert.equal(r.lessOandPIsManual, false);
});

test("a manual Less O&P overrides the formula but keeps the derived value", () => {
  const groups = groupByCoverage(loadSample());
  const r = calculateAward(groups, settings({ lessOandPOverride: 100000 }));

  assert.equal(r.lessOandPIsManual, true);
  assert.equal(r.lessOandP, 100000);
  assert.ok(Math.abs(r.derivedLessOandP - EXPECTED.lessOandP) < CENT);
  assert.equal(r.tierRows[0].amount, 50000); // 50% of the manual figure
  assert.equal(r.award, DEFAULT_HC + 50000);
});

test("a manual Less O&P of zero is honoured, not treated as unset", () => {
  const groups = groupByCoverage(loadSample());
  const r = calculateAward(groups, settings({ lessOandPOverride: 0 }));
  assert.equal(r.lessOandPIsManual, true);
  assert.equal(r.lessOandP, 0);
  assert.equal(r.award, DEFAULT_HC);
});

test("award at the default tiers off the sample scope", () => {
  const groups = groupByCoverage(loadSample());
  const base = EXPECTED.demoSiteRcv / 1.32;
  for (const [i, p] of DEFAULT_TIERS.entries()) {
    const r = calculateAward(groups, settings({ selectedTier: i }));
    assert.ok(Math.abs(r.award - (DEFAULT_HC + base * (p / 100))) < CENT);
  }
});

test("the coverage label follows the selection, not a Demo/Site assumption", () => {
  assert.equal(coverageLabel([]), "No coverage selected");
  assert.equal(coverageLabel(["CE-DEMO", "CE-SITE"]), "Demo/Site");
  assert.equal(coverageLabel(["CE-SITE", "CE-DEMO"]), "Demo/Site");
  // A lone Demo/Site coverage is named honestly rather than called the pair.
  assert.equal(coverageLabel(["CE-SITE"]), "CE-SITE");
  assert.equal(coverageLabel(["ECR"]), "ECR");
  assert.equal(coverageLabel(["ECR", "CE-ENV"]), "CE-ENV + ECR");
  assert.equal(coverageLabel(["ECR", "CE-ENV", "TAX-SD"]), "CE-ENV + ECR + TAX-SD");
  assert.equal(coverageLabel(["A", "B", "C", "D"]), "4 coverages");
  // Mixing a non-Demo/Site code in drops the shorthand.
  assert.equal(coverageLabel(["CE-DEMO", "CE-SITE", "ECR"]), "CE-DEMO + CE-SITE + ECR");
});

test("any coverage set can drive the award, not only Demo/Site", () => {
  const items = loadSample();
  const groups = groupByCoverage(items);

  // Build the base from coverages that have nothing to do with demolition.
  const picked = ["CE-ENV", "TAX-MIT"];
  const ex = extract(items, picked, DEMO_SITE_COVERAGES);
  assert.equal(ex.keptCount, 4 + 6);
  assert.ok(ex.items.every((i) => picked.includes(i.coverage)));

  const expected = 2125.2 + 20880.52;
  const r = calculateAward(ex.keptGroups, settings({ baseCoverages: picked }));
  assert.ok(Math.abs(r.base - expected) < CENT, `base ${r.base} != ${expected}`);
  assert.ok(Math.abs(r.lessOandP - expected / 1.32) < CENT);
  assert.ok(Math.abs(r.award - (DEFAULT_HC + (expected / 1.32) * 0.5)) < CENT);
  assert.equal(coverageLabel(picked), "CE-ENV + TAX-MIT");

  // Selecting everything reproduces the whole-file total.
  const all = groups.map((g) => g.coverage);
  const everything = calculateAward(groups, settings({ baseCoverages: all }));
  const fileTotal = items.reduce((s, i) => s + i.rcv, 0);
  assert.ok(Math.abs(everything.base - fileTotal) < CENT);
});
