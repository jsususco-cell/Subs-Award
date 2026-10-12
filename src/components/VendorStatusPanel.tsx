"use client";

import { Fragment, useState } from "react";
import LookupField from "./LookupField";
import { money, pct as fmtPct } from "@/lib/format";
import { loadEverySub } from "@/lib/qb-client";
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
/** One billing line under a purchase order, as the schedule route returns it. */
interface Milestone {
  recordId: number;
  title: string;
  pct: number;
  amount: number;
  paid: number;
  status: string;
  datePaid: string;
}

type Branch =
  | { state: "loading" }
  | { state: "error"; error: string }
  | { state: "ready"; milestones: Milestone[] };

export default function VendorStatusPanel({ region }: { region: RegionKey }) {
  const cfg = regionFor(region);

  const [sub, setSub] = useState("");
  const [pos, setPos] = useState<PoOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /*
   * Which purchase orders are showing their schedule, and what was read for
   * each. Separate because they are separate questions: closing a branch only
   * hides it, so opening it again costs nothing. A branch that failed is kept
   * so the reason stays on screen, but is not treated as read — opening it
   * again tries once more.
   */
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [branches, setBranches] = useState<Record<number, Branch>>({});

  async function toggleSchedule(poRecordId: number) {
    const opening = !open[poRecordId];
    setOpen((o) => ({ ...o, [poRecordId]: opening }));
    if (!opening || branches[poRecordId]?.state === "ready") return;

    setBranches((b) => ({ ...b, [poRecordId]: { state: "loading" } }));
    try {
      const res = await fetch(
        `/api/qb/bills?resource=schedule&region=${region}&po=${poRecordId}`,
      );
      const body = await res.json();
      setBranches((b) => ({
        ...b,
        [poRecordId]: body.ok
          ? { state: "ready", milestones: body.milestones ?? [] }
          : { state: "error", error: body.error ?? "Could not load the schedule." },
      }));
    } catch {
      setBranches((b) => ({
        ...b,
        [poRecordId]: { state: "error", error: "Could not reach the server." },
      }));
    }
  }

  async function pickSub(recordId: string) {
    setPos(null);
    setError(null);
    // A different subcontractor means different purchase orders.
    setOpen({});
    setBranches({});
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
            region={region}
            /* Every subcontractor in the region, not the award bench — this
               screen reads what somebody already has. */
            label="Subcontractor"
            value={sub}
            placeholder="Company name"
            onChange={(v, extra) => {
              setSub(v);
              void pickSub(extra?.recordId ?? "");
            }}
            loadChoices={async () => {
              const r = await loadEverySub(region);
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
                    <th
                      scope="col"
                      className="px-4 py-2 text-left font-semibold"
                    >
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
                    <th
                      scope="col"
                      className="px-4 py-2 text-left font-semibold"
                    >
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pos.map((p) => {
                    const contract = p.contractPrice || p.totalCost;
                    const paidPct = p.totalPaidPct * 100;
                    const shown = Boolean(open[p.recordId]);
                    const branch = branches[p.recordId];
                    const label = p.poNumber || `#${p.recordId}`;
                    return (
                      <Fragment key={p.recordId}>
                        <tr
                          className={`border-b border-navy-50 last:border-0 ${
                            shown ? "bg-navy-50/50" : ""
                          }`}
                        >
                          <td className="px-4 py-2 font-medium text-navy-800">
                            <button
                              type="button"
                              onClick={() => void toggleSchedule(p.recordId)}
                              aria-expanded={shown}
                              title={
                                shown
                                  ? `Hide the schedule for ${label}`
                                  : `Show the schedule for ${label}`
                              }
                              className="-ml-1 flex items-center gap-1.5 rounded px-1 py-0.5 text-left transition hover:bg-navy-100/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-600/40"
                            >
                              <span
                                aria-hidden
                                className={`text-[0.6rem] leading-none text-navy-600/70 transition-transform ${
                                  shown ? "rotate-90" : ""
                                }`}
                              >
                                &#9654;
                              </span>
                              <span>{label}</span>
                            </button>
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
                            {p.totalPaidPct > 0
                              ? fmtPct(Math.round(paidPct * 100) / 100)
                              : "—"}
                          </td>
                          <td className="px-4 py-2">
                            <Pill status={p.billingStatus} />
                          </td>
                        </tr>
                        {shown && (
                          <tr className="border-b border-navy-50 last:border-0">
                            <td colSpan={6} className="bg-navy-50/50 px-4 pt-1 pb-3">
                              <Schedule branch={branch} contract={contract} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
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

/** The day a bill was paid, without the timestamp nobody needs. */
function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * The milestones under one purchase order.
 *
 * Indented and bordered on the left so it reads as belonging to the row above
 * rather than as another table. Every figure is the bill's own: Bill %, Bill
 * Amount, Amount Paid and Status, in the order they were raised.
 */
function Schedule({
  branch,
  contract,
}: {
  branch: Branch | undefined;
  contract: number;
}) {
  if (!branch || branch.state === "loading") {
    return (
      <p className="border-l-2 border-navy-200 pl-3 text-xs text-navy-600/70">
        Reading the schedule…
      </p>
    );
  }
  if (branch.state === "error") {
    return (
      <p className="border-l-2 border-brand-red/40 pl-3 text-xs font-medium text-brand-red">
        {branch.error}
      </p>
    );
  }
  if (branch.milestones.length === 0) {
    return (
      <p className="border-l-2 border-navy-200 pl-3 text-xs text-navy-600/70">
        Nothing has been billed against this purchase order yet.
      </p>
    );
  }

  const billed = branch.milestones.reduce((s, m) => s + m.amount, 0);
  /*
   * What is billed need not be the whole contract — a schedule is often
   * raised a draw at a time — so the remainder is said rather than implied.
   */
  const remaining = Math.round((contract - billed) * 100) / 100;

  return (
    <div className="border-l-2 border-navy-300 pl-3">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left tracking-wide text-navy-600/70 uppercase">
            <th scope="col" className="py-1 pr-3 font-semibold">
              Milestone
            </th>
            <th scope="col" className="py-1 pr-3 text-right font-semibold">
              Bill %
            </th>
            <th scope="col" className="py-1 pr-3 text-right font-semibold">
              Amount
            </th>
            <th scope="col" className="py-1 pr-3 text-right font-semibold">
              Paid
            </th>
            <th scope="col" className="py-1 font-semibold">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {branch.milestones.map((m) => (
            <tr key={m.recordId} className="border-t border-navy-100">
              <td className="py-1 pr-3 text-navy-800">{m.title || "—"}</td>
              <td className="tabular py-1 pr-3 text-right text-navy-600/80">
                {m.pct > 0 ? fmtPct(m.pct) : "—"}
              </td>
              <td className="tabular py-1 pr-3 text-right text-navy-800">
                {money(m.amount)}
              </td>
              <td className="tabular py-1 pr-3 text-right text-navy-800">
                {m.paid > 0 ? money(m.paid) : "—"}
              </td>
              <td className="py-1 whitespace-nowrap">
                <Pill status={m.status} />
                {m.datePaid ? (
                  <span className="ml-1.5 text-navy-600/60">
                    {shortDate(m.datePaid)}
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-navy-200 font-semibold text-navy-800">
            <td className="py-1 pr-3">
              {branch.milestones.length} milestone
              {branch.milestones.length === 1 ? "" : "s"}
            </td>
            <td />
            <td className="tabular py-1 pr-3 text-right">{money(billed)}</td>
            <td className="tabular py-1 pr-3 text-right">
              {money(branch.milestones.reduce((s, m) => s + m.paid, 0))}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
      {Math.abs(remaining) > 0.02 && (
        <p className="mt-1 text-xs text-navy-600/70">
          {remaining > 0
            ? `${money(remaining)} of the contract is not on the schedule yet.`
            : `The schedule is ${money(Math.abs(remaining))} above the contract.`}
        </p>
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
