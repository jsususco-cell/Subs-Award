import { money, pct, toCsv } from "./format";
import { groupAmount } from "./award";
import type {
  AmountBasis,
  AwardResult,
  CoverageGroup,
  ScopeItem,
} from "./types";

const BASIS_LABEL: Record<AmountBasis, string> = {
  rcv: "RCV",
  acv: "ACV",
  itemAmount: "Item Amount",
};

interface Context {
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
  const pad = (label: string) => label.padEnd(12);
  const lines = [
    `Subcontractor Award — ${ctx.fileName}`,
    `Basis: ${BASIS_LABEL[ctx.basis]} · Base coverages: ${ctx.baseCoverages.join(", ") || "none"}`,
    "",
    `${pad("Demo/Site")}${money(result.base)}`,
    `${pad(`Less O&P`)}${money(result.lessOandP)}   (÷ ${(1 + oandpPct / 100).toFixed(2)})`,
  ];
  for (const row of result.tierRows) {
    lines.push(`${pad(pct(row.pct))}${money(row.amount)}${row.selected ? "   <- applied" : ""}`);
  }
  lines.push(`${pad("HC")}${money(result.hc)}`);
  lines.push(`${pad("Award")}${money(result.award)}${chosen ? `   (HC + ${pct(chosen.pct)})` : ""}`);
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
    ["Base coverages", ctx.baseCoverages.join(" + ")],
    [],
    ["SUMMARY", "Amount"],
    ["Demo/Site", round(result.base)],
    ["Less O&P", round(result.lessOandP)],
    ...result.tierRows.map((r) => [
      `${r.pct}%${r.selected ? " (applied)" : ""}`,
      round(r.amount),
    ]),
    ["HC", round(result.hc)],
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

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function downloadCsv(fileName: string, csv: string): void {
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
