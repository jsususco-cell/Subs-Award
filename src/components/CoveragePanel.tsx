"use client";

import { groupAmount } from "@/lib/award";
import { money } from "@/lib/format";
import type { AmountBasis, CoverageGroup } from "@/lib/types";

const BASES: { key: AmountBasis; label: string; hint: string }[] = [
  { key: "rcv", label: "RCV", hint: "Replacement cost value" },
  { key: "acv", label: "ACV", hint: "Actual cash value" },
  { key: "itemAmount", label: "Item Amount", hint: "Line amount before tax" },
];

interface Props {
  groups: CoverageGroup[];
  selected: string[];
  basis: AmountBasis;
  onToggle: (coverage: string) => void;
  onBasis: (basis: AmountBasis) => void;
  onSelectAll: (all: boolean) => void;
}

export default function CoveragePanel({
  groups,
  selected,
  basis,
  onToggle,
  onBasis,
  onSelectAll,
}: Props) {
  const chosen = new Set(selected);
  const base = groups
    .filter((g) => chosen.has(g.coverage))
    .reduce((sum, g) => sum + groupAmount(g, basis), 0);
  const allSelected = groups.length > 0 && chosen.size === groups.length;

  return (
    <section className="rounded-xl border border-navy-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-navy-800 uppercase">
            Coverage groups
          </h2>
          <p className="mt-0.5 text-xs text-navy-600/70">
            Ticked groups add up to the Demo/Site base.
          </p>
        </div>
        <div
          role="group"
          aria-label="Amount basis"
          className="no-print flex rounded-md border border-navy-200 p-0.5"
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
      </header>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-navy-100 text-xs tracking-wide text-navy-600/80 uppercase">
            <th scope="col" className="w-10 px-4 py-2">
              <input
                type="checkbox"
                aria-label="Select all coverage groups"
                checked={allSelected}
                onChange={(e) => onSelectAll(e.target.checked)}
                className="h-4 w-4 accent-[var(--color-navy-700)]"
              />
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
          {groups.map((g) => {
            const on = chosen.has(g.coverage);
            return (
              <tr
                key={g.coverage}
                className={`border-b border-navy-50 last:border-0 ${
                  on ? "bg-navy-50/60" : ""
                }`}
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
              Base ({selected.length} of {groups.length})
            </td>
            <td />
            <td className="tabular px-4 py-2.5 text-right font-bold text-navy-800">
              {money(base)}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
