/**
 * A synthetic scope-of-work workbook that mirrors the real export this app was
 * built against: the same coverage codes, the same RCV figures (so the known
 * totals are reproduced to the cent), the same string-typed negatives, and the
 * same trailing summary block whose labels sit under the Sales Tax column.
 *
 * Real client scope files are not committed; this fixture stands in for them.
 */
import * as XLSX from "xlsx";

export const SAMPLE_ROWS: [string, number, number|string, number|string, number, number|string][] = [
  ["SC-MIT", 1.0, 42000.0, 0.0, 42000.0, 42000.0],
  ["HC", 1.0, 194941.5, 0.0, 194941.5, 194941.5],
  ["CE-DEMO", 3150.0, 0.0, 0.0, 0.0, 0.0],
  ["CE-DEMO", 1664.3500000000001, 39944.4, 0.0, 39944.4, 39944.4],
  ["CE-DEMO", 730.08, 12411.36, 0.0, 12411.36, 12411.36],
  ["CE-DEMO", 53.0, 977.85, 0.0, 1290.76, 1290.76],
  ["CE-DEMO", 1000.0, 1020.0, 0.0, 1346.4, 1346.4],
  ["CE-DEMO", 16.0, 1916.96, 0.0, 2530.39, 2530.39],
  ["CE-DEMO", 2.0, 619.44, 0.0, 817.66, 817.66],
  ["CE-DEMO", 23.0, 572.01, 0.0, 755.05, 755.05],
  ["CE-DEMO", 16.0, 715.04, 0.0, 943.86, 943.86],
  ["CE-SITE", 137.0, 0.0, 0.0, 0.0, 0.0],
  ["CE-SITE", 309.3, 0.0, 0.0, 0.0, 0.0],
  ["CE-SITE", 9.0, 0.0, 0.0, 0.0, 0.0],
  ["CE-SITE", 424.0, 4969.28, 0.0, 6559.45, 6559.45],
  ["CE-SITE", 549.1800000000001, 15091.47, 1227.75, 21148.49, 21148.49],
  ["CE-SITE", 27.0, 8362.44, 0.0, 11038.42, 11038.42],
  ["CE-SITE", 39.0, 12.48, 0.31, 16.79, 16.79],
  ["CE-SITE", 39.0, 78.78, 4.71, 108.7, 108.7],
  ["CE-SITE", 39.0, 206.7, 10.14, 282.98, 282.98],
  ["CE-SITE", 0.72, 8.44, 0.0, 11.14, 11.14],
  ["CE-SITE", 134.0, 42.88, 1.08, 57.69, 57.69],
  ["CE-SITE", 134.0, 270.68, 16.18, 373.48, 373.48],
  ["CE-SITE", 134.0, 710.2, 34.83, 972.29, 972.29],
  ["CE-SITE", 2.5, 29.3, 0.0, 38.68, 38.68],
  ["CE-SITE", 1.0, 11983.5, 0.0, 15818.22, 15818.22],
  ["CE-SITE", 1.0, 5305.27, 0.0, 7002.95, 7002.95],
  ["CE-SITE", 3.0, 13012.53, 0.0, 17176.54, 17176.54],
  ["CE-SITE", 8.0, 1064.48, 0.0, 1405.12, 1405.12],
  ["CE-SITE", 11.0, 0.0, 0.0, 0.0, 0.0],
  ["CE-SITE", 0.52, 197.88, 6.47, 267.68, 267.68],
  ["CE-SITE", 1.0, 1536.99, 37.88, 2066.71, 2066.71],
  ["CE-SITE", 93.0, 396.18, 4.6, 527.56, 527.56],
  ["CE-SITE", 93.0, 111.6, 4.28, 151.59, 151.59],
  ["CE-SITE", 1.0, 615.29, 20.55, 832.74, 832.74],
  ["CE-SITE", 1.0, 123.49, 2.05, 165.06, 165.06],
  ["CE-SITE", 84.0, 0.0, 0.0, 0.0, 0.0],
  ["CE-SITE", 10.0, 53.1, 0.98, 71.07, 71.07],
  ["CE-SITE", 12.0, 27.84, 1.77, 38.52, 38.52],
  ["CE-SITE", 159.0, 0.0, 0.0, 0.0, 0.0],
  ["CE-SITE", 8.0, 871.68, 0.0, 1150.62, 1150.62],
  ["CE-SITE", 16.0, 715.04, 0.0, 943.86, 943.86],
  ["CE-SITE", 7.800000000000001, 214.34, 17.44, 300.37, 300.37],
  ["CE-WSS", 1.0, 4370.0, 0.0, 4370.0, 4370.0],
  ["CE-PVS", 1.0, 26800.0, 0.0, 26800.0, 26800.0],
  ["CE-ENV", 1.0, 380.0, 0.0, 501.6, 501.6],
  ["CE-ENV", 10.0, 350.0, 0.0, 462.0, 462.0],
  ["CE-ENV", 1.0, 430.0, 0.0, 567.6, 567.6],
  ["CE-ENV", 10.0, 450.0, 0.0, 594.0, 594.0],
  ["TAX-MIT", 1.0, 0.0, 0.0, 0.0, 0.0],
  ["TAX-MIT", 1.0, 0.0, 0.0, 0.0, 0.0],
  ["TAX-MIT", 1.0, 0.0, 0.0, 0.0, 0.0],
  ["TAX-MIT", 1.0, 0.0, 0.0, 0.0, 0.0],
  ["TAX-MIT", 1.0, 2089.13, 0.0, 2089.13, 2089.13],
  ["TAX-MIT", 1.0, 18791.39, 0.0, 18791.39, 18791.39],
  ["SR", 1.0, "-686.63", "-69", -975.36, "-975.36"],
];

