import { money, pct } from "./format";
import { fill, templateFor } from "./letter-content";
import { regionFor, type RegionKey } from "./regions";
import type { BreakdownRow, PoCategories } from "./qb-award";
import { scheduleForJobType, scheduleLines, scheduleSetFor } from "./schedule";
import type { AwardResult } from "./types";

/** Thrown when the region has no letter template. Callers report it as a 400. */
export class NoLetterTemplateError extends Error {
  constructor(regionLabel: string) {
    super(
      `There is no award letter template for ${regionLabel} yet, so no letter ` +
        `can be produced. The Puerto Rico letter is not a substitute: it is in ` +
        `Spanish, and its conditions bind the subcontractor to CFSE coverage, ` +
        `OGPe permits and PRDOH programme rules that do not apply here.`,
    );
    this.name = "NoLetterTemplateError";
  }
}

export interface LetterInput {
  /** Which region's letter to render. Decides wording, schedule and language. */
  region: RegionKey;
  jobName: string;
  jobAddress: string;
  subcontractor: string;
  scopeOfWork: string;
  jobType: string;
  program: string;
  startDate: string;
  endDate: string;
  coverages: string[];
  /**
   * The purchase order's Award Breakdown, for an award entered directly rather
   * than derived from a scope. When present the letter itemises these instead
   * of showing the scope derivation, which does not exist for such an award.
   */
  categories?: PoCategories;
  /**
   * The hand-entered payment breakdown, where the region works that way. When
   * present it IS the payment schedule — the fixed milestones do not apply,
   * because nobody agreed to them.
   */
  breakdown?: BreakdownRow[];
  result: AwardResult;
  /** ISO date the letter is dated. */
  issuedOn: string;
}

const DASH = "—";

