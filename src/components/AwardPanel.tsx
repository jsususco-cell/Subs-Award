"use client";

import NumberField from "./NumberField";
import { money, pct } from "@/lib/format";
import type { AwardResult } from "@/lib/types";

interface Props {
  result: AwardResult;
  oandpPct: number;
  tiers: number[];
  selectedTier: number;
  baseCount: number;
  /** What the selected coverages are called, e.g. "Demo/Site" or "ECR". */
  baseLabel: string;
  onOandP: (v: number) => void;
  onLessOandP: (v: number) => void;
  onResetLessOandP: () => void;
  onTier: (index: number, v: number) => void;
  onSelectTier: (index: number) => void;
  onAddTier: () => void;
  onRemoveTier: (index: number) => void;
  onHc: (v: number) => void;
}

export default function AwardPanel({
  result,
  oandpPct,
  tiers,
  selectedTier,
  baseCount,
  baseLabel,
  onOandP,
  onLessOandP,
  onResetLessOandP,
  onTier,
  onSelectTier,
  onAddTier,
  onRemoveTier,
  onHc,
}: Props) {
  const chosen = result.tierRows[selectedTier];
  const divisor = 1 + oandpPct / 100;

  return (
    <section className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
      <header className="border-b-2 border-brand-red bg-navy-700 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-wide text-white uppercase">
          Award calculation
        </h2>
      </header>

      <dl className="divide-y divide-navy-50">
        <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3">
          <div>
            <dt className="text-sm font-medium text-navy-800">{baseLabel}</dt>
            <dd className="mt-0.5 text-xs text-navy-600/70">
              Total of {baseCount} selected coverage{baseCount === 1 ? "" : "s"}
            </dd>
          </div>
          <span className="tabular text-right text-base font-semibold text-navy-800">
            {money(result.base)}
          </span>
        </div>

        <div className="px-4 py-3">
          <div className="grid grid-cols-[1fr_auto] items-start gap-3">
            <div>
              <dt className="text-sm font-medium text-navy-800">Less O&amp;P</dt>
              <dd className="mt-0.5 text-xs text-navy-600/70">
                {baseLabel} &divide; {divisor.toFixed(2)}
                {result.lessOandPIsManual && (
                  <>
                    {" · "}
                    <span className="font-semibold text-brand-red">manual</span>
                    {" · "}
                    <button
                      type="button"
                      onClick={onResetLessOandP}
                      className="no-print font-medium underline underline-offset-2 hover:text-brand-red"
                    >
                      reset to {money(result.derivedLessOandP)}
                    </button>
                  </>
                )}
              </dd>
            </div>
            <div className="w-40 shrink-0">
              <NumberField
                ariaLabel="Less O and P amount"
                value={result.lessOandP}
                onChange={onLessOandP}
                prefix="$"
                decimals={2}
              />
            </div>
          </div>
          <div className="no-print mt-2 flex items-center gap-2">
            <label className="text-xs text-navy-600/70" htmlFor="oandp-rate">
              O&amp;P rate
            </label>
            <div className="w-20">
              <NumberField
                ariaLabel="Overhead and profit percentage"
                value={oandpPct}
                onChange={onOandP}
                suffix="%"
              />
            </div>
          </div>
        </div>

        <div className="bg-navy-50/40 px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wide text-navy-600/80 uppercase">
              Subs %
            </span>
            <button
              type="button"
              onClick={onAddTier}
              className="no-print rounded px-1.5 py-0.5 text-xs font-medium text-navy-600 hover:bg-navy-100"
            >
              + Add
            </button>
          </div>
          <ul className="space-y-1.5">
            {result.tierRows.map((row, i) => (
              <li
                key={i}
                className={`group flex items-center gap-2 rounded-md px-2 py-1.5 transition ${
                  row.selected ? "bg-white ring-1 ring-brand-red/40" : "hover:bg-white/60"
                }`}
              >
                <input
                  type="radio"
                  name="award-tier"
                  checked={row.selected}
                  onChange={() => onSelectTier(i)}
                  aria-label={`Use the ${pct(row.pct)} subcontractor tier for the award`}
                  className="h-4 w-4 shrink-0 accent-[var(--color-brand-red)]"
                />
                <div className="no-print w-20 shrink-0">
                  <NumberField
                    ariaLabel={`Subs percentage ${i + 1}`}
                    value={tiers[i]}
                    onChange={(v) => onTier(i, v)}
                    suffix="%"
                  />
                </div>
                <span
                  className={`tabular flex-1 text-right text-sm ${
                    row.selected ? "font-bold text-navy-900" : "text-navy-600"
                  }`}
                >
                  {money(row.amount)}
                </span>
                {tiers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemoveTier(i)}
                    aria-label={`Remove the ${pct(row.pct)} tier`}
                    className="no-print rounded px-1 text-navy-300 opacity-0 transition group-hover:opacity-100 hover:bg-navy-100 hover:text-brand-red focus-visible:opacity-100"
                  >
                    &times;
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3">
          <div>
            <dt className="text-sm font-medium text-navy-800">HC</dt>
            <dd className="mt-0.5 text-xs text-navy-600/70">
              Hard-cost allowance, absolute value
            </dd>
          </div>
          <div className="w-40">
            <NumberField
              ariaLabel="Hard cost amount"
              value={result.hc}
              onChange={onHc}
              prefix="$"
              decimals={2}
            />
          </div>
        </div>
      </dl>

      <div className="flex items-center justify-between gap-3 border-t-2 border-brand-red bg-navy-800 px-4 py-4">
        <div>
          <p className="text-sm font-bold tracking-wide text-white uppercase">
            Award total
          </p>
          <p className="mt-0.5 text-xs text-navy-200">
            {chosen ? `HC + ${pct(chosen.pct)} of less O&P` : "HC only — no tier selected"}
          </p>
        </div>
        <p className="tabular text-2xl font-bold text-white">{money(result.award)}</p>
      </div>
    </section>
  );
}
