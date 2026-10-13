"use client";

import { useState } from "react";
import { money } from "@/lib/format";
import { rememberKey, storedKey } from "@/lib/send-key";

/**
 * Paying part of a milestone early.
 *
 * Takes money out of a milestone that has not been billed yet and puts it on
 * a bill of its own, so it can be released and paid now. The contract does not
 * move: the two lines together are what the one line was.
 *
 * Three steps on purpose — type the amount, read what it would do, then apply.
 * It is the only control on Vendor status that writes, and it rewrites two
 * billing lines at once, so the figures are shown before anything happens
 * rather than after.
 */


interface Milestone {
  recordId: number;
  title: string;
  amount: number;
  /** Already resolved from both of Quickbase's paid markers, on the server. */
  settled: boolean;
}

interface Plan {
  problem: string | null;
  from: {
    title: string;
    amountBefore: number;
    amountAfter: number;
    pctBefore: number;
    pctAfter: number;
  };
  bill: { title: string; amount: number; pct: number };
}

export default function AdvancePayment({
  milestone,
  onApplied,
}: {
  milestone: Milestone;
  onApplied: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendKey, setSendKey] = useState("");
  const [keyNeeded, setKeyNeeded] = useState(false);

  /*
   * A settled milestone has nothing left to advance, and a worthless one has
   * nothing to take. Quickbase records paid-ness two ways that disagree, so
   * the reading is done once on the server and carried here rather than
   * repeated — the button must not appear on a line the server would refuse.
   */
  if (milestone.settled || milestone.amount <= 0) return null;

  function reset() {
    setPlan(null);
    setError(null);
  }

  async function workItOut() {
    setBusy(true);
    reset();
    try {
      const res = await fetch("/api/qb/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billRecordId: milestone.recordId, advance: Number(amount) }),
      });
      const body = await res.json();
      if (!body.ok) {
        setError(body.error ?? "Could not work the advance out.");
        return;
      }
      if (body.plan?.problem) {
        setError(body.plan.problem);
        return;
      }
      setPlan(body.plan);
    } catch {
      setError("Could not reach Quickbase.");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setApplying(true);
    setError(null);
    try {
      // Typing one anywhere is the last time any screen asks for it.
      if (sendKey.trim()) rememberKey(sendKey);
      const key = sendKey.trim() || storedKey();
      const res = await fetch("/api/qb/advance", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(key ? { "x-send-key": key } : {}),
        },
        body: JSON.stringify({ billRecordId: milestone.recordId, advance: Number(amount) }),
      });
      const body = await res.json();
      if (!body.ok) {
        if (body.keyRequired) setKeyNeeded(true);
        setError(body.error ?? "The advance could not be applied.");
        return;
      }
      if (key) {
      }
      setOpen(false);
      setAmount("");
      setPlan(null);
      onApplied();
    } catch {
      setError("Could not reach Quickbase. Check the milestone before trying again.");
    } finally {
      setApplying(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Pay part of ${milestone.title} early`}
        className="rounded border border-navy-200 px-1.5 py-0.5 text-xs font-medium text-navy-700 transition hover:border-navy-400 hover:bg-white"
      >
        Advance
      </button>
    );
  }

  return (
    <div className="mt-1 mb-1 rounded-lg border border-navy-300 bg-white p-2.5 text-left">
      <p className="mb-2 text-xs leading-relaxed text-navy-700">
        Take an advance out of <strong>{milestone.title}</strong>, worth{" "}
        <span className="tabular">{money(milestone.amount)}</span>. It becomes a bill
        of its own; the contract does not change.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-navy-700">Amount</span>
          <input
            type="number"
            min="0"
            step="0.01"
            max={milestone.amount}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              reset();
            }}
            className="tabular w-32 rounded-md border border-navy-200 px-2 py-1 text-sm focus:border-navy-500 focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={workItOut}
          disabled={busy || !Number(amount)}
          className="rounded-md bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-navy-800 disabled:cursor-not-allowed disabled:bg-navy-200 disabled:text-navy-600/60"
        >
          {busy ? "Working it out…" : "Work it out"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setAmount("");
            reset();
          }}
          className="text-xs text-navy-600/70 underline underline-offset-2 hover:text-navy-800"
        >
          Cancel
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-2 rounded border border-brand-red/30 bg-brand-red-50 px-2 py-1.5 text-xs leading-relaxed text-brand-red-dark"
        >
          {error}
        </p>
      ) : null}

      {plan && !plan.problem ? (
        <div className="mt-2 rounded border border-navy-200 bg-navy-50/70 px-2.5 py-2">
          <table className="w-full text-xs">
            <tbody>
              <tr>
                <td className="py-0.5 pr-3 text-navy-700">{plan.from.title}</td>
                <td className="tabular py-0.5 pr-2 text-right text-navy-600/70">
                  {money(plan.from.amountBefore)}
                </td>
                <td className="py-0.5 pr-2 text-center text-navy-600/50">→</td>
                <td className="tabular py-0.5 text-right font-medium text-navy-800">
                  {money(plan.from.amountAfter)}
                </td>
                <td className="tabular py-0.5 pl-2 text-right text-navy-600/70">
                  {plan.from.pctAfter}%
                </td>
              </tr>
              <tr className="border-t border-navy-200">
                <td className="py-0.5 pr-3 text-navy-700">{plan.bill.title}</td>
                <td className="tabular py-0.5 pr-2 text-right text-navy-600/50">new</td>
                <td />
                <td className="tabular py-0.5 text-right font-medium text-navy-800">
                  {money(plan.bill.amount)}
                </td>
                <td className="tabular py-0.5 pl-2 text-right text-navy-600/70">
                  {plan.bill.pct}%
                </td>
              </tr>
            </tbody>
          </table>
          {plan.from.amountAfter === 0 ? (
            <p className="mt-1.5 text-xs text-navy-600/70">
              This advances the whole milestone, so it stays on the schedule at $0.00
              and the advance carries its full share.
            </p>
          ) : null}

          {keyNeeded ? (
            <label className="mt-2 block">
              <span className="mb-1 block text-xs font-medium text-navy-700">Send key</span>
              <input
                type="password"
                value={sendKey}
                onChange={(e) => setSendKey(e.target.value)}
                className="w-56 rounded-md border border-navy-200 px-2 py-1 text-sm focus:border-navy-500 focus:outline-none"
              />
            </label>
          ) : null}

          <button
            type="button"
            onClick={apply}
            disabled={applying}
            className="mt-2 rounded-md bg-brand-red px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-red-dark disabled:cursor-not-allowed disabled:bg-navy-200 disabled:text-navy-600/60"
          >
            {applying ? "Applying…" : "Apply the advance"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
