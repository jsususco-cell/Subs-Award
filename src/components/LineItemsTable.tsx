"use client";

import { useMemo, useState } from "react";
import { money, num } from "@/lib/format";
import type { AmountBasis, ScopeItem } from "@/lib/types";

interface Props {
  items: ScopeItem[];
  basis: AmountBasis;
  baseCoverages: string[];
}

const PAGE = 100;

export default function LineItemsTable({ items, basis, baseCoverages }: Props) {
  const [query, setQuery] = useState("");
  const [onlyBase, setOnlyBase] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const chosen = useMemo(() => new Set(baseCoverages), [baseCoverages]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (onlyBase && !chosen.has(item.coverage)) return false;
      if (!q) return true;
      return (
        item.desc.toLowerCase().includes(q) ||
        item.coverage.toLowerCase().includes(q) ||
        item.groupDesc.toLowerCase().includes(q) ||
        item.groupCode.toLowerCase().includes(q)
      );
    });
  }, [items, query, onlyBase, chosen]);

  const total = filtered.reduce((sum, i) => sum + i[basis], 0);
  const shown = filtered.slice(0, limit);

  return (
    <section className="rounded-xl border border-navy-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-100 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-wide text-navy-800 uppercase">
          Line items{" "}
          <span className="ml-1 font-normal text-navy-600/70 normal-case">
            {filtered.length === items.length
              ? `(${items.length})`
              : `(${filtered.length} of ${items.length})`}
          </span>
        </h2>
        <div className="no-print flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-navy-600">
            <input
              type="checkbox"
              checked={onlyBase}
              aria-label="Show only line items in the base coverages"
              onChange={(e) => {
                setOnlyBase(e.target.checked);
                setLimit(PAGE);
              }}
              className="h-3.5 w-3.5 accent-[var(--color-navy-700)]"
            />
            Base only
          </label>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Filter…"
            aria-label="Filter line items"
            className="w-44 rounded-md border border-navy-200 px-2.5 py-1.5 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
          />
        </div>
      </header>

      <div className="max-h-[28rem] overflow-auto print-full">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-navy-50 text-xs tracking-wide text-navy-600/80 uppercase">
            <tr>
              <th scope="col" className="px-4 py-2 text-left font-semibold">
                #
              </th>
              <th scope="col" className="py-2 text-left font-semibold">
                Description
              </th>
              <th scope="col" className="py-2 text-left font-semibold">
                Coverage
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                Qty
              </th>
              <th scope="col" className="px-4 py-2 text-right font-semibold">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((item) => {
              const inBase = chosen.has(item.coverage);
              return (
                <tr key={item.row} className="border-b border-navy-50 last:border-0">
                  <td className="tabular px-4 py-1.5 text-navy-600/60">
                    {item.lineNo ?? item.row}
                  </td>
                  <td className="max-w-md truncate py-1.5 text-navy-800" title={item.desc}>
                    {item.desc || <span className="text-navy-300">—</span>}
                  </td>
                  <td className="py-1.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        inBase
                          ? "bg-navy-100 text-navy-700"
                          : "bg-navy-50 text-navy-600/60"
                      }`}
                    >
                      {item.coverage}
                    </span>
                  </td>
                  <td className="tabular py-1.5 text-right text-navy-600/80">
                    {num(item.qty)}
                  </td>
                  <td
                    className={`tabular px-4 py-1.5 text-right ${
                      item[basis] < 0 ? "text-brand-red" : "text-navy-800"
                    }`}
                  >
                    {money(item[basis])}
                  </td>
                </tr>
              );
            })}
            {!shown.length && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-navy-600/60">
                  No line items match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {filtered.length > shown.length && (
          <div className="no-print border-t border-navy-50 px-4 py-3 text-center">
            <button
              type="button"
              onClick={() => setLimit((n) => n + PAGE)}
              className="rounded-md border border-navy-200 px-3 py-1.5 text-xs font-medium text-navy-700 hover:bg-navy-50"
            >
              Show {Math.min(PAGE, filtered.length - shown.length)} more
            </button>
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between border-t-2 border-navy-200 bg-navy-50 px-4 py-2.5">
        <span className="text-xs font-semibold tracking-wide text-navy-800 uppercase">
          Total shown
        </span>
        <span className="tabular text-sm font-bold text-navy-800">{money(total)}</span>
      </footer>
    </section>
  );
}
