const CURRENCY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NUMBER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function money(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return CURRENCY.format(n);
}

export function num(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return NUMBER.format(n);
}

/** Percentages are shown without trailing zeros: 50, 62.5. */
export function pct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${NUMBER.format(n)}%`;
}

export function csvCell(value: string | number): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
