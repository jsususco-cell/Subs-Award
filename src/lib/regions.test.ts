import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_REGION,
  REGIONS,
  REGION_KEYS,
  isRegionKey,
  missingSetup,
  regionFor,
} from "./regions";
import { NoLetterTemplateError, canRenderLetter, renderLetter } from "./letter";
import { templateFor } from "./letter-content";
import { parseLetterInput } from "./letter-input";
import { scheduleForJobType, scheduleSetFor } from "./schedule";
import {
  awardBlockers,
  buildBillRecords,
  buildCostItemRecord,
  type AwardWriteInput,
} from "./qb-award";
import { DEFAULT_HC, calculateAward, groupByCoverage } from "./award";
import { parseWorkbook } from "./parse";
import { buildSampleWorkbook } from "./__fixtures__/sample";
import type { LetterInput } from "./letter";

const MAINLAND = ["FL", "NC", "TX", "LA"] as const;

function award() {
  const groups = groupByCoverage(parseWorkbook(buildSampleWorkbook()).items);
  return calculateAward(groups, {
    basis: "rcv",
    baseCoverages: ["CE-DEMO", "CE-SITE"],
    oandpPct: 32,
    lessOandPOverride: null,
    tiers: [50, 55, 60],
    selectedTier: 0,
    hc: DEFAULT_HC,
    adaEnabled: false,
    ada: 0,
  });
}

function letterInput(over: Partial<LetterInput> = {}): LetterInput {
  return {
    region: "PR",
    jobName: "FL-2026-0042",
    jobAddress: "100 Main St, Tampa, Florida 33602",
    subcontractor: "Acme Demolition",
    scopeOfWork: "",
    jobType: "Reconstruction",
    program: "",
    startDate: "2026-09-01",
    endDate: "2027-02-28",
    coverages: ["CE-DEMO", "CE-SITE"],
    result: award(),
    issuedOn: "2026-09-16T00:00:00.000Z",
    ...over,
  };
}

function writeInput(over: Partial<AwardWriteInput> = {}): AwardWriteInput {
  return {
    region: "PR",
    jobRecordId: 687,
    subRecordId: 2738,
    title: "Demolition and site work",
    scope: "Per the extracted scope",
    poStatus: "Unreleased",
    expenseClass: "PO",
    lienWaiver: true,
    dueDate: "",
    jobType: "Reconstruction",
    award: 178275.23,
    demoTotal: 100000,
    siteTotal: 48566.6,
    ada: 0,
    caseNumber: "FL-2026-0042",
    subcontractorName: "Acme Demolition",
    createBills: true,
    createInsurance: true,
    ...over,
  };
}

test("every key in the registry is listed, and every listed key resolves", () => {
  assert.deepEqual([...REGION_KEYS].sort(), Object.keys(REGIONS).sort());
  for (const key of REGION_KEYS) {
    assert.equal(REGIONS[key].key, key, `${key} carries its own key`);
    assert.ok(REGIONS[key].label.length > 0);
    assert.ok(REGIONS[key].jobRegion.length > 0);
  }
});

test("the job region is the exact string the Jobs table stores", () => {
  // Confirmed against the live table — these are the values of fid 11.
  assert.equal(REGIONS.PR.jobRegion, "Puerto Rico");
  assert.equal(REGIONS.FL.jobRegion, "Florida");
  assert.equal(REGIONS.NC.jobRegion, "North Carolina");
  assert.equal(REGIONS.TX.jobRegion, "Texas");
  assert.equal(REGIONS.LA.jobRegion, "Louisiana");
});

test("an unknown region resolves to the default rather than throwing", () => {
  assert.equal(regionFor("ZZ").key, DEFAULT_REGION);
  assert.equal(regionFor(undefined).key, DEFAULT_REGION);
  assert.equal(regionFor(null).key, DEFAULT_REGION);
  assert.equal(regionFor(7).key, DEFAULT_REGION);
  assert.ok(!isRegionKey("ZZ"));
  assert.ok(isRegionKey("FL"));
});

