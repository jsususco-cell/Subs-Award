import { money, pct } from "./format";
import {
  CM_ADDRESS,
  CONDITIONS,
  LETTER_HEADER,
  LETTER_INTRO,
  MOBILISATION_NOTE,
  SIGNATORY,
} from "./letter-content";
import { scheduleAmounts, scheduleForJobType } from "./schedule";
import type { AwardResult } from "./types";

export interface LetterInput {
  jobName: string;
  jobAddress: string;
  subcontractor: string;
  scopeOfWork: string;
  jobType: string;
  program: string;
  startDate: string;
  endDate: string;
  coverages: string[];
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

function formatDate(iso: string): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return esc(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}-${dd}-${d.getFullYear()}`;
}

/**
 * Render the award letter.
 *
 * The wording, case table, payment breakdown and the twenty conditions follow
 * the Quickbase template. The one deliberate difference is the **Desglose de
 * Adjudicación**: Quickbase itemises the purchase order's cost categories,
 * whereas this system derives the award from the extracted scope, so the
 * breakdown shows that derivation instead. The bottom line each produces —
 * Monto Total — is the same figure the payment schedule divides.
 */
export function renderLetter(input: LetterInput): string {
  const { result } = input;
  const chosen = result.tierRows.find((r) => r.selected);
  const schedule = scheduleForJobType(input.jobType);
  const amounts = scheduleAmounts(result.award, schedule);
  const scheduleTotal = amounts.reduce((s, a) => s + a, 0);

  const caseRows: [string, string][] = [
    ["Programa", orDash(input.program)],
    ["Número del Proyecto", orDash(input.jobName)],
    ["Dirección del Proyecto", orDash(input.jobAddress)],
    ["Alcance de Trabajo", orDash(input.scopeOfWork || input.jobType)],
    ["Fecha de Inicio Estimada", formatDate(input.startDate)],
    ["Fecha de Finalización Estimada", formatDate(input.endDate)],
    ["Plazo de Ejecución", "180 días calendario desde el NTP"],
    ["Extensión de Finalización", "N/A"],
  ];

  const awardRows: [string, string, boolean][] = [
    [
      `Alcance Extraído (${input.coverages.join(" + ") || DASH})`,
      money(result.base),
      false,
    ],
    ["Menos Overhead &amp; Profit", money(result.lessOandP), false],
    [
      `Participación del Subcontratista (${chosen ? pct(chosen.pct) : DASH})`,
      chosen ? money(chosen.amount) : DASH,
      false,
    ],
    ["Hard Costs (HC)", money(result.hc), false],
    // Only shown when it applies, so an ordinary award reads exactly as before.
    ...(result.ada > 0
      ? ([["Conversión ADA", money(result.ada), false]] as [string, string, boolean][])
      : []),
    ["Monto Total", money(result.award), true],
  ];

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Adjudicación de Subcontrato — ${orDash(input.jobName)}</title>
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
    <div class="name">${LETTER_HEADER[0]}</div>
    ${LETTER_HEADER.slice(1).map((l) => `<div class="line">${l}</div>`).join("\n    ")}
  </header>

  <h1>Adjudicación de Subcontrato para ${orDash(input.jobType)}</h1>
  <div class="date">${formatDate(input.issuedOn)}</div>

  <div class="addr">
    ${CM_ADDRESS.map((l) => `<div>${l}</div>`).join("\n    ")}
    <div class="to">${orDash(input.subcontractor)}</div>
  </div>

  <p class="subject">Asunto: Adjudicación &ndash; Subcontrato por Caso ${orDash(input.jobName)}</p>

  <p>${esc(LETTER_INTRO)}</p>

  <h2>Información del Caso</h2>
  <table>
    <tbody>
      ${caseRows
        .map(([k, v]) => `<tr><td class="label">${k}</td><td>${v}</td></tr>`)
        .join("\n      ")}
    </tbody>
  </table>

  <h2>Desglose de Adjudicación</h2>
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

  <h2>Desglose de Pagos</h2>
  <table>
    <thead>
      <tr><th style="width:8%">#</th><th>Etapa</th><th class="num" style="width:14%">%</th><th class="num" style="width:24%">Monto del Pago</th></tr>
    </thead>
    <tbody>
      ${schedule
        .map(
          (m, i) =>
            `<tr><td>${m.n}</td><td>${m.desc}</td><td class="num">${m.pct.toFixed(2)}%</td><td class="num">${money(amounts[i])}</td></tr>`,
        )
        .join("\n      ")}
    </tbody>
    <tfoot>
      <tr class="total"><td></td><td>Total</td><td class="num">100.00%</td><td class="num">${money(scheduleTotal)}</td></tr>
    </tfoot>
  </table>
  <p class="note">${esc(MOBILISATION_NOTE)}</p>

  <h2>Condiciones Generales</h2>
  <ol class="conditions">
    ${CONDITIONS.map(
      (c) => `<li><span class="t">${esc(c.title)}</span> ${esc(c.text)}</li>`,
    ).join("\n    ")}
  </ol>

  <div class="signatures">
    <div class="who">${SIGNATORY.name}</div>
    <div>${SIGNATORY.title}</div>
    <div>${SIGNATORY.company}</div>
    <div class="sigline">Firma: ____________________&nbsp;&nbsp;&nbsp;Fecha: ____________</div>

    <div class="who" style="margin-top:22px">Representante Autorizado</div>
    <div>${orDash(input.subcontractor)}</div>
    <div class="sigline">Firma: ____________________&nbsp;&nbsp;&nbsp;Fecha: ____________</div>
  </div>

</div>
</body>
</html>`;
}
