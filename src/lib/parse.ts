import * as XLSX from "xlsx";
import type { IgnoredRow, ParseResult, ScopeItem } from "./types";

type Row = unknown[];

/** Canonical field -> accepted header spellings (normalised). */
const COLUMN_ALIASES: Record<keyof ColumnMap, string[]> = {
  lineNo: ["#", "no", "num", "line", "lineno", "item"],
  groupCode: ["groupcode", "group"],
  groupDesc: ["groupdescription", "groupdesc"],
  desc: ["desc", "description", "itemdescription", "lineitem"],
  qty: ["qty", "quantity"],
  unitCost: ["unitcost", "unitprice"],
  itemAmount: ["itemamount", "amount", "lineamount"],
  salesTax: ["salestax", "tax"],
  rcv: ["rcv", "replacementcostvalue"],
  acv: ["acv", "actualcashvalue"],
  coverage: ["coverage", "cov"],
  cat: ["cat", "category"],
  sel: ["sel", "selector"],
};

interface ColumnMap {
  lineNo: number;
  groupCode: number;
  groupDesc: number;
  desc: number;
  qty: number;
  unitCost: number;
  itemAmount: number;
  salesTax: number;
  rcv: number;
  acv: number;
  coverage: number;
  cat: number;
  sel: number;
}

const FIELDS = Object.keys(COLUMN_ALIASES) as (keyof ColumnMap)[];

function normalise(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9#]/g, "");
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

/**
 * Coerce a cell to a number. Handles the strings Excel exports leave behind
 * ("-686.63", "$1,234.50", "(500.00)" for negatives).
 */
export function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = text(value);
  if (!raw) return 0;
  const negative = /^\(.*\)$/.test(raw);
  const cleaned = raw.replace(/[()$\s,]/g, "");
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return 0;
  return negative ? -Math.abs(n) : n;
}

function buildColumnMap(row: Row): { map: ColumnMap; labels: Record<string, string> } {
  const map = FIELDS.reduce((acc, f) => {
    acc[f] = -1;
    return acc;
  }, {} as ColumnMap);
  const labels: Record<string, string> = {};
  row.forEach((cell, index) => {
    const key = normalise(cell);
    if (!key) return;
    for (const field of FIELDS) {
      if (map[field] === -1 && COLUMN_ALIASES[field].includes(key)) {
        map[field] = index;
        labels[field] = text(cell);
        return;
      }
    }
  });
  return { map, labels };
}

/** A header row must identify the coverage column and at least one money column. */
function headerScore(map: ColumnMap): number {
  if (map.coverage === -1) return 0;
  if (map.rcv === -1 && map.itemAmount === -1 && map.acv === -1) return 0;
  return FIELDS.reduce((n, f) => n + (map[f] === -1 ? 0 : 1), 0);
}

function isBlank(row: Row): boolean {
  return !row || row.every((c) => text(c) === "");
}

function preview(row: Row): string {
  return row
    .map((c) => text(c))
    .filter(Boolean)
    .slice(0, 4)
    .join(" | ");
}

/**
 * Read a scope-of-work workbook into line items.
 *
 * Only rows carrying a Coverage value become line items. That is what keeps
 * trailing summary blocks out of the data: in the sample export the summary
 * labels sit in the Sales Tax column with their figures under RCV, so a
 * position-based read would otherwise swallow them as line items.
 */
export function parseWorkbook(data: ArrayBuffer): ParseResult {
  const wb = XLSX.read(data, { type: "array", cellDates: true });

  let best: { sheetName: string; rows: Row[]; headerRow: number; score: number } | null =
    null;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<Row>(ws, {
      header: 1,
      raw: true,
      blankrows: true,
      defval: null,
    });
    const limit = Math.min(rows.length, 50);
    for (let i = 0; i < limit; i++) {
      const score = headerScore(buildColumnMap(rows[i] ?? []).map);
      if (score > 0 && (!best || score > best.score)) {
        best = { sheetName, rows, headerRow: i, score };
      }
    }
  }

  if (!best) {
    throw new Error(
      "Could not find a header row with a Coverage column and an RCV, ACV, or Item Amount column.",
    );
  }

  const { map, labels } = buildColumnMap(best.rows[best.headerRow] ?? []);
  const cell = (row: Row, index: number) => (index === -1 ? null : row[index]);

  const items: ScopeItem[] = [];
  const ignored: IgnoredRow[] = [];

  for (let i = best.headerRow + 1; i < best.rows.length; i++) {
    const row = best.rows[i] ?? [];
    if (isBlank(row)) continue;

    const coverage = text(cell(row, map.coverage));
    if (!coverage) {
      ignored.push({ row: i + 1, reason: "No Coverage value", preview: preview(row) });
      continue;
    }
    if (normalise(coverage) === "coverage") continue; // a repeated header

    items.push({
      row: i + 1,
      lineNo: map.lineNo === -1 ? null : toNumber(cell(row, map.lineNo)) || null,
      groupCode: text(cell(row, map.groupCode)),
      groupDesc: text(cell(row, map.groupDesc)),
      desc: text(cell(row, map.desc)),
      qty: toNumber(cell(row, map.qty)),
      unitCost: toNumber(cell(row, map.unitCost)),
      itemAmount: toNumber(cell(row, map.itemAmount)),
      salesTax: toNumber(cell(row, map.salesTax)),
      rcv: toNumber(cell(row, map.rcv)),
      acv: toNumber(cell(row, map.acv)),
      coverage,
      cat: text(cell(row, map.cat)),
      sel: text(cell(row, map.sel)),
    });
  }

  if (!items.length) {
    throw new Error("Found a header row but no line items with a Coverage value.");
  }

  return {
    sheetName: best.sheetName,
    headerRow: best.headerRow + 1,
    items,
    ignored,
    mappedColumns: labels,
  };
}
