"use client";

import { useMemo, useState } from "react";
import { groupAmount } from "@/lib/award";
import { coverageLabel, totalOf } from "@/lib/extract";
import { money, num } from "@/lib/format";
import type { Extraction } from "@/lib/extract";
import type { AmountBasis, GroupTotal } from "@/lib/types";

type View = "lines" | "totals";

interface Props {
  extraction: Extraction;
  basis: AmountBasis;
}

const PAGE = 100;

export default function PreviewPanel({ extraction, basis }: Props) {
  const [view, setView] = useState<View>("lines");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return extraction.items;
    return extraction.items.filter(
      (i) =>
        i.desc.toLowerCase().includes(q) ||
        i.groupDesc.toLowerCase().includes(q) ||
        i.groupCode.toLowerCase().includes(q) ||
        i.coverage.toLowerCase().includes(q),
    );
  }, [extraction.items, query]);

  const grandTotal = totalOf(extraction.items, basis);

  return (
    <section className="rounded-xl border border-navy-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-navy-800 uppercase">
            Preview
          </h2>
          <p className="mt-0.5 text-xs text-navy-600/70">
            {extraction.keptCoverages.join(" + ") || "no coverages selected"} &middot;{" "}
            {extraction.keptCount} line{extraction.keptCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="no-print flex items-center gap-2">
          <div role="group" aria-label="Preview view" className="flex rounded-md border border-navy-200 p-0.5">
            {(
              [
                ["lines", "Line items"],
                ["totals", "Totals"],
              ] as [View, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                aria-pressed={view === key}
                className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                  view === key ? "bg-navy-700 text-white" : "text-navy-600 hover:bg-navy-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {view === "lines" && (
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE);
              }}
              placeholder="Filter…"
              aria-label="Filter extracted line items"
              className="w-40 rounded-md border border-navy-200 px-2.5 py-1.5 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
            />
          )}
        </div>
      </header>

      {extraction.keptCount === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-navy-600/70">
          Nothing extracted. Go back to <strong>Extract</strong> and tick the coverages
          that carry this job&rsquo;s scope.
        </p>
      ) : view === "lines" ? (
        <LinesView
          items={filtered}
          basis={basis}
          limit={limit}
          onMore={() => setLimit((n) => n + PAGE)}
          total={totalOf(filtered, basis)}
        />
      ) : (
        <TotalsView
          breakdown={extraction.breakdown}
          groups={extraction.keptGroups}
          basis={basis}
          grandTotal={grandTotal}
          label={coverageLabel(extraction.keptCoverages)}
        />
      )}
    </section>
  );
}

function LinesView({
  items,
  basis,
  limit,
  onMore,
  total,
}: {
  items: Extraction["items"];
  basis: AmountBasis;
  limit: number;
  onMore: () => void;
  total: number;
}) {
  const shown = items.slice(0, limit);
  return (
    <>
      <div className="max-h-[30rem] overflow-auto print-full">
        <table className="w-full min-w-[42rem] text-sm">
          <thead className="sticky top-0 z-10 bg-navy-50 text-xs tracking-wide text-navy-600/80 uppercase">
            <tr>
              <th scope="col" className="px-4 py-2 text-left font-semibold">#</th>
              <th scope="col" className="py-2 text-left font-semibold">Group</th>
              <th scope="col" className="py-2 text-left font-semibold">Description</th>
              <th scope="col" className="py-2 text-left font-semibold">Coverage</th>
              <th scope="col" className="py-2 text-right font-semibold">Qty</th>
              <th scope="col" className="py-2 text-right font-semibold">Unit Cost</th>
              <th scope="col" className="px-4 py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((item, i) => (
              <tr key={item.row} className="border-b border-navy-50 last:border-0">
                <td className="tabular px-4 py-1.5 text-navy-600/60">{i + 1}</td>
                <td
                  className="max-w-[10rem] truncate py-1.5 text-navy-600"
                  title={item.groupDesc}
                >
                  {item.groupDesc || item.groupCode}
                </td>
                <td className="max-w-sm truncate py-1.5 text-navy-800" title={item.desc}>
                  {item.desc || <span className="text-navy-300">&mdash;</span>}
                </td>
                <td className="py-1.5">
                  <span className="rounded bg-navy-100 px-1.5 py-0.5 text-xs font-medium text-navy-700">
                    {item.coverage}
                  </span>
                </td>
                <td className="tabular py-1.5 text-right text-navy-600/80">
                  {num(item.qty)}
                </td>
                <td className="tabular py-1.5 text-right text-navy-600/80">
                  {money(item.unitCost)}
                </td>
                <td
                  className={`tabular px-4 py-1.5 text-right font-medium ${
                    item[basis] < 0 ? "text-brand-red" : "text-navy-800"
                  }`}
                >
                  {money(item[basis])}
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-navy-600/60">
                  No lines match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {items.length > shown.length && (
          <div className="no-print border-t border-navy-50 px-4 py-3 text-center">
            <button
              type="button"
              onClick={onMore}
              className="rounded-md border border-navy-200 px-3 py-1.5 text-xs font-medium text-navy-700 hover:bg-navy-50"
            >
              Show {Math.min(PAGE, items.length - shown.length)} more
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
    </>
  );
}

function TotalsView({
  breakdown,
  groups,
  basis,
  grandTotal,
  label,
}: {
  breakdown: GroupTotal[];
  groups: Extraction["keptGroups"];
  basis: AmountBasis;
  grandTotal: number;
  label: string;
}) {
  return (
    <div className="overflow-auto print-full">
      <table className="w-full text-sm">
        <thead className="bg-navy-50 text-xs tracking-wide text-navy-600/80 uppercase">
          <tr>
            <th scope="col" className="px-4 py-2 text-left font-semibold">Coverage</th>
            <th scope="col" className="py-2 text-left font-semibold">Group</th>
            <th scope="col" className="py-2 text-right font-semibold">Lines</th>
            <th scope="col" className="px-4 py-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        {groups.map((group) => {
          const rows = breakdown.filter((b) => b.coverage === group.coverage);
          return (
            <tbody key={group.coverage} className="border-b-2 border-navy-100">
              {rows.map((row, i) => (
                <tr key={row.groupDesc} className="border-b border-navy-50">
                  <td className="px-4 py-1.5 align-top">
                    {i === 0 && (
                      <span className="font-semibold text-navy-800">{row.coverage}</span>
                    )}
                  </td>
                  <td className="py-1.5 text-navy-700">{row.groupDesc}</td>
                  <td className="tabular py-1.5 text-right text-navy-600/80">
                    {row.count}
                  </td>
                  <td className="tabular px-4 py-1.5 text-right text-navy-800">
                    {money(row[basis])}
                  </td>
                </tr>
              ))}
              <tr className="bg-navy-50/70">
                <td />
                <td className="py-1.5 text-xs font-semibold tracking-wide text-navy-700 uppercase">
                  {group.coverage} subtotal
                </td>
                <td className="tabular py-1.5 text-right text-xs font-semibold text-navy-700">
                  {group.count}
                </td>
                <td className="tabular px-4 py-1.5 text-right font-bold text-navy-800">
                  {money(groupAmount(group, basis))}
                </td>
              </tr>
            </tbody>
          );
        })}
        <tfoot>
          <tr className="border-t-2 border-navy-700 bg-navy-800">
            <td
              colSpan={3}
              className="px-4 py-3 text-sm font-bold tracking-wide text-white uppercase"
            >
              {label} total
            </td>
            <td className="tabular px-4 py-3 text-right text-lg font-bold text-white">
              {money(grandTotal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