/** Totals independently confirmed against the source workbook. */
export const EXPECTED = {
  itemCount: 56,
  demoSiteRcv: 148566.59999999992,
  lessOandP: 112550.45454545447,
  tier50: 56275.227272727236,
  tier60: 67530.27272727268,
  tier70: 78785.31818181812,
  hc: 122000,
  award: 178275.22727272724,
  hcCoverageRcv: 194941.5,
};

const HEADERS = [
  "#", "Group Code", "Group Description", "Desc", "Age", "Condition", "Qty",
  "Item Amount", "Reported Cost", "Unit Cost", "Coverage", "Sales Tax", "RCV",
  "Life", "Depreciation Type", "Depreciation Amount", "Recoverable", "ACV",
  "Tax", "Replace", "Cat", "Sel", "Owner", "Original Vendor", "Date",
];

/** Build the fixture workbook as an ArrayBuffer, ready for `parseWorkbook`. */
export function buildSampleWorkbook(): ArrayBuffer {
  const aoa: unknown[][] = [HEADERS];

  SAMPLE_ROWS.forEach(([coverage, qty, itemAmount, salesTax, rcv, acv], i) => {
    const row: unknown[] = new Array(HEADERS.length).fill(null);
    row[0] = i + 1;
    row[1] = `GRP_${coverage.replace(/[^A-Z]/g, "")}`;
    row[2] = `${coverage} group`;
    row[3] = `Line item ${i + 1}`;
    row[6] = qty;
    row[7] = itemAmount;
    row[9] = 0;
    row[10] = coverage;
    row[11] = salesTax;
    row[12] = rcv;
    row[17] = acv;
    row[20] = "CAT";
    row[21] = "SEL";
    aoa.push(row);
  });

  // Blank spacer, then the summary block: labels land in the Sales Tax column
  // and figures under RCV, with no Coverage value on any of those rows.
  aoa.push(new Array(HEADERS.length).fill(null));
  const summary: [string | number, number][] = [
    ["Demo/Site", EXPECTED.demoSiteRcv],
    ["Less O&P", EXPECTED.lessOandP],
    [0.5, EXPECTED.tier50],
    [0.6, EXPECTED.tier60],
    [0.7, EXPECTED.tier70],
    ["HC", EXPECTED.hc],
    ["Award", EXPECTED.award],
  ];
  for (const [label, value] of summary) {
    const row: unknown[] = new Array(HEADERS.length).fill(null);
    row[11] = label;
    row[12] = value;
    aoa.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Hoja1");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return buf;
}