test('"Both" counts as in region on every side, never just one', () => {
  for (const key of REGION_KEYS) {
    assert.ok(
      REGIONS[key].vendorRegions.includes("Both"),
      `${key} must accept vendors marked Both`,
    );
  }
  // The Vendors field is a coarse bucket: mainland states share one value.
  for (const key of MAINLAND) {
    assert.deepEqual(REGIONS[key].vendorRegions, ["Mainland", "Both"]);
    assert.ok(!REGIONS[key].vendorRegions.includes("Puerto Rico"));
  }
  assert.ok(!REGIONS.PR.vendorRegions.includes("Mainland"));
});

test("a mainland region never produces a letter, and never Puerto Rico's", () => {
  for (const key of MAINLAND) {
    assert.equal(templateFor(REGIONS[key]), null);
    assert.equal(canRenderLetter(key), false);
    assert.throws(
      () => renderLetter(letterInput({ region: key })),
      NoLetterTemplateError,
      `${key} must refuse rather than fall back`,
    );
  }
});

test("the Puerto Rico letter still renders, in Spanish", () => {
  assert.ok(canRenderLetter("PR"));
  const html = renderLetter(letterInput({ region: "PR" }));
  assert.match(html, /<html lang="es">/);
  assert.match(html, /Desglose de Pagos/);
  assert.match(html, /Condiciones Generales/);
});

test("a letter payload without a valid region is rejected outright", () => {
  const noRegion: Record<string, unknown> = { ...letterInput() };
  delete noRegion.region;
  assert.equal(parseLetterInput(noRegion), null);
  assert.equal(parseLetterInput({ ...letterInput(), region: "ZZ" }), null);
  assert.equal(parseLetterInput({ ...letterInput(), region: "" }), null);
  // A valid one still parses, and keeps the region it was given.
  assert.equal(parseLetterInput({ ...letterInput(), region: "FL" })?.region, "FL");
});

test("a mainland region has no payment schedule, so it bills nothing", () => {
  for (const key of MAINLAND) {
    assert.equal(scheduleSetFor(REGIONS[key]), null);
    assert.equal(scheduleForJobType("Reconstruction", REGIONS[key]), null);
  }
  assert.ok(scheduleSetFor(REGIONS.PR));
  assert.equal(scheduleForJobType("Reconstruction", REGIONS.PR)?.length, 8);
});

test("a region with no account is blocked before anything is written", () => {
  for (const key of MAINLAND) {
    const blockers = awardBlockers(REGIONS[key]);
    assert.equal(blockers.length, 1, `${key} should report exactly one blocker`);
    assert.match(blockers[0], /QB Line Item/);
    // And the builders refuse too, so nothing can slip past the route check.
    assert.throws(() => buildCostItemRecord(writeInput({ region: key }), 1));
    assert.throws(() => buildBillRecords(writeInput({ region: key }), 1));
  }
  assert.deepEqual(awardBlockers(REGIONS.PR), []);
  assert.deepEqual(missingSetup(REGIONS.PR), []);
});

test("Puerto Rico still posts to its own account, not the plain one", () => {
  const costItem = buildCostItemRecord(writeInput({ region: "PR" }), 42);
  // Related QB Line Item is fid 13 on the Cost Items table.
  assert.equal(costItem["13"].value, 182);

  const bills = buildBillRecords(writeInput({ region: "PR" }), 99);
  assert.equal(bills.length, 8);
  for (const bill of bills) {
    assert.equal(bill["41"].value, "Subcontractors - Puerto Rico");
  }
});

test("only Puerto Rico owes a Fondo poliza", () => {
  assert.equal(REGIONS.PR.insurance, "fondo");
  for (const key of MAINLAND) {
    assert.equal(REGIONS[key].insurance, "none");
  }
});

test("what is missing is reported per region, so the UI can say so", () => {
  for (const key of MAINLAND) {
    const missing = missingSetup(REGIONS[key]);
    assert.equal(missing.length, 3);
    assert.ok(missing.some((m) => m.includes("award letter template")));
    assert.ok(missing.some((m) => m.includes("payment schedule")));
    assert.ok(missing.some((m) => m.includes("QB Line Item")));
  }
});
