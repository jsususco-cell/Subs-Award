"use client";

import NumberField from "./NumberField";
import { money, pct } from "@/lib/format";
import type { AwardResult, CoverageGroup } from "@/lib/types";

interface Props {
  result: AwardResult;
  oandpPct: number;
  tiers: number[];
  selectedTier: number;
  baseCount: number;
  hcGroup: CoverageGroup | null;
  hcGroupAmount: number;
  onOandP: (v: number) => void;
  onTier: (index: number, v: number) => void;
  onSelectTier: (index: number) => void;
  onAddTier: () => void;
  onRemoveTier: (index: number) => void;
  onHc: (v: number) => void;
}

export default function SummaryPanel({
  result,
  oandpPct,
  tiers,
  selectedTier,
  baseCount,
  hcGroup,
  hcGroupAmount,
  onOandP,
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
      <header className="bg-navy-700 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-wide text-white uppercase">
          Award calculation
        </h2>
      </header>

      <dl className="divide-y divide-navy-50">
        <Row
          label="Demo/Site"
          note={`Total of ${baseCount} coverage group${baseCount === 1 ? "" : "s"}`}
          value={money(result.base)}
        />

        <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3">
          <div>
            <dt className="text-sm font-medium text-navy-800">Less O&amp;P</dt>
            <dd className="mt-1 flex items-center gap-2">
              <div className="no-print w-24">
                <NumberField
                  ariaLabel="Overhead and profit percentage"
                  value={oandpPct}
                  onChange={onOandP}
                  suffix="%"
                />
              </div>
              <span className="text-xs text-navy-600/70">
                base ÷ {divisor.toFixed(2)}
              </span>
            </dd>
          </div>
          <span className="tabular self-start pt-0.5 text-right text-base font-semibold text-navy-800">
            {money(result.lessOandP)}
          </span>
        </div>

        <div className="bg-navy-50/40 px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wide text-navy-600/80 uppercase">
              Percentage of ex-O&amp;P
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
                  row.selected ? "bg-white ring-1 ring-navy-300" : "hover:bg-white/60"
                }`}
              >
                <input
                  type="radio"
                  name="award-tier"
                  checked={row.selected}
                  onChange={() => onSelectTier(i)}
                  aria-label={`Use the ${pct(row.pct)} tier for the award`}
                  className="h-4 w-4 shrink-0 accent-[var(--color-brand-red)]"
                />
                <div className="no-print w-20 shrink-0">
                  <NumberField
                    ariaLabel={`Tier ${i + 1} percentage`}
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
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3">
          <div>
            <dt className="text-sm font-medium text-navy-800">HC</dt>
            <dd className="mt-1 text-xs text-navy-600/70">
              Hard-cost allowance, entered directly
              {hcGroup && (
                <>
                  {" · "}
                  <button
                    type="button"
                    onClick={() => onHc(hcGroupAmount)}
                    className="no-print font-medium text-navy-600 underline underline-offset-2 hover:text-brand-red"
                  >
                    use {hcGroup.coverage} ({money(hcGroupAmount)})
                  </button>
                </>
              )}
            </dd>
          </div>
          <div className="w-40">
            <NumberField ariaLabel="Hard cost amount" value={result.hc} onChange={onHc} prefix="$" />
          </div>
        </div>
      </dl>

      <div className="flex items-center justify-between gap-3 border-t-2 border-navy-700 bg-navy-800 px-4 py-4">
        <div>
          <p className="text-sm font-bold tracking-wide text-white uppercase">Award</p>
          <p className="mt-0.5 text-xs text-navy-200">
            {chosen ? `HC + ${pct(chosen.pct)} tier` : "HC only — no tier selected"}
          </p>
        </div>
        <p className="tabular text-2xl font-bold text-white">{money(result.award)}</p>
      </div>
    </section>
  );
}

function Row({
  label,
  note,
  value,
}: {
  label: string;
  note: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3">
      <div>
        <dt className="text-sm font-medium text-navy-800">{label}</dt>
        <dd className="mt-0.5 text-xs text-navy-600/70">{note}</dd>
      </div>
      <span className="tabular text-right text-base font-semibold text-navy-800">
        {value}
      </span>
    </div>
  );
}
