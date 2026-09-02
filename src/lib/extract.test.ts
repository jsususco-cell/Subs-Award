import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import {
  coverageLabel,
  demoSiteCoveragesIn,
  extract,
  templateRow,
  toggleExcluded,
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
    adaEnabled: false,
    ada: 0,
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

test("subs amount is Less O&P multiplied by the percentage", () => {
  const groups = groupByCoverage(loadSample());
  const lessOandP = EXPECTED.demoSiteRcv / 1.32;

  const r = calculateAward(groups, settings({ tiers: [50, 55, 60] }));
  r.tierRows.forEach((row) => {
    assert.ok(
      Math.abs(row.amount - lessOandP * (row.pct / 100)) < CENT,
      `${row.pct}% should be ${lessOandP * (row.pct / 100)}, got ${row.amount}`,
    );
  });
  // The exact figures the worksheet shows.
  assert.ok(Math.abs(r.tierRows[0].amount - 56275.23) < CENT);
  assert.ok(Math.abs(r.tierRows[1].amount - 61902.75) < CENT);
  assert.ok(Math.abs(r.tierRows[2].amount - 67530.27) < CENT);

  // It multiplies the *effective* Less O&P, so an override flows through.
  const over = calculateAward(groups, settings({ lessOandPOverride: 200000 }));
  assert.ok(Math.abs(over.tierRows[0].amount - 100000) < CENT);
  assert.ok(Math.abs(over.tierRows[1].amount - 110000) < CENT);
  assert.ok(Math.abs(over.tierRows[2].amount - 120000) < CENT);

  // And it is taken off Less O&P, never off the Demo/Site base.
  const offBase = EXPECTED.demoSiteRcv * 0.5;
  assert.ok(Math.abs(r.tierRows[0].amount - offBase) > 1000);

  // A fractional rate is honoured, not rounded to a whole percent.
  const half = calculateAward(groups, settings({ tiers: [52.5] }));
  assert.ok(Math.abs(half.tierRows[0].amount - lessOandP * 0.525) < CENT);
});

test("award total is HC plus the subs amount", () => {
  const groups = groupByCoverage(loadSample());

  for (const [i] of DEFAULT_TIERS.entries()) {
    const r = calculateAward(groups, settings({ selectedTier: i }));
    const subs = r.tierRows[i].amount;
    assert.ok(
      Math.abs(r.award - (r.hc + subs)) < CENT,
      `tier ${i}: award ${r.award} != hc ${r.hc} + subs ${subs}`,
    );
    // Only the selected tier contributes; the others are just shown.
    const others = r.tierRows.filter((_, j) => j !== i).reduce((s, t) => s + t.amount, 0);
    assert.ok(Math.abs(r.award - (r.hc + subs + others)) > CENT || others === 0);
  }

  // The worksheet's own numbers.
  const at50 = calculateAward(groups, settings({ selectedTier: 0 }));
  assert.ok(Math.abs(at50.award - (122000 + 56275.23)) < CENT);
  assert.ok(Math.abs(at50.award - 178275.23) < CENT);

  // A manual Less O&P flows all the way through to the award.
  const over = calculateAward(groups, settings({ lessOandPOverride: 200000 }));
  assert.ok(Math.abs(over.award - (DEFAULT_HC + 100000)) < CENT);

  // Changing HC moves the award one-for-one.
  const hcUp = calculateAward(groups, settings({ hc: DEFAULT_HC + 1000 }));
  assert.ok(Math.abs(hcUp.award - (at50.award + 1000)) < CENT);

  // HC of zero leaves just the subs amount.
  const noHc = calculateAward(groups, settings({ hc: 0 }));
  assert.ok(Math.abs(noHc.award - noHc.tierRows[0].amount) < CENT);

  // No tier selected falls back to HC alone rather than NaN.
  const noTier = calculateAward(groups, settings({ selectedTier: 9 }));
  assert.equal(noTier.award, DEFAULT_HC);
});

test("excluding a line removes it from every total but keeps it visible", () => {
  const items = loadSample();
  const all = extract(items, DEMO_SITE_COVERAGES, DEMO_SITE_COVERAGES);

  // Take out the single largest CE-SITE line.
  const biggest = [...all.items].sort((a, b) => b.rcv - a.rcv)[0];
  const ex = extract(items, DEMO_SITE_COVERAGES, DEMO_SITE_COVERAGES, [biggest.row]);

  // Still shown, so the reviewer can put it back.
  assert.equal(ex.items.length, all.items.length, "the line must remain visible");
  assert.ok(ex.items.some((i) => i.row === biggest.row));

  // But it no longer counts.
  assert.equal(ex.includedItems.length, all.includedItems.length - 1);
  assert.ok(!ex.includedItems.some((i) => i.row === biggest.row));
  assert.equal(ex.excludedCount, 1);
  assert.ok(Math.abs(ex.excludedTotal - biggest.rcv) < CENT);
  assert.ok(
    Math.abs(totalOf(ex.includedItems, "rcv") - (EXPECTED.demoSiteRcv - biggest.rcv)) <
      CENT,
  );

  // The roll-ups follow, not just the flat total.
  const groupSum = ex.keptGroups.reduce((s, g) => s + g.rcv, 0);
  const breakdownSum = ex.breakdown.reduce((s, b) => s + b.rcv, 0);
  assert.ok(Math.abs(groupSum - (EXPECTED.demoSiteRcv - biggest.rcv)) < CENT);
  assert.ok(Math.abs(breakdownSum - (EXPECTED.demoSiteRcv - biggest.rcv)) < CENT);
});

test("the award follows the exclusions all the way through", () => {
  const items = loadSample();
  const biggest = [...extract(items, DEMO_SITE_COVERAGES).items].sort(
    (a, b) => b.rcv - a.rcv,
  )[0];
  const ex = extract(items, DEMO_SITE_COVERAGES, DEMO_SITE_COVERAGES, [biggest.row]);

  const base = EXPECTED.demoSiteRcv - biggest.rcv;
  const r = calculateAward(ex.keptGroups, settings());
  assert.ok(Math.abs(r.base - base) < CENT);
  assert.ok(Math.abs(r.lessOandP - base / 1.32) < CENT);
  assert.ok(Math.abs(r.award - (DEFAULT_HC + (base / 1.32) * 0.5)) < CENT);
});

test("excluding every line leaves a base of zero, not NaN", () => {
  const items = loadSample();
  const all = extract(items, DEMO_SITE_COVERAGES);
  const ex = extract(
    items,
    DEMO_SITE_COVERAGES,
    DEMO_SITE_COVERAGES,
    all.items.map((i) => i.row),
  );

  assert.equal(ex.includedItems.length, 0);
  assert.equal(ex.keptGroups.length, 0);
  assert.equal(ex.excludedCount, all.items.length);

  const r = calculateAward(ex.keptGroups, settings());
  assert.equal(r.base, 0);
  assert.ok(!Number.isNaN(r.award));
  assert.equal(r.award, DEFAULT_HC, "with nothing counted the award is just HC");
});

test("an exclusion for a row outside the coverage selection is harmless", () => {
  const items = loadSample();
  // A row that exists in the file but is not in the Demo/Site coverages.
  const outside = items.find((i) => !DEMO_SITE_COVERAGES.includes(i.coverage));
  assert.ok(outside, "sample should have a non-Demo/Site line");

  const ex = extract(items, DEMO_SITE_COVERAGES, DEMO_SITE_COVERAGES, [outside.row]);
  assert.equal(ex.excludedCount, 0, "it was never counted, so nothing is excluded");
  assert.ok(Math.abs(totalOf(ex.includedItems, "rcv") - EXPECTED.demoSiteRcv) < CENT);
});

test("toggleExcluded adds, removes and stays sorted", () => {
  assert.deepEqual(toggleExcluded([], 5), [5]);
  assert.deepEqual(toggleExcluded([5], 5), []);
  assert.deepEqual(toggleExcluded([9, 2], 5), [2, 5, 9]);
  assert.deepEqual(toggleExcluded([2, 5, 9], 5), [2, 9]);
  // Toggling twice returns to where it started.
  assert.deepEqual(toggleExcluded(toggleExcluded([3], 7), 7), [3]);
});
