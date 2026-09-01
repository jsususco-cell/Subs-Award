"use client";

import { useMemo, useState } from "react";
import { groupAmount, isDemoSite } from "@/lib/award";
import { coverageLabel } from "@/lib/extract";
import { money, pct } from "@/lib/format";
import type { Extraction } from "@/lib/extract";
import type { AmountBasis } from "@/lib/types";

interface Props {
  extraction: Extraction;
  basis: AmountBasis;
  onToggle: (coverage: string) => void;
  onSet: (coverages: string[]) => void;
}

export default function ExtractPanel({
  extraction,
  basis,
  onToggle,
  onSet,
}: Props) {
  const [query, setQuery] = useState("");
  const kept = useMemo(() => new Set(extraction.keptCoverages), [extraction.keptCoverages]);

  const all = extraction.allCoverages;
  const demoSite = all.filter((g) => isDemoSite(g.coverage)).map((g) => g.coverage);
  const total = extraction.keptGroups.reduce((sum, g) => sum + groupAmount(g, basis), 0);
  const fileTotal = all.reduce((sum, g) => sum + Math.abs(groupAmount(g, basis)), 0);

  const visible = query.trim()
    ? all.filter((g) => g.coverage.toLowerCase().includes(query.trim().toLowerCase()))
    : all;

  const allOn = all.length > 0 && kept.size === all.length;
  const label = coverageLabel(extraction.keptCoverages);

  return (
    <section className="rounded-xl border border-navy-200 bg-white shadow-sm">
      <header className="border-b border-navy-100 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-wide text-navy-800 uppercase">
              Choose coverages
            </h2>
            <p className="mt-0.5 text-xs text-navy-600/70">
              Whatever you tick becomes the base for the award.{" "}
              {extraction.rawCount} raw lines &middot;{" "}
              <strong className="text-navy-800">{extraction.keptCount} kept</strong>{" "}
              &middot; {extraction.droppedCount} filtered out
            </p>
          </div>
          <span className="rounded-md border border-navy-200 px-2.5 py-1 text-xs font-medium text-navy-600">
            Amounts are RCV
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-navy-600/70">Quick pick</span>
          <Chip onClick={() => onSet(all.map((g) => g.coverage))} active={allOn}>
            All ({all.length})
          </Chip>
          <Chip onClick={() => onSet([])} active={kept.size === 0}>
            None
          </Chip>
          {demoSite.length > 0 && (
            <Chip
              onClick={() => onSet(demoSite)}
              active={
                kept.size === demoSite.length && demoSite.every((c) => kept.has(c))
              }
            >
              Demo/Site ({demoSite.length})
            </Chip>
          )}
          {all.length > 6 && (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a coverage…"
              aria-label="Filter the coverage list"
              className="ml-auto w-44 rounded-md border border-navy-200 px-2.5 py-1 text-xs outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
            />
          )}
        </div>
      </header>

      {extraction.missingCoverages.length > 0 && (
        <p className="border-b border-navy-100 bg-navy-50 px-4 py-2.5 text-xs text-navy-700">
          This file has no {extraction.missingCoverages.join(" or ")} lines, so the
          Demo/Site preset does not fully apply. Pick whichever coverages carry this
          job&rsquo;s scope.
        </p>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-navy-100 text-xs tracking-wide text-navy-600/80 uppercase">
            <th scope="col" className="w-10 px-4 py-2">
              <input
                type="checkbox"
                aria-label="Select every coverage"
                checked={allOn}
                onChange={(e) => onSet(e.target.checked ? all.map((g) => g.coverage) : [])}
                className="h-4 w-4 accent-[var(--color-navy-700)]"
              />
            </th>
            <th scope="col" className="py-2 text-left font-semibold">
              Coverage
            </th>
            <th scope="col" className="py-2 text-right font-semibold">
              Lines
            </th>
            <th scope="col" className="py-2 text-right font-semibold">
              Share
            </th>
            <th scope="col" className="px-4 py-2 text-right font-semibold">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((g) => {
            const on = kept.has(g.coverage);
            const amount = groupAmount(g, basis);
            const share = fileTotal ? (Math.abs(amount) / fileTotal) * 100 : 0;
            return (
              <tr
                key={g.coverage}
                className={`border-b border-navy-50 last:border-0 ${on ? "bg-navy-50/60" : ""}`}
              >
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => onToggle(g.coverage)}
                    aria-label={`Include ${g.coverage} in the base`}
                    className="h-4 w-4 accent-[var(--color-navy-700)]"
                  />
                </td>
                <td className="py-2">
                  <span
                    className={`font-medium ${on ? "text-navy-800" : "text-navy-600"}`}
                  >
                    {g.coverage}
                  </span>
                  {isDemoSite(g.coverage) && (
                    <span className="ml-2 rounded bg-brand-red/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-brand-red uppercase">
                      Demo/Site
                    </span>
                  )}
                </td>
                <td className="tabular py-2 text-right text-navy-600/80">{g.count}</td>
                <td className="py-2 pr-2">
                  <span className="flex items-center justify-end gap-2">
                    <span
                      aria-hidden
                      className="h-1.5 w-16 overflow-hidden rounded-full bg-navy-100"
                    >
                      <span
                        className={`block h-full rounded-full ${on ? "bg-navy-600" : "bg-navy-300"}`}
                        style={{ width: `${Math.min(100, share)}%` }}
                      />
                    </span>
                    <span className="tabular w-10 text-right text-xs text-navy-600/70">
                      {share < 0.5 ? "<1%" : pct(Math.round(share))}
                    </span>
                  </span>
                </td>
                <td
                  className={`tabular px-4 py-2 text-right ${
                    on ? "font-semibold text-navy-800" : "text-navy-600/80"
                  }`}
                >
                  {money(amount)}
                </td>
              </tr>
            );
          })}
          {!visible.length && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-sm text-navy-600/60">
                No coverage matches &ldquo;{query}&rdquo;.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-navy-200 bg-navy-50">
            <td />
            <td className="py-2.5 text-xs font-semibold tracking-wide text-navy-800 uppercase">
              {label}
            </td>
            <td className="tabular py-2.5 text-right text-xs font-semibold text-navy-800">
              {extraction.keptCount}
            </td>
            <td />
            <td className="tabular px-4 py-2.5 text-right font-bold text-navy-800">
              {money(total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

function Chip({
  children,
  onClick,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
        active
          ? "border-navy-700 bg-navy-700 text-white"
          : "border-navy-200 text-navy-700 hover:border-navy-400 hover:bg-navy-50"
      }`}
    >
      {children}
    </button>
  );
}
