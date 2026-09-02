import { money, pct, toCsv } from "./format";
import { groupAmount } from "./award";
import { TEMPLATE_COLUMNS, coverageLabel, templateRow } from "./extract";
import type { AmountBasis, AwardResult, CoverageGroup, ScopeItem } from "./types";
import type { Extraction } from "./extract";

const BASIS_LABEL: Record<AmountBasis, string> = {
  rcv: "RCV",
  acv: "ACV",
  itemAmount: "Item Amount",
};

export interface Context {
  fileName: string;
  basis: AmountBasis;
  oandpPct: number;
  baseCoverages: string[];
  groups: CoverageGroup[];
  items: ScopeItem[];
  result: AwardResult;
}

/** The summary block as plain text, in the same shape as the source worksheet. */
export function summaryText(ctx: Context): string {
  const { result, oandpPct } = ctx;
  const chosen = result.tierRows.find((r) => r.selected);
  const scope = coverageLabel(ctx.baseCoverages);
  const pad = (label: string) => label.padEnd(14);
  const lines = [
    `Subcontractor Award — ${ctx.fileName}`,
    `Basis: ${BASIS_LABEL[ctx.basis]} · Coverages: ${ctx.baseCoverages.join(", ") || "none"}`,
    "",
    `${pad(scope)}${money(result.base)}`,
    `${pad("Less O&P")}${money(result.lessOandP)}   ${
      result.lessOandPIsManual ? "(manual entry)" : `(÷ ${(1 + oandpPct / 100).toFixed(2)})`
    }`,
  ];
  for (const row of result.tierRows) {
    lines.push(
      `${pad(pct(row.pct))}${money(row.amount)}${row.selected ? "   <- applied" : ""}`,
    );
  }
  lines.push(`${pad("HC")}${money(result.hc)}`);
  if (result.ada > 0) lines.push(`${pad("ADA")}${money(result.ada)}`);
  lines.push(
    `${pad("Award")}${money(result.award)}${chosen ? `   (HC + ${pct(chosen.pct)})` : ""}`,
  );
  return lines.join("\n");
}

/** A workbook-style CSV: the summary, the coverage roll-up, then every line. */
export function buildCsv(ctx: Context): string {
  const { result, groups, items, basis } = ctx;
  const rows: (string | number)[][] = [
    ["Subcontractor Award"],
    ["Source file", ctx.fileName],
    ["Amount basis", BASIS_LABEL[basis]],
    ["O&P %", ctx.oandpPct],
    ["Coverages", ctx.baseCoverages.join(" + ")],
    [],
    ["SUMMARY", "Amount"],
    [coverageLabel(ctx.baseCoverages), round(result.base)],
    [
      result.lessOandPIsManual ? "Less O&P (manual)" : "Less O&P",
      round(result.lessOandP),
    ],
    ...result.tierRows.map((r) => [
      `${r.pct}%${r.selected ? " (applied)" : ""}`,
      round(r.amount),
    ]),
    ["HC", round(result.hc)],
    ...(result.ada > 0 ? ([["ADA", round(result.ada)]] as [string, number][]) : []),
    ["Award", round(result.award)],
    [],
    ["COVERAGE", "Lines", "In base", BASIS_LABEL[basis], "RCV", "ACV", "Item Amount"],
    ...groups.map((g) => [
      g.coverage,
      g.count,
      ctx.baseCoverages.includes(g.coverage) ? "Yes" : "",
      round(groupAmount(g, basis)),
      round(g.rcv),
      round(g.acv),
      round(g.itemAmount),
    ]),
    [],
    [
      "ROW",
      "#",
      "Group Code",
      "Group Description",
      "Description",
      "Coverage",
      "Qty",
      "Unit Cost",
      "Item Amount",
      "Sales Tax",
      "RCV",
      "ACV",
    ],
    ...items.map((i) => [
      i.row,
      i.lineNo ?? "",
      i.groupCode,
      i.groupDesc,
      i.desc,
      i.coverage,
      i.qty,
      round(i.unitCost),
      round(i.itemAmount),
      round(i.salesTax),
      round(i.rcv),
      round(i.acv),
    ]),
  ];
  return toCsv(rows);
}

/**
 * The extracted scope in the structured template's own column order, so the
 * output can stand in for a hand-built scope-of-work sheet.
 */
export function buildScopeCsv(extraction: Extraction, basis: AmountBasis): string {
  // Only the included lines make up the awarded scope, but the ones set aside
  // are listed underneath rather than dropped, so the file records the review.
  const rows: (string | number)[][] = [
    [...TEMPLATE_COLUMNS],
    ...extraction.includedItems.map((item, i) => templateRow(item, i)),
  ];

  rows.push([]);
  for (const g of extraction.keptGroups) {
    rows.push([`${g.coverage} total`, "", "", "", "", "", "", "", "", round(g.rcv)]);
  }
  if (extraction.excludedCount > 0) {
    rows.push([]);
    rows.push([
      `EXCLUDED FROM THE AWARD (${extraction.excludedCount} line${
        extraction.excludedCount === 1 ? "" : "s"
      })`,
    ]);
    rows.push([...TEMPLATE_COLUMNS]);
    const excluded = new Set(extraction.excludedRows);
    extraction.items
      .filter((i) => excluded.has(i.row))
      .forEach((item, i) => rows.push(templateRow(item, i)));
    rows.push(["Excluded total", "", "", "", "", "", "", "", "", round(extraction.excludedTotal)]);
    rows.push([]);
  }

  rows.push([
    `${coverageLabel(extraction.keptCoverages)} total`,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    round(extraction.keptGroups.reduce((s, g) => s + groupAmount(g, basis), 0)),
  ]);
  return toCsv(rows);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function downloadCsv(fileName: string, csv: string): void {
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
