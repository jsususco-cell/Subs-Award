"use client";

import NumberField from "./NumberField";
import { money, pct as fmtPct } from "@/lib/format";
import { breakdownTotal, type BreakdownRow } from "@/lib/qb-award";

interface Props {
  rows: BreakdownRow[];
  onRows: (rows: BreakdownRow[]) => void;
  /** What the whole subcontract is worth — what the shares are shares of. */
  contractPrice: number;
  /**
   * Already broken down elsewhere and not editable here — the line items a
   * purchase order already carries. Counted against the balance so a second
   * visit cannot allocate the same money twice.
   */
  committed?: number;
  /** Shown above the committed figure, e.g. "Already on this PO". */
  committedLabel?: string;
}

const BLANK: BreakdownRow = { desc: "", pct: 0, amount: 0 };

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * A payment breakdown entered by hand.
 *
 * Percentage and amount are two views of one number: type either and the other
 * follows from the contract price. The amount is what gets written, because
 * the money is what has to add up — a percentage rounded to two places cannot
 * always express an exact figure, and it is the figure that is owed.
 *
 * The breakdown is allowed to come to less than the contract. That is the
 * normal first pass: the rest is broken down later, against the balance shown
 * here. It is not allowed to come to more, and says so rather than clamping.
 */
export default function BreakdownEditor({
  rows,
  onRows,
  contractPrice,
  committed = 0,
  committedLabel = "Already allocated",
}: Props) {
  const entered = breakdownTotal(rows);
  const allocated = round(committed + entered);
  const balance = round(contractPrice - allocated);
  const over = balance < -0.005;

  function update(i: number, patch: Partial<BreakdownRow>) {
    onRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  /** Typing an amount restates the share; typing a share restates the amount. */
  function setAmount(i: number, amount: number) {
    update(i, {
      amount,
      pct: contractPrice > 0 ? round((amount / contractPrice) * 100) : 0,
    });
  }
  function setPct(i: number, p: number) {
    update(i, { pct: p, amount: round((contractPrice * p) / 100) });
  }

  return (
    <section className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
      <header className="border-b border-navy-100 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-wide text-navy-800 uppercase">
          Payment breakdown
        </h2>
        <p className="mt-0.5 text-xs text-navy-600/70">
          Each line becomes a PO line item. Enter an amount or a percentage —
          the other follows from the contract price.
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-navy-100 bg-navy-100/60 text-xs tracking-wide text-navy-700 uppercase">
              <th scope="col" className="w-8 px-3 py-2 text-left font-semibold">
                #
              </th>
              <th scope="col" className="py-2 text-left font-semibold">
                Description
              </th>
              <th scope="col" className="w-28 py-2 text-right font-semibold">
                %
              </th>
              <th scope="col" className="w-36 px-3 py-2 text-right font-semibold">
                Amount
              </th>
              <th scope="col" className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-navy-50 last:border-0">
                <td className="px-3 py-2 text-navy-600/60">{i + 1}</td>
                <td className="py-2">
                  <input
                    type="text"
                    aria-label={`Description for line ${i + 1}`}
                    value={row.desc}
                    onChange={(e) => update(i, { desc: e.target.value })}
                    placeholder="e.g. Mobilization"
                    className="w-full rounded border border-navy-200 px-2 py-1 text-sm outline-none focus:border-navy-600"
                  />
                </td>
                <td className="py-2">
                  <NumberField
                    value={row.pct}
                    onChange={(v) => setPct(i, v)}
                    suffix="%"
                    decimals={2}
                    ariaLabel={`Percentage for line ${i + 1}`}
                  />
                </td>
                <td className="px-3 py-2">
                  <NumberField
                    value={row.amount}
                    onChange={(v) => setAmount(i, v)}
                    prefix="$"
                    decimals={2}
                    ariaLabel={`Amount for line ${i + 1}`}
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <button
                    type="button"
                    aria-label={`Remove line ${i + 1}`}
                    onClick={() => onRows(rows.filter((_, j) => j !== i))}
                    className="rounded px-1.5 py-0.5 text-navy-400 hover:bg-navy-50 hover:text-brand-red"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-sm text-navy-600/70">
                  No lines yet. Add one for each payment this contract breaks
                  into.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-navy-100 px-4 py-2.5">
        <button
          type="button"
          onClick={() => onRows([...rows, { ...BLANK }])}
          className="rounded-md border border-navy-200 px-2.5 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50"
        >
          Add line
        </button>
        {balance > 0.005 && (
          <button
            type="button"
            onClick={() =>
              onRows([
                ...rows,
                {
                  desc: "",
                  amount: balance,
                  pct: contractPrice > 0 ? round((balance / contractPrice) * 100) : 0,
                },
              ])
            }
            className="rounded-md border border-navy-200 px-2.5 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50"
          >
            Add line for the balance ({money(balance)})
          </button>
        )}
      </div>

      <dl className="border-t-2 border-navy-200 bg-navy-50 px-4 py-3 text-sm">
        {committed > 0 && (
          <div className="flex justify-between py-0.5 text-navy-700">
            <dt>{committedLabel}</dt>
            <dd className="tabular">{money(committed)}</dd>
          </div>
        )}
        <div className="flex justify-between py-0.5 text-navy-700">
          <dt>{committed > 0 ? "Entered here" : "Allocated"}</dt>
          <dd className="tabular">{money(entered)}</dd>
        </div>
        <div className="flex justify-between border-t border-navy-200 py-1 font-semibold text-navy-800">
          <dt>Total contract price</dt>
          <dd className="tabular">{money(contractPrice)}</dd>
        </div>
        <div
          className={`flex justify-between py-0.5 font-semibold ${
            over ? "text-brand-red" : "text-navy-800"
          }`}
        >
          <dt>{over ? "Over-allocated by" : "Balance to break down"}</dt>
          <dd className="tabular">
            {money(Math.abs(balance))}
            {contractPrice > 0 && (
              <span className="ml-1 font-normal text-navy-600/70">
                ({fmtPct(
                  Math.abs(round((balance / contractPrice) * 100)),
                )})
              </span>
            )}
          </dd>
        </div>
      </dl>

      {over ? (
        <p role="alert" className="border-t border-navy-100 bg-brand-red/5 px-4 py-2 text-xs font-semibold text-brand-red">
          The breakdown comes to more than the contract. Nothing will be written
          until the lines total {money(contractPrice)} or less.
        </p>
      ) : balance > 0.005 ? (
        <p className="border-t border-navy-100 px-4 py-2 text-xs text-navy-600/70">
          {money(balance)} is not broken down yet. That is fine — the purchase
          order can be created now and the balance added later from{" "}
          <strong>Bill an existing PO</strong>.
        </p>
      ) : null}
    </section>
  );
}
