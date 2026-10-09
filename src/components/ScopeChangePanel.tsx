"use client";

import { useState } from "react";
import { money } from "@/lib/format";

/**
 * A scope change, in the order somebody actually makes the decision.
 *
 * The revised contract is compared against what the case was awarded, and
 * that comparison has to be on screen and acted on before anything moves.
 * Only then does "Work out the scope change" redistribute the difference
 * across the milestones still outstanding — and even that only shows what
 * would happen. Nothing is written until the result has been read.
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

interface Award {
  poNumber: string;
  jobName: string;
  contract: number;
  billed: number;
  paid: number;
  unbilled: number;
  openCount: number;
}

export default function ScopeChangePanel() {
  const [po, setPo] = useState("");
  const [award, setAward] = useState<Award | null>(null);
  const [revised, setRevised] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const revisedNum = Number(revised.replace(/[^0-9.-]/g, ""));
  const hasRevised = revised.trim() !== "" && Number.isFinite(revisedNum);
  const delta = award && hasRevised ? Math.round((revisedNum - award.contract) * 100) / 100 : 0;

  async function loadAward() {
    setBusy(true);
    setError(null);
    setAward(null);
    setPlan(null);
    try {
      const res = await fetch(`/api/qb/scope-change?po=${encodeURIComponent(po.trim())}`);
      const body = await res.json();
      if (!body.ok) {
        setError(body.error ?? "Could not read that purchase order.");
        return;
      }
      setAward(body.schedule);
    } catch {
      setError("Could not reach Quickbase.");
    } finally {
      setBusy(false);
    }
  }

  async function workOutChange() {
    setBusy(true);
    setError(null);
    setPlan(null);
    try {
      const res = await fetch("/api/qb/scope-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poRecordId: Number(po.trim()), revisedTotal: revisedNum }),
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
    <section className="rounded-xl border border-navy-200 bg-white shadow-sm">
      <header className="border-b border-navy-100 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-wide text-navy-700 uppercase">
          Scope change
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-navy-600/70">
          Compare the revised contract against what the case was awarded. If it
          has moved, the difference is spread across the milestones still
          outstanding — what has been paid does not change.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3 px-4 py-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-navy-700">
            Purchase order (record id)
          </span>
          <input
            value={po}
            onChange={(e) => setPo(e.target.value)}
            placeholder="14107"
            className="w-40 rounded-md border border-navy-200 px-2.5 py-1.5 text-sm text-navy-800 focus:border-navy-500 focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={loadAward}
          disabled={busy || !po.trim()}
          className="rounded-md bg-navy-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-navy-800 disabled:cursor-not-allowed disabled:bg-navy-200 disabled:text-navy-600/60"
        >
          {busy && !award ? "Reading…" : "Look up the award"}
        </button>
      </div>

      {error ? (
        <p role="alert" className="mx-4 mb-3 rounded-lg border border-brand-red/30 bg-brand-red-50 px-3 py-2 text-sm text-brand-red-dark">
          {error}
        </p>
      ) : null}

      {award ? (
        <>
          <div className="border-t border-navy-100 px-4 py-3">
            <p className="text-sm font-medium text-navy-800">
              {award.poNumber} — {award.jobName}
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
              <div>
                <dt className="text-navy-600/70">Awarded contract</dt>
                <dd className="tabular font-semibold text-navy-800">{money(award.contract)}</dd>
              </div>
              <div>
                <dt className="text-navy-600/70">Billed</dt>
                <dd className="tabular text-navy-800">{money(award.billed)}</dd>
              </div>
              <div>
                <dt className="text-navy-600/70">Already paid</dt>
                <dd className="tabular text-navy-800">{money(award.paid)}</dd>
              </div>
              <div>
                <dt className="text-navy-600/70">Milestones still open</dt>
                <dd className="tabular text-navy-800">{award.openCount}</dd>
              </div>
            </dl>
            {award.unbilled > 0.02 ? (
              <p className="mt-2 text-xs text-navy-600/70">
                {money(award.unbilled)} of the contract is not on the schedule yet. A
                change lands only on the milestones that have been billed, so that
                part carries across unchanged.
              </p>
            ) : null}
          </div>

          {/* The comparison, which has to be read before anything can move. */}
          <div className="border-t border-navy-100 px-4 py-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-navy-700">
                Revised contract total
              </span>
              <input
                value={revised}
                onChange={(e) => {
                  setRevised(e.target.value);
                  setPlan(null);
                }}
                placeholder={String(award.contract)}
                inputMode="decimal"
                className="w-48 rounded-md border border-navy-200 px-2.5 py-1.5 text-sm text-navy-800 focus:border-navy-500 focus:outline-none"
              />
            </label>

            {/* Both numbers, side by side. The point of this screen is that
                nobody moves a milestone without having seen the before and
                the after together. */}
            {hasRevised ? (
              <div className="mt-3 rounded-lg border border-navy-200 bg-navy-50/60 p-3">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-xs text-navy-600/70">Previous award</div>
                    <div className="tabular mt-0.5 text-base font-semibold text-navy-800">
                      {money(award.contract)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-navy-600/70">Revised scope</div>
                    <div className="tabular mt-0.5 text-base font-semibold text-navy-800">
                      {money(Math.round((award.contract + delta) * 100) / 100)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-navy-600/70">Difference</div>
                    <div
                      className={`tabular mt-0.5 text-base font-semibold ${
                        delta > 0
                          ? "text-navy-800"
                          : delta < 0
                            ? "text-brand-red"
                            : "text-navy-600/60"
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
              </div>
            ) : null}

            <button
              type="button"
              onClick={workOutChange}
              disabled={busy || !hasRevised || delta === 0}
              className="mt-3 rounded-md bg-navy-700 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-navy-800 disabled:cursor-not-allowed disabled:bg-navy-200 disabled:text-navy-600/60"
            >
              {busy && award ? "Working it out…" : "Scope change"}
            </button>
            {!hasRevised ? (
              <p className="mt-2 text-xs text-navy-600/60">
                Enter the revised total to compare it against the award.
              </p>
            ) : null}
          </div>
        </>
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
            so {money(Math.abs(plan.delta))} is spread across{" "}
            {plan.writes.length} milestone{plan.writes.length === 1 ? "" : "s"}.
            Nothing has been written yet.
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
              <tfoot>
                <tr className="text-sm font-semibold text-navy-800">
                  <td className="py-2 pr-3">Revised schedule</td>
                  <td className="tabular py-2 pr-3 text-right">
                    {money(plan.absorption.previousTotal)}
                  </td>
                  <td className="tabular py-2 pr-3 text-right">{money(plan.delta)}</td>
                  <td className="tabular py-2 pr-3 text-right">
                    {money(
                      Math.round(
                        plan.absorption.lines.reduce((s, l) => s + l.amount, 0) * 100,
                      ) / 100,
                    )}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-3 text-xs text-navy-600/60">
            Applying this is not wired up yet — it will rewrite these bills and
            raise a change order against {plan.contractAfter ? "the purchase order" : ""}.
          </p>
        </div>
      ) : null}
    </section>
  );
}
