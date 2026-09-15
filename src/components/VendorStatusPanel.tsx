"use client";

import { useState } from "react";
import LookupField from "./LookupField";
import { money, pct as fmtPct } from "@/lib/format";
import { loadSubs } from "@/lib/qb-client";
import type { PoOption } from "@/lib/bills";
import { regionFor, type RegionKey } from "@/lib/regions";

/**
 * What a subcontractor is owed and what they have been paid.
 *
 * Read-only, and deliberately so: every figure here is computed by Quickbase —
 * Total Amount Paid rolls up the bills, Total Paid Bill % divides it by the
 * builder cost, and the status is a formula over that. Writing any of them
 * from here would put a number on screen that Quickbase would disagree with
 * the moment a bill changed.
 */
export default function VendorStatusPanel({ region }: { region: RegionKey }) {
  const cfg = regionFor(region);

  const [sub, setSub] = useState("");
  const [pos, setPos] = useState<PoOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickSub(recordId: string) {
    setPos(null);
    setError(null);
    if (!recordId) return;

    setLoading(true);
    try {
      const res = await fetch(
        `/api/qb/bills?resource=pos&region=${region}&sub=${encodeURIComponent(recordId)}`,
      );
      const body = await res.json();
      if (!body.ok) {
        setError(body.error ?? "Could not load purchase orders.");
        return;
      }
      setPos(body.items ?? []);
    } catch {
      setError("Could not reach the server to load purchase orders.");
    } finally {
      setLoading(false);
    }
  }

  const totals = (pos ?? []).reduce(
    (acc, p) => ({
      contract: acc.contract + (p.contractPrice || p.totalCost),
      paid: acc.paid + p.totalAmountPaid,
    }),
    { contract: 0, paid: 0 },
  );

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-navy-200 bg-white shadow-sm">
        <header className="border-b border-navy-100 px-4 py-3">
          <h2 className="text-sm font-semibold tracking-wide text-navy-800 uppercase">
            Vendor status
          </h2>
          <p className="mt-0.5 text-xs text-navy-600/70">
            Every {cfg.label} purchase order for a subcontractor, and what has
            been paid against it.
          </p>
        </header>
        <div className="p-4 sm:max-w-md">
          <LookupField
            label={cfg.awardEligibleOnly ? "Subcontractor (award-eligible)" : "Subcontractor"}
            value={sub}
            placeholder="Company name"
            onChange={(v, extra) => {
              setSub(v);
              void pickSub(extra?.recordId ?? "");
            }}
            loadChoices={async () => {
              const r = await loadSubs(region);
              return {
                configured: r.configured,
                warning: r.warning,
                error: r.error,
                choices: r.items.map((s) => ({
                  id: s.id,
                  label: s.company,
                  hint: [s.trade, s.email].filter(Boolean).join("  ·  "),
                  extra: { recordId: s.id },
                })),
              };
            }}
          />
        </div>
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-brand-red/30 bg-brand-red/5 px-4 py-3 text-sm font-medium text-brand-red"
        >
          {error}
        </p>
      )}

      {loading && (
        <p className="rounded-xl border border-navy-200 bg-white px-4 py-3 text-sm text-navy-600/70">
          Loading purchase orders…
        </p>
      )}

      {pos && !loading && (
        <section className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-brand-red bg-navy-700 px-4 py-3">
            <h2 className="text-sm font-semibold tracking-wide text-white uppercase">
              {pos.length} purchase order{pos.length === 1 ? "" : "s"}
            </h2>
            <p className="text-xs text-navy-200">
              {money(totals.paid)} paid of {money(totals.contract)}
            </p>
          </header>

          {pos.length === 0 ? (
            <p className="px-4 py-4 text-sm text-navy-700">
              This subcontractor has no billable {cfg.label} purchase orders.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[42rem] text-sm">
                <thead>
                  <tr className="border-b border-navy-100 bg-navy-100/60 text-xs tracking-wide text-navy-700 uppercase">
                    <th scope="col" className="px-4 py-2 text-left font-semibold">
                      PO
                    </th>
                    <th scope="col" className="py-2 text-left font-semibold">
                      Job
                    </th>
                    <th scope="col" className="py-2 text-right font-semibold">
                      Contract
                    </th>
                    <th scope="col" className="py-2 text-right font-semibold">
                      Paid
                    </th>
                    <th scope="col" className="py-2 text-right font-semibold">
                      %
                    </th>
                    <th scope="col" className="px-4 py-2 text-left font-semibold">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pos.map((p) => {
                    const contract = p.contractPrice || p.totalCost;
                    const paidPct = p.totalPaidPct * 100;
                    return (
                      <tr key={p.recordId} className="border-b border-navy-50 last:border-0">
                        <td className="px-4 py-2 font-medium text-navy-800">
                          {p.poNumber || `#${p.recordId}`}
                        </td>
                        <td className="py-2 text-navy-700">
                          {p.jobName || p.title || "—"}
                        </td>
                        <td className="tabular py-2 text-right text-navy-800">
                          {contract > 0 ? money(contract) : "—"}
                        </td>
                        <td className="tabular py-2 text-right text-navy-800">
                          {money(p.totalAmountPaid)}
                        </td>
                        <td className="tabular py-2 text-right text-navy-600/80">
                          {p.totalPaidPct > 0 ? fmtPct(Math.round(paidPct * 100) / 100) : "—"}
                        </td>
                        <td className="px-4 py-2">
                          <Pill status={p.billingStatus} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="border-t border-navy-100 px-4 py-2 text-xs text-navy-600/70">
            Read-only. Quickbase computes the paid figures from the bills, so
            they change when a bill does, not when this screen is opened.
          </p>
        </section>
      )}
    </div>
  );
}

/** Status as a coloured pill, so it reads at a glance rather than as text. */
function Pill({ status }: { status: string }) {
  const s = status.trim() || "No Payment";
  const tone = /^paid$/i.test(s)
    ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
    : /partial/i.test(s)
      ? "bg-amber-50 text-amber-700 ring-amber-600/20"
      : "bg-navy-50 text-navy-600 ring-navy-600/15";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${tone}`}
    >
      {s}
    </span>
  );
}
