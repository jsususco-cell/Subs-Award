import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCsv, summaryText } from "./export";
import {
  DEFAULT_OANDP_PCT,
  calculateAward,
  groupByCoverage,
  suggestBaseCoverages,
} from "./award";
import { parseWorkbook } from "./parse";
import { EXPECTED, buildSampleWorkbook } from "./__fixtures__/sample";

function context() {
  const parsed = parseWorkbook(buildSampleWorkbook());
  const groups = groupByCoverage(parsed.items);
  const baseCoverages = suggestBaseCoverages(groups);
  const result = calculateAward(groups, {
    basis: "rcv",
    baseCoverages,
    oandpPct: DEFAULT_OANDP_PCT,
    lessOandPOverride: null,
    tiers: [50, 60, 70],
    selectedTier: 0,
    hc: EXPECTED.hc,
    adaEnabled: false,
    ada: 0,
  });
  return {
    fileName: "scope.xls",
    basis: "rcv" as const,
    oandpPct: DEFAULT_OANDP_PCT,
    baseCoverages,
    groups,
    items: parsed.items,
    result,
  };
}

test("summary text carries every figure and marks the applied tier", () => {
  const text = summaryText(context());
  assert.match(text, /Demo\/Site\s+\$148,566\.60/);
  assert.match(text, /Less O&P\s+\$112,550\.45/);
  assert.match(text, /50%\s+\$56,275\.23\s+<- applied/);
  assert.match(text, /60%\s+\$67,530\.27$/m);
  assert.match(text, /HC\s+\$122,000\.00/);
  assert.match(text, /Award\s+\$178,275\.23\s+\(HC \+ 50%\)/);
});

test("csv holds the summary, the coverage roll-up and every line item", () => {
  const ctx = context();
  const csv = buildCsv(ctx);
  const lines = csv.split("\r\n");

  assert.equal(lines[0], "Subcontractor Award");
  assert.ok(lines.includes("Demo/Site,148566.6"));
  assert.ok(lines.includes("Award,178275.23"));
  assert.ok(lines.includes("50% (applied),56275.23"));
  // One header row plus one row per coverage group, and one row per line item.
  assert.ok(lines.some((l) => l.startsWith("CE-DEMO,9,Yes,")));
  assert.ok(lines.some((l) => l.startsWith("SR,1,,")));
  assert.equal(
    lines.filter((l) => /^\d+,\d+,GRP_/.test(l)).length,
    EXPECTED.itemCount,
  );
});

test("csv quotes fields containing commas or quotes", () => {
  const ctx = context();
  ctx.items = [
    { ...ctx.items[0], desc: 'Tear-out, haul and "dispose"' },
  ];
  const csv = buildCsv(ctx);
  assert.ok(csv.includes('"Tear-out, haul and ""dispose"""'));
});

test("the scope csv exports included lines and records what was excluded", async () => {
  const { extract } = await import("./extract");
  const { buildScopeCsv } = await import("./export");
  const parsed = parseWorkbook(buildSampleWorkbook());

  const all = extract(parsed.items, ["CE-DEMO", "CE-SITE"]);
  const biggest = [...all.items].sort((a, b) => b.rcv - a.rcv)[0];
  const ex = extract(parsed.items, ["CE-DEMO", "CE-SITE"], [], [biggest.row]);

  const csv = buildScopeCsv(ex, "rcv");
  const lines = csv.split("\r\n");

  // The awarded scope is the included lines, renumbered from 1. Count only the
  // rows above the excluded block — that section repeats the same shape.
  const cut = lines.findIndex((l) => l.startsWith("EXCLUDED FROM THE AWARD"));
  assert.ok(cut > 0, "excluded section missing");
  const dataRows = lines.slice(0, cut).filter((l) => /^\d+,GRP_/.test(l));
  assert.equal(dataRows.length, ex.includedItems.length);
  assert.ok(dataRows[0].startsWith("1,"));

  const excludedRows = lines.slice(cut).filter((l) => /^\d+,GRP_/.test(l));
  assert.equal(excludedRows.length, 1, "the one excluded line should be listed");

  // The excluded line is recorded rather than silently dropped.
  assert.ok(csv.includes("EXCLUDED FROM THE AWARD (1 line)"));
  assert.ok(lines.some((l) => l.startsWith("Excluded total,")));

  // And the headline total is the included figure.
  const total = lines.find((l) => l.startsWith("Demo/Site total,"));
  assert.ok(total, "missing the scope total row");
  const value = Number(total.split(",")[9]);
  assert.ok(Math.abs(value - (EXPECTED.demoSiteRcv - biggest.rcv)) < 0.005);
});

test("with nothing excluded the csv has no excluded section", async () => {
  const { extract } = await import("./extract");
  const { buildScopeCsv } = await import("./export");
  const parsed = parseWorkbook(buildSampleWorkbook());
  const csv = buildScopeCsv(extract(parsed.items, ["CE-DEMO", "CE-SITE"]), "rcv");
  assert.ok(!csv.includes("EXCLUDED FROM THE AWARD"));
});
