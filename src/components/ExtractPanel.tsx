"use client";

import { groupAmount, isDemoSite } from "@/lib/award";
import { money } from "@/lib/format";
import type { Extraction } from "@/lib/extract";
import type { AmountBasis } from "@/lib/types";

const BASES: { key: AmountBasis; label: string; hint: string }[] = [
  { key: "rcv", label: "RCV", hint: "Replacement cost value" },
  { key: "acv", label: "ACV", hint: "Actual cash value" },
  { key: "itemAmount", label: "Item Amount", hint: "Line amount before tax" },
];

interface Props {
  extraction: Extraction;
  basis: AmountBasis;
  onToggle: (coverage: string) => void;
  onBasis: (basis: AmountBasis) => void;
  onResetToDemoSite: () => void;
}

export default function ExtractPanel({
  extraction,
  basis,
  onToggle,
  onBasis,
  onResetToDemoSite,
}: Props) {
  const kept = new Set(extraction.keptCoverages);
  const total = extraction.keptGroups.reduce(
    (sum, g) => sum + groupAmount(g, basis),
    0,
  );

  return (
    <section className="rounded-xl border border-navy-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-navy-800 uppercase">
            Extract
          </h2>
          <p className="mt-0.5 text-xs text-navy-600/70">
            {extraction.rawCount} raw lines &middot;{" "}
            <strong className="text-navy-800">{extraction.keptCount} kept</strong>{" "}
            &middot; {extraction.droppedCount} filtered out
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onResetToDemoSite}
            className="rounded-md border border-navy-200 px-2.5 py-1.5 text-xs font-medium text-navy-700 hover:bg-navy-50"
          >
            Demo/Site only
          </button>
          <div
            role="group"
            aria-label="Amount basis"
            className="flex rounded-md border border-navy-200 p-0.5"
          >
            {BASES.map((b) => (
              <button
                key={b.key}
                type="button"
                title={b.hint}
                onClick={() => onBasis(b.key)}
                aria-pressed={basis === b.key}
                className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                  basis === b.key
                    ? "bg-navy-700 text-white"
                    : "text-navy-600 hover:bg-navy-50"
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {extraction.missingCoverages.length > 0 && (
        <p className="border-b border-navy-100 bg-brand-red-50 px-4 py-2.5 text-xs text-brand-red-dark">
          <strong>
            No {extraction.missingCoverages.join(" or ")} lines in this file.
          </strong>{" "}
          This looks like a different kind of job than a demolition scope. Tick other
          coverages below if the work sits under a different code.
        </p>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-navy-100 text-xs tracking-wide text-navy-600/80 uppercase">
            <th scope="col" className="w-10 px-4 py-2">
              <span className="sr-only">Keep</span>
            </th>
            <th scope="col" className="py-2 text-left font-semibold">
              Coverage
            </th>
            <th scope="col" className="py-2 text-right font-semibold">
              Lines
            </th>
            <th scope="col" className="px-4 py-2 text-right font-semibold">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {extraction.allCoverages.map((g) => {
            const on = kept.has(g.coverage);
            const demoSite = isDemoSite(g.coverage);
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
                    aria-label={`Keep ${g.coverage} lines`}
                    className="h-4 w-4 accent-[var(--color-navy-700)]"
                  />
                </td>
                <td className="py-2">
                  <span
                    className={`font-medium ${on ? "text-navy-800" : "text-navy-600"}`}
                  >
                    {g.coverage}
                  </span>
                  {demoSite && (
                    <span className="ml-2 rounded bg-brand-red/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-brand-red uppercase">
                      Demo/Site
                    </span>
                  )}
                </td>
                <td className="tabular py-2 text-right text-navy-600/80">{g.count}</td>
                <td
                  className={`tabular px-4 py-2 text-right ${
                    on ? "font-semibold text-navy-800" : "text-navy-600/80"
                  }`}
                >
                  {money(groupAmount(g, basis))}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-navy-200 bg-navy-50">
            <td />
            <td className="py-2.5 text-xs font-semibold tracking-wide text-navy-800 uppercase">
              Extracted total
            </td>
            <td className="tabular py-2.5 text-right text-xs font-semibold text-navy-800">
              {extraction.keptCount}
            </td>
            <td className="tabular px-4 py-2.5 text-right font-bold text-navy-800">
              {money(total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
