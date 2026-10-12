"use client";

import { useState } from "react";
import { money } from "@/lib/format";

/**
 * A scope change, recognised from the upload rather than typed in.
 *
 * When a revised scope is uploaded and awarded against a case that already
 * has a purchase order, that is the scope change: the app knows the previous
 * contract and has just worked out the new one. This shows the two side by
 * side with the difference between them, and only then offers to spread that
 * difference across the milestones still outstanding.
 *
 * Nothing here writes. Working the change out and applying it are separate
 * steps on purpose.
 */

interface Line {
  desc: string;
  pct: number;
  amount: number;
  before: number;
  took: number;
  restatedPct: number;
  locked: boolean;
}

interface Plan {
  contractBefore: number;
  contractAfter: number;
  delta: number;
  unbilled: number;
  absorption: {
    lines: Line[];
    previousTotal: number;
    lockedTotal: number;
    outstandingPct: number;
    problem: string | null;
  };
  writes: { recordId: number }[];
}

export interface ScopeChangeProps {
  /** The purchase order this case was already awarded on. */
  poRecordId: number;
  poNumber: string;
  /** What it was awarded at, from that purchase order. */
  previousTotal: number;
  /** What this upload comes to. */
  newTotal: number;
  jobName: string;
  subcontractor: string;
}

export default function ScopeChangePanel({
  poRecordId,
  poNumber,
  previousTotal,
  newTotal,
  jobName,
  subcontractor,
}: ScopeChangeProps) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const delta = Math.round((newTotal - previousTotal) * 100) / 100;

  async function workOutChange() {
    setBusy(true);
    setError(null);
    setPlan(null);
    try {
      const res = await fetch("/api/qb/scope-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poRecordId, revisedTotal: newTotal }),
      });
      const body = await res.json();
      if (!body.ok) {
        setError(body.error ?? "Could not work out the change.");
        return;
      }
      setPlan(body.plan);
    } catch {
      setError("Could not reach Quickbase.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-navy-300 bg-white shadow-sm">
      <header className="border-b border-navy-100 bg-navy-50 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-wide text-navy-700 uppercase">
          This case is already awarded
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-navy-600/80">
          {jobName} already has {poNumber} against {subcontractor}. This upload is
          a revised scope, so the difference belongs on the milestones still
          outstanding rather than on a second purchase order.
        </p>
      </header>

      {/* Both numbers, together. Nothing moves before these have been read. */}
      <div className="px-4 py-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-xs text-navy-600/70">Previous award</div>
            <div className="tabular mt-0.5 text-lg font-semibold text-navy-800">
              {money(previousTotal)}
            </div>
          </div>
          <div>
            <div className="text-xs text-navy-600/70">This upload</div>
            <div className="tabular mt-0.5 text-lg font-semibold text-navy-800">
              {money(newTotal)}
            </div>
          </div>
          <div>
            <div className="text-xs text-navy-600/70">Difference</div>
            <div
              className={`tabular mt-0.5 text-lg font-semibold ${
                delta > 0 ? "text-navy-800" : delta < 0 ? "text-brand-red" : "text-navy-600/60"
              }`}
            >
              {delta > 0 ? "+" : ""}
              {money(delta)}
            </div>
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-navy-600/80">
          {delta === 0
            ? "The revised scope is worth the same as the award. There is nothing to change."
            : `The revised scope is ${money(Math.abs(delta))} ${delta > 0 ? "higher" : "lower"} than the award.`}
        </p>

        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={workOutChange}
            disabled={busy || delta === 0}
            className="rounded-md bg-navy-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-navy-800 disabled:cursor-not-allowed disabled:bg-navy-200 disabled:text-navy-600/60"
          >
            {busy ? "Working it out…" : "Scope change"}
          </button>
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="mx-4 mb-4 rounded-lg border border-brand-red/30 bg-brand-red-50 px-3 py-2 text-sm text-brand-red-dark"
        >
          {error}
        </p>
      ) : null}

      {plan?.absorption.problem ? (
        <p className="mx-4 mb-4 rounded-lg border border-brand-red/30 bg-brand-red-50 px-3 py-2 text-sm leading-relaxed text-brand-red-dark">
          {plan.absorption.problem}
        </p>
      ) : null}

      {plan && !plan.absorption.problem ? (
        <div className="border-t border-navy-100 px-4 py-3">
          <p className="mb-2 text-xs text-navy-600/70">
            {plan.absorption.outstandingPct}% of the schedule is still outstanding,
            so {money(Math.abs(plan.delta))} is spread across {plan.writes.length}{" "}
            milestone{plan.writes.length === 1 ? "" : "s"}. Nothing has been written
            yet.
            {plan.unbilled > 0.02
              ? ` ${money(plan.unbilled)} of the contract is not on the schedule and carries across unchanged.`
              : ""}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-navy-100 text-left text-xs font-semibold tracking-wide text-navy-700 uppercase">
                  <th className="py-2 pr-3">Milestone</th>
                  <th className="py-2 pr-3 text-right">Was</th>
                  <th className="py-2 pr-3 text-right">Change</th>
                  <th className="py-2 pr-3 text-right">Becomes</th>
                  <th className="py-2 text-right">Bill %</th>
                </tr>
              </thead>
              <tbody>
                {plan.absorption.lines.map((l) => (
                  <tr key={l.desc} className="border-b border-navy-50">
                    <td className="py-1.5 pr-3 text-navy-800">
                      {l.desc}
                      {l.locked ? (
                        <span className="ml-2 text-xs text-navy-600/60">paid</span>
                      ) : null}
                    </td>
                    <td className="tabular py-1.5 pr-3 text-right text-navy-600/80">
                      {money(l.before)}
                    </td>
                    <td
                      className={`tabular py-1.5 pr-3 text-right ${
                        l.took === 0
                          ? "text-navy-600/40"
                          : l.took > 0
                            ? "text-navy-800"
                            : "text-brand-red"
                      }`}
                    >
                      {l.took === 0 ? "—" : money(l.took)}
                    </td>
                    <td className="tabular py-1.5 pr-3 text-right font-medium text-navy-800">
                      {money(l.amount)}
                    </td>
                    <td className="tabular py-1.5 text-right text-navy-600/80">
                      {l.restatedPct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-navy-600/60">
            Applying this is not wired up yet. It will rewrite these bills and
            raise a change order against {poNumber}.
          </p>
        </div>
      ) : null}
    </section>
  );
}
