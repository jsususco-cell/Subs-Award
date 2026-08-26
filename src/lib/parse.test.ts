import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWorkbook, toNumber } from "./parse";
import { buildSampleWorkbook } from "./__fixtures__/sample";
import * as XLSX from "xlsx";

test("toNumber handles the shapes Excel exports leave behind", () => {
  assert.equal(toNumber(1234.5), 1234.5);
  assert.equal(toNumber("-686.63"), -686.63);
  assert.equal(toNumber("$1,234.50"), 1234.5);
  assert.equal(toNumber("(500.00)"), -500);
  assert.equal(toNumber(""), 0);
  assert.equal(toNumber(null), 0);
  assert.equal(toNumber("n/a"), 0);
});

test("records which sheet and header row it read", () => {
  const parsed = parseWorkbook(buildSampleWorkbook());
  assert.equal(parsed.sheetName, "Hoja1");
  assert.equal(parsed.headerRow, 1);
  assert.equal(parsed.mappedColumns.coverage, "Coverage");
  assert.equal(parsed.mappedColumns.rcv, "RCV");
});

function bookFrom(aoa: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "S1");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

test("finds the header row when preamble rows sit above it", () => {
  const parsed = parseWorkbook(
    bookFrom([
      ["Byrdson Services"],
      ["Scope of Work 03073"],
      [],
      ["Desc", "Coverage", "RCV"],
      ["Tear-out", "CE-DEMO", 100],
    ]),
  );
  assert.equal(parsed.headerRow, 4);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].rcv, 100);
  assert.equal(parsed.items[0].row, 5);
});

test("rejects a workbook with no coverage column", () => {
  assert.throws(
    () => parseWorkbook(bookFrom([["Desc", "Amount"], ["Tear-out", 100]])),
    /Coverage/,
  );
});

test("rejects a workbook whose rows all lack a coverage value", () => {
  assert.throws(
    () => parseWorkbook(bookFrom([["Desc", "Coverage", "RCV"], ["Tear-out", "", 100]])),
    /no line items/,
  );
});
