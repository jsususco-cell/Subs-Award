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
import { canRenderLetter, renderLetter } from "./letter";
import { templateFor } from "./letter-content";
import { parseLetterInput } from "./letter-input";
import { scheduleForJobType, scheduleLines, scheduleSetFor } from "./schedule";
import {
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

test("a mainland region produces the English letter, never Puerto Rico's", () => {
  for (const key of MAINLAND) {
    assert.equal(templateFor(REGIONS[key])?.lang, "en");
    assert.equal(canRenderLetter(key), true);

    const html = renderLetter(letterInput({ region: key }));
    assert.match(html, /<html lang="en">/);
    assert.match(html, /General Conditions/);
    assert.match(html, /Payment Breakdown/);

    // Not one word of the Spanish letter may reach a mainland subcontractor.
    for (const spanish of [
      "Condiciones Generales",
      "Desglose de Pagos",
      "Adjudicación",
      "Subcontratista",
      "Movilización",
      "Empañetado",
    ]) {
      assert.ok(!html.includes(spanish), `${key} letter still contains "${spanish}"`);
    }
  }
});

test("the mainland letter drops what only binds in Puerto Rico", () => {
  const html = renderLetter(letterInput({ region: "FL" }));
  /*
   * CFSE is Puerto Rico's monopoly workers' compensation insurer, OGPe its
   * permitting office and PRDOH its housing department. None of them can bind
   * a Florida subcontractor, so none of them may appear.
   */
  for (const term of ["CFSE", "OGPe", "PRDOH", "Fondo del Seguro"]) {
    assert.ok(!html.includes(term), `mainland letter still cites ${term}`);
  }
  // What replaced them.
  assert.match(html, /Workers' Compensation Coverage/);
  assert.match(html, /authority having jurisdiction/);
  assert.match(html, /administering state agency/);
  // CDBG-DR stays: these four states run CDBG-DR programmes too.
  assert.match(html, /CDBG-DR/);
});

test("the mainland letter is signed from the mainland office", () => {
  const html = renderLetter(letterInput({ region: "FL" }));

  assert.match(html, /1245 W Cardinal Drive/);
  assert.match(html, /Beaumont, TX 77705/);
  assert.match(html, /Joellen Hall/);
  assert.match(html, /Vice President of Operations/);

  // Neither the Puerto Rico office nor its signatory may appear on it.
  for (const pr of ["Guaynabo", "Metro Office Park", "Priscilla", "Lote 3"]) {
    assert.ok(!html.includes(pr), `mainland letter still carries "${pr}"`);
  }
});

test("the Puerto Rico letter keeps its own office and signatory", () => {
  const html = renderLetter(letterInput({ region: "PR" }));
  assert.match(html, /Guaynabo, PR, 00971/);
  assert.match(html, /Priscilla M. Rodríguez Pérez/);
  assert.ok(!html.includes("Beaumont"));
  assert.ok(!html.includes("Joellen Hall"));
});

test("both letters carry the same bargain, only in different words", () => {
  const pr = templateFor(REGIONS.PR)!;
  const us = templateFor(REGIONS.FL)!;

  assert.equal(us.conditions.length, pr.conditions.length);
  // Numbered the same, so "under Condition 11" means the same thing in both.
  assert.deepEqual(
    us.conditions.map((c) => c.n),
    pr.conditions.map((c) => c.n),
  );

  const prHtml = renderLetter(letterInput({ region: "PR" }));
  const usHtml = renderLetter(letterInput({ region: "FL" }));
  // The commercial terms are identical and must not drift apart.
  for (const html of [prHtml, usHtml]) {
    assert.match(html, /180/);
    assert.match(html, /\$150\.00/);
    assert.match(html, /\$10,000\.00/);
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

test("the mainland schedule is the same milestones in English", () => {
  for (const key of MAINLAND) {
    const schedule = scheduleForJobType("Reconstruction", REGIONS[key]);
    assert.equal(schedule?.length, 8);
    assert.deepEqual(
      schedule?.map((m) => m.desc),
      [
        "Mobilization",
        "Demolition",
        "Foundation",
        "Walls",
        "Roof",
        "Plastering",
        "Finishes",
        "Final Inspection",
      ],
    );
    // Same percentages as Puerto Rico — only the names are translated.
    assert.deepEqual(
      schedule?.map((m) => m.pct),
      scheduleForJobType("Reconstruction", REGIONS.PR)?.map((m) => m.pct),
    );
  }
});

test("the $10,000 cap applies to the English stage name too", () => {
  /*
   * The cap is found by matching the milestone's name. It used to match only
   * "Movilizaci", which would have left the mainland schedule uncapped while
   * its letter promised a cap — and nothing would have failed.
   */
  const lines = scheduleLines(
    180800,
    scheduleForJobType("Reconstruction", REGIONS.FL),
    scheduleSetFor(REGIONS.FL)?.mobilisationCap ?? null,
  );
  assert.equal(lines[0].desc, "Mobilization");
  assert.equal(lines[0].amount, 10000, "Mobilization must be capped, not 10%");
  assert.ok(Math.abs(lines.reduce((s, l) => s + l.amount, 0) - 180800) < 0.005);
});

test("each region posts to its own QuickBooks location", () => {
  /*
   * The account itself is looked up at write time — by QBO Location, Active
   * only — so what is pinned here is the location, which is the part that
   * belongs to the region rather than to the chart of accounts.
   */
  assert.equal(REGIONS.PR.qboLocation, "PR");
  for (const key of MAINLAND) {
    assert.equal(REGIONS[key].qboLocation, "US");
  }
});

test("the resolved account is what gets written, never a hardcoded id", () => {
  const account = { id: 4242, label: "Some Other Account" };

  const costItem = buildCostItemRecord(writeInput({ region: "PR" }), 42, account);
  // Related QB Line Item is fid 13 on the Cost Items table.
  assert.equal(costItem["13"].value, 4242);

  const bills = buildBillRecords(writeInput({ region: "PR" }), 99, account);
  assert.equal(bills.length, 8);
  for (const bill of bills) {
    assert.equal(bill["41"].value, "Some Other Account");
  }

  // The retired Puerto Rico account must never reappear as a default.
  assert.notEqual(costItem["13"].value, 182);
});

test("nothing is missing once a region has its letter and schedule", () => {
  for (const key of MAINLAND) {
    assert.deepEqual(missingSetup(REGIONS[key]), []);
  }
  assert.deepEqual(missingSetup(REGIONS.PR), []);
});

test("only Puerto Rico owes a Fondo poliza", () => {
  assert.equal(REGIONS.PR.insurance, "fondo");
  for (const key of MAINLAND) {
    assert.equal(REGIONS[key].insurance, "none");
  }
});