function esc(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function orDash(value: string): string {
  const v = (value ?? "").trim();
  return v ? esc(v) : DASH;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatDate(iso: string): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return esc(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}-${dd}-${d.getFullYear()}`;
}

/** Can a letter be produced for this region at all? */
export function canRenderLetter(region: RegionKey): boolean {
  return templateFor(regionFor(region)) !== null;
}

/**
 * Render the award letter.
 *
 * The wording, case table, payment breakdown and the numbered conditions come
 * from the region's template (src/lib/letter-content.ts) — this function is the
 * skeleton, not the words. The one deliberate difference from the Quickbase
 * template is the award breakdown: Quickbase itemises the purchase order's cost
 * categories, whereas this system derives the award from the extracted scope,
 * so the breakdown shows that derivation instead. The bottom line each produces
 * is the same figure the payment schedule divides.
 *
 * Throws `NoLetterTemplateError` for a region with no template. It must throw
 * rather than fall back: substituting another region's conditions would put a
 * contract in front of a subcontractor that nobody meant to offer them.
 */
export function renderLetter(input: LetterInput): string {
  const region = regionFor(input.region);
  const template = templateFor(region);
  if (!template) throw new NoLetterTemplateError(region.label);

  const L = template.labels;
  const { result } = input;
  const chosen = result.tierRows.find((r) => r.selected);
  /*
   * A hand-entered breakdown is the payment schedule. Using the region's fixed
   * milestones instead would print a schedule the subcontractor never agreed
   * to — this letter said 50/50 on a contract broken down 90/10.
   *
   * Percentages are restated from the amounts rather than printed as typed, so
   * the share always describes the figure beside it.
   */
  const entered = (input.breakdown ?? []).filter((r) => r.amount > 0);
  const lines = entered.length
    ? entered.map((r, i) => ({
        n: i + 1,
        desc: r.desc.trim() || `${i + 1}`,
        pct: result.award > 0 ? round2((r.amount / result.award) * 100) : r.pct,
        amount: r.amount,
      }))
    : scheduleLines(
        result.award,
        scheduleForJobType(input.jobType, region),
        scheduleSetFor(region)?.mobilisationCap ?? null,
      );
  const scheduleTotal = lines.reduce((s, l) => s + l.amount, 0);
  /*
   * Not hard-coded to 100%. A breakdown is allowed to cover only part of the
   * contract on a first pass, and a letter claiming the rows add to the whole
   * of it when they do not is the kind of thing that gets argued over later.
   */
  const schedulePct =
    result.award > 0 ? round2((scheduleTotal / result.award) * 100) : 100;
  const shortfall = round2(result.award - scheduleTotal);
  /* The cap note only means something where a mobilisation stage exists. */
  const hasMobilisation = lines.some((l) =>
    /^(movilizaci|mobiliz)/i.test(l.desc),
  );

  const caseRows: [string, string][] = [
    [L.caseProgram, orDash(input.program)],
    [L.caseProjectNumber, orDash(input.jobName)],
    [L.caseProjectAddress, orDash(input.jobAddress)],
    [L.caseScopeOfWork, orDash(input.scopeOfWork || input.jobType)],
    [L.caseStartDate, formatDate(input.startDate)],
    [L.caseEndDate, formatDate(input.endDate)],
    [L.caseTerm, L.caseTermValue],
    [L.caseExtension, L.caseExtensionValue],
  ];

  const c = input.categories;
  const awardRows: [string, string, boolean][] = c
    ? [
        // A direct award: the purchase order's own categories, zeroes omitted
        // so the letter shows what is actually being paid for.
        ...(
          [
            [L.awardDemolition, c.demolition],
            [L.awardSite, c.site],
            [L.awardSeptic, c.septic],
            [L.awardHome, c.home],
            [L.awardAda, c.ada],
            [L.awardChangeOrder, c.changeOrder],
            [L.awardRevisedTotal, c.revisedTotal],
          ] as [string, number][]
        )
          .filter(([, v]) => v > 0)
          .map(
            ([label, v]) =>
              [label, money(v), false] as [string, string, boolean],
          ),
        [L.awardTotal, money(result.award), true],
      ]
    : entered.length
      ? /*
         * A contract-entry award is one figure. The rows below describe a
         * scope derivation it does not have, and printing them as $0.00 —
         * which is what happened when the breakdown replaced the categories —
         * says the award was worked out from nothing.
         */
        [[L.awardTotal, money(result.award), true]]
      : [
          [
            fill(L.awardExtracted, {
              coverages: esc(input.coverages.join(" + ")) || DASH,
            }),
            money(result.base),
            false,
          ],
          [L.awardLessOandP, money(result.lessOandP), false],
          [
            fill(L.awardSubsShare, { pct: chosen ? pct(chosen.pct) : DASH }),
            chosen ? money(chosen.amount) : DASH,
            false,
          ],
          [L.awardHc, money(result.hc), false],
          // Only shown when it applies, so an ordinary award reads as before.
          ...(result.ada > 0
            ? ([[L.awardAda, money(result.ada), false]] as [
                string,
                string,
                boolean,
              ][])
            : []),
          [L.awardTotal, money(result.award), true],
        ];

  return `<!DOCTYPE html>
<html lang="${template.lang}">
<head>
<meta charset="utf-8">
<title>${fill(L.documentTitle, { job: orDash(input.jobName) })}</title>
<style>
  @page { size: letter; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, "Times New Roman", serif; font-size: 10.5pt;
         line-height: 1.45; color: #101d35; margin: 0; padding: 24px; }
  .sheet { max-width: 800px; margin: 0 auto; }
  header.brand { text-align: center; border-bottom: 3px solid #c8102e; padding-bottom: 10px; }
  header.brand .name { font-size: 15pt; font-weight: bold; color: #1f3864; letter-spacing: .5px; }
  header.brand .line { font-size: 9pt; color: #2b4b85; }
  h1 { font-size: 12.5pt; color: #1f3864; text-align: center; margin: 18px 0 4px; }
  h1 + .date { text-align: center; font-size: 9.5pt; color: #2b4b85; margin-bottom: 18px; }
  h2 { font-size: 11pt; color: #1f3864; border-bottom: 1px solid #1f3864;
       padding-bottom: 3px; margin: 22px 0 8px; }
  .addr { font-size: 10pt; line-height: 1.35; }
  .addr .to { margin-top: 12px; font-weight: bold; }
  .subject { margin: 14px 0; font-weight: bold; }
  p { margin: 0 0 10px; text-align: justify; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  th, td { border: 1px solid #1f3864; padding: 5px 8px; font-size: 10pt; vertical-align: top; }
  th { background: #e7ecf5; color: #1f3864; text-align: left; font-weight: bold; }
  td.label { width: 42%; background: #f7f9fc; font-weight: bold; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  tr.total td { background: #e7ecf5; font-weight: bold; }
  .note { font-size: 9pt; font-style: italic; color: #182b4d; margin: 8px 0 0; }
  ol.conditions { padding-left: 18px; }
  ol.conditions li { margin-bottom: 9px; text-align: justify; }
  ol.conditions .t { font-weight: bold; }
  .signatures { margin-top: 30px; page-break-inside: avoid; }
  .signatures .who { margin-bottom: 4px; font-weight: bold; }
  .sigline { margin: 18px 0 4px; font-size: 10pt; }
  @media print { body { padding: 0; } .sheet { max-width: none; } }
</style>
</head>
<body>
<div class="sheet">

  <header class="brand">
    <div class="name">${template.header[0]}</div>
    ${template.header
      .slice(1)
      .map((l) => `<div class="line">${l}</div>`)
      .join("\n    ")}
  </header>

  <h1>${fill(L.heading, { jobType: orDash(input.jobType) })}</h1>
  <div class="date">${formatDate(input.issuedOn)}</div>

  <div class="addr">
    ${template.cmAddress.map((l) => `<div>${l}</div>`).join("\n    ")}
    <div class="to">${orDash(input.subcontractor)}</div>
  </div>

  <p class="subject">${fill(L.subject, { job: orDash(input.jobName) })}</p>

  <p>${esc(template.intro)}</p>

  <h2>${L.sectionCase}</h2>
  <table>
    <tbody>
      ${caseRows
        .map(([k, v]) => `<tr><td class="label">${k}</td><td>${v}</td></tr>`)
        .join("\n      ")}
    </tbody>
  </table>

  <h2>${L.sectionAward}</h2>
  <table>
    <tbody>
      ${awardRows
        .map(
          ([k, v, isTotal]) =>
            `<tr${isTotal ? ' class="total"' : ""}><td class="label">${k}</td><td class="num">${v}</td></tr>`,
        )
        .join("\n      ")}
    </tbody>
  </table>

  ${
    // A region can have a letter but no payment milestones. Printing an empty
    // breakdown would read as "no payments due", so the section is omitted.
    lines.length
      ? `<h2>${L.sectionSchedule}</h2>
  <table>
    <thead>
      <tr><th style="width:8%">${L.scheduleNumber}</th><th>${L.scheduleStage}</th><th class="num" style="width:14%">${L.schedulePct}</th><th class="num" style="width:24%">${L.scheduleAmount}</th></tr>
    </thead>
    <tbody>
      ${lines
        .map(
          (l) =>
            `<tr><td>${l.n}</td><td>${esc(l.desc)}</td><td class="num">${l.pct.toFixed(2)}%</td><td class="num">${money(l.amount)}</td></tr>`,
        )
        .join("\n      ")}
    </tbody>
    <tfoot>
      <tr class="total"><td></td><td>${L.scheduleTotal}</td><td class="num">${schedulePct.toFixed(2)}%</td><td class="num">${money(scheduleTotal)}</td></tr>
    </tfoot>
  </table>${
    shortfall > 0.005
      ? `\n  <p class="note">${esc(fill(L.scheduleShortfall, { amount: money(shortfall) }))}</p>`
      : ""
  }${
    template.scheduleNote && hasMobilisation
      ? `\n  <p class="note">${esc(template.scheduleNote)}</p>`
      : ""
  }`
      : ""
  }

  <h2>${L.sectionConditions}</h2>
  <ol class="conditions">
    ${template.conditions
      .map(
        (c) => `<li><span class="t">${esc(c.title)}</span> ${esc(c.text)}</li>`,
      )
      .join("\n    ")}
  </ol>

  <div class="signatures">
    <div class="who">${esc(template.signatory.name)}</div>
    <div>${esc(template.signatory.title)}</div>
    <div>${esc(template.signatory.company)}</div>
    <div class="sigline">${L.signatureLine}</div>

    <div class="who" style="margin-top:22px">${L.counterparty}</div>
    <div>${orDash(input.subcontractor)}</div>
    <div class="sigline">${L.signatureLine}</div>
  </div>

</div>
</body>
</html>`;
}
