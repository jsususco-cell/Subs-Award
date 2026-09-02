import assert from "node:assert/strict";
import { test } from "node:test";
import { renderLetter, type LetterInput } from "./letter";
import { CONDITIONS, LETTER_INTRO, MOBILISATION_NOTE } from "./letter-content";
import { PAY_SCHEDULES, scheduleAmounts } from "./schedule";
import { DEFAULT_HC, calculateAward, groupByCoverage } from "./award";
import { parseWorkbook } from "./parse";
import { EXPECTED, buildSampleWorkbook } from "./__fixtures__/sample";

function input(over: Partial<LetterInput> = {}): LetterInput {
  const groups = groupByCoverage(parseWorkbook(buildSampleWorkbook()).items);
  const result = calculateAward(groups, {
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
  return {
    jobName: "PR-R3-03073",
    jobAddress: "Calle Luna 12, Ponce, Puerto Rico 00730",
    subcontractor: "Acme Demolition",
    scopeOfWork: "",
    jobType: "Reconstruction",
    program: "PR R3",
    startDate: "2026-09-01",
    endDate: "2027-02-28",
    coverages: ["CE-DEMO", "CE-SITE"],
    result,
    issuedOn: "2026-08-27T00:00:00.000Z",
    ...over,
  };
}

test("the letter carries every section of the Quickbase template", () => {
  const html = renderLetter(input());
  for (const heading of [
    "Adjudicación de Subcontrato para Reconstruction",
    "Información del Caso",
    "Desglose de Adjudicación",
    "Desglose de Pagos",
    "Condiciones Generales",
    "Representante Autorizado",
  ]) {
    assert.ok(html.includes(heading), `missing section: ${heading}`);
  }
  assert.ok(html.includes("BYRDSON SERVICES, LLC"));
  assert.ok(html.includes("Priscilla M. Rodríguez Pérez"));
  assert.ok(html.includes("Asunto: Adjudicación &ndash; Subcontrato por Caso PR-R3-03073"));
});

test("all twenty conditions are present, in order", () => {
  const html = renderLetter(input());
  assert.equal(CONDITIONS.length, 20);
  let cursor = 0;
  for (const c of CONDITIONS) {
    const at = html.indexOf(c.title, cursor);
    assert.ok(at > -1, `condition ${c.n} missing: ${c.title}`);
    assert.ok(at >= cursor, `condition ${c.n} out of order`);
    cursor = at;
  }
  assert.ok(html.includes(MOBILISATION_NOTE.slice(0, 40)));
  assert.ok(html.includes(LETTER_INTRO.slice(0, 40)));
});

test("the award breakdown shows this system's derivation, not PO categories", () => {
  const html = renderLetter(input());
  assert.ok(html.includes("Menos Overhead &amp; Profit"));
  assert.ok(html.includes("Participación del Subcontratista (50%)"));
  assert.ok(html.includes("Hard Costs (HC)"));
  assert.ok(html.includes("Monto Total"));
  assert.ok(html.includes("$148,566.60"));
  assert.ok(html.includes("$112,550.45"));
  assert.ok(html.includes("$56,275.23"));
  assert.ok(html.includes("$122,000.00"));
  assert.ok(html.includes("$178,275.23"));

  // The Quickbase-only cost categories must not appear.
  for (const gone of ["Sistema Séptico", "Conversión ADA", "Cambio de Orden"]) {
    assert.ok(!html.includes(gone), `stale Quickbase row still present: ${gone}`);
  }
});

test("the payment schedule follows the job type and totals the award", () => {
  const eight = renderLetter(input({ jobType: "Reconstruction" }));
  for (const m of PAY_SCHEDULES.standard8) assert.ok(eight.includes(m.desc));
  assert.ok(eight.includes("Inspección Final"));

  const two = renderLetter(input({ jobType: "Relocation" }));
  assert.ok(two.includes("Pago Inicial"));
  assert.ok(!two.includes("Empañetado"), "20/80 letter must not list milestones");

  // Every schedule amount appears, and the total row is the award.
  const amounts = scheduleAmounts(178275.23, PAY_SCHEDULES.standard8);
  const last = amounts[amounts.length - 1].toFixed(2);
  assert.ok(eight.includes(last.replace(/\B(?=(\d{3})+(?!\d))/g, ",")));
  assert.ok(eight.includes("100.00%"));
});

test("blank fields render an em dash rather than 'undefined'", () => {
  const html = renderLetter(
    input({ jobAddress: "", program: "", startDate: "", endDate: "", subcontractor: "" }),
  );
  assert.ok(!/undefined|null|NaN/.test(html), "placeholder leaked into the letter");
  assert.ok(html.includes("—"));
});

test("user text is escaped, so a stray angle bracket cannot break the markup", () => {
  const html = renderLetter({
    ...input(),
    subcontractor: '<script>alert("x")</script>',
    jobName: 'A & B "quoted"',
  });
  assert.ok(!html.includes("<script>alert"), "unescaped markup made it through");
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("A &amp; B"));
});

test("dates render in the template's mm-dd-yyyy form", () => {
  const html = renderLetter(input({ startDate: "2026-09-01" }));
  assert.ok(html.includes("09-01-2026"), "start date not formatted");
  assert.ok(html.includes("08-27-2026"), "issue date not formatted");
});

test("the fixture award is the one the worksheet produces", () => {
  assert.ok(Math.abs(EXPECTED.award - 178275.23) < 0.005);
});

test("the letter shows an ADA line only when ADA applies", () => {
  const groups = groupByCoverage(parseWorkbook(buildSampleWorkbook()).items);
  const base = {
    basis: "rcv" as const,
    baseCoverages: ["CE-DEMO", "CE-SITE"],
    oandpPct: 32,
    lessOandPOverride: null,
    tiers: [50, 55, 60],
    selectedTier: 0,
    hc: DEFAULT_HC,
  };

  const plain = renderLetter(input());
  assert.ok(!plain.includes("ADA"), "an ordinary award reads exactly as before");

  const withAda = calculateAward(groups, { ...base, adaEnabled: true, ada: 15000 });
  const html = renderLetter(input({ result: withAda }));
  assert.match(html, /Conversión ADA/, "the breakdown names the ADA line");
  assert.ok(html.includes("15,000.00"));

  // Monto Total must be the figure the payment schedule divides, ADA included.
  const plainAward = calculateAward(groups, { ...base, adaEnabled: false, ada: 0 }).award;
  assert.ok(Math.abs(withAda.award - (plainAward + 15000)) < 0.005);
  const amounts = scheduleAmounts(withAda.award, PAY_SCHEDULES.standard8);
  assert.ok(Math.abs(amounts.reduce((a, b) => a + b, 0) - withAda.award) < 0.005);
});
