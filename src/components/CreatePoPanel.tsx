"use client";

import { useState } from "react";
import { money, pct } from "@/lib/format";
import { planAward, type AwardWriteInput } from "@/lib/qb-award";
import { defaultBody, defaultSubject } from "@/lib/letter-email";
import type { LetterInput } from "@/lib/letter";

const PO_STATUSES = ["Unreleased", "Released", "Approved"];
const EXPENSE_CLASSES = ["PO", "Non-PO"];

export interface CreatePoResult {
  poRecordId: number;
  costItemRecordId: number;
  billCount: number;
  /** Who the award letter reached, when it went out with the records. */
  letterSentTo?: string[];
  /** Why it did not, when the records were created anyway. */
  letterError?: string;
}

interface Props {
  /** Quickbase record ids, only known when picked from the lookups. */
  jobRecordId: string;
  subRecordId: string;
  jobName: string;
  subcontractor: string;
  scopeOfWork: string;
  jobType: string;
  award: number;
  demoTotal: number;
  siteTotal: number;
  /** Zero unless ADA was ticked on the award step. */
  ada: number;
  /** Set once an award has been written, so it cannot be created twice. */
  created: CreatePoResult | null;
  onCreated: (result: CreatePoResult) => void;
  /** The letter that goes out with the records, if sending is left on. */
  letter: LetterInput;
  /** Prefilled from the subcontractor's Quickbase record, when there is one. */
  suggestedTo: string;
}

type Stage = "idle" | "confirming" | "working";

const KEY_STORE = "subs-award:send-key";

function storedKey(): string {
  try {
    return localStorage.getItem(KEY_STORE) ?? "";
  } catch {
    return "";
  }
}

export default function CreatePoPanel({
  jobRecordId,
  subRecordId,
  jobName,
  subcontractor,
  scopeOfWork,
  jobType,
  award,
  demoTotal,
  siteTotal,
  ada,
  created,
  onCreated,
  letter,
  suggestedTo,
}: Props) {
  const [title, setTitle] = useState("");
  const [poStatus, setPoStatus] = useState(PO_STATUSES[0]);
  const [expenseClass, setExpenseClass] = useState(EXPENSE_CLASSES[0]);
  const [lienWaiver, setLienWaiver] = useState(true);
  const [dueDate, setDueDate] = useState("");
  const [createBills, setCreateBills] = useState(true);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState<string | null>(null);
  const [sendKey, setSendKey] = useState("");
  const [keyNeeded, setKeyNeeded] = useState(false);
  const [sendLetter, setSendLetter] = useState(true);
  const [to, setTo] = useState("");
  const [toTouched, setToTouched] = useState(false);

  // Follows the subcontractor's Quickbase address until the field is edited.
  const effectiveTo = toTouched ? to : to || suggestedTo;
  // With no address there is nothing to send to, so the letter is simply
  // skipped rather than failing the whole flow.
  const willSend = sendLetter && effectiveTo.trim().length > 0;

  const effectiveTitle = title || scopeOfWork || jobName;
  const linked = Boolean(jobRecordId && subRecordId);

  const input: AwardWriteInput = {
    jobRecordId: Number(jobRecordId) || 0,
    subRecordId: Number(subRecordId) || 0,
    title: effectiveTitle,
    scope: scopeOfWork || effectiveTitle,
    poStatus,
    expenseClass,
    lienWaiver,
    dueDate,
    jobType,
    award,
    demoTotal,
    siteTotal,
    ada,
    createBills,
  };
  const plan = planAward(input);

  /**
   * Write the records, then send the letter -- in that order and never the
   * reverse. A letter can be sent again; a purchase order cannot be
   * un-created, and telling a subcontractor they have been awarded when the
   * PO failed to write is the worse of the two mistakes.
   */
  async function create() {
    setStage("working");
    setError(null);
    setPartial(null);
    const key = sendKey || storedKey();

    let body: {
      ok?: boolean;
      keyRequired?: boolean;
      error?: string;
      partial?: string;
      poRecordId?: number;
      costItemRecordId?: number;
      billCount?: number;
    };
    try {
      const res = await fetch("/api/qb/award", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(key ? { "x-send-key": key } : {}),
        },
        body: JSON.stringify(input),
      });
      body = await res.json();
    } catch {
      setError("Could not reach the server. Nothing was written to Quickbase.");
      setStage("idle");
      return;
    }

    if (!body.ok) {
      if (body.keyRequired) {
        setKeyNeeded(true);
        setError("This deployment needs a send key before it will write to Quickbase.");
      } else {
        setError(body.error ?? "Could not create the purchase order.");
        if (body.partial) setPartial(body.partial);
      }
      setStage("idle");
      return;
    }

    // The records exist from here on, so nothing below may report failure of
    // the whole operation -- only of the letter.
    try {
      localStorage.setItem(KEY_STORE, key);
    } catch {
      /* private mode -- the key just will not be remembered */
    }

    const result: CreatePoResult = {
      poRecordId: body.poRecordId as number,
      costItemRecordId: body.costItemRecordId as number,
      billCount: body.billCount ?? 0,
    };

    if (willSend) {
      try {
        const res = await fetch("/api/letter/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(key ? { "x-send-key": key } : {}),
          },
          body: JSON.stringify({
            letter,
            to: effectiveTo,
            cc: "",
            subject: defaultSubject(letter),
            text: defaultBody(letter),
          }),
        });
        const sent = await res.json();
        if (sent.ok) {
          result.letterSentTo = [...(sent.to ?? []), ...(sent.cc ?? [])];
        } else {
          result.letterError = sent.error ?? "The letter could not be sent.";
        }
      } catch {
        result.letterError = "Could not reach the server, so the letter was not sent.";
      }
    }

    onCreated(result);
    setStage("idle");
  }

  if (created) {
    return (
      <section className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
        <header className="border-b-2 border-brand-red bg-navy-700 px-4 py-3">
          <h2 className="text-sm font-semibold tracking-wide text-white uppercase">
            Purchase order created
          </h2>
        </header>
        <dl className="divide-y divide-navy-50 text-sm">
          <Line label="PO record" value={`#${created.poRecordId}`} />
          <Line label="Cost Item record" value={`#${created.costItemRecordId}`} />
          <Line
            label="Billing lines"
            value={
              created.billCount
                ? `${created.billCount} created`
                : "none — generate them in Quickbase"
            }
          />
          <Line
            label="Award letter"
            value={
              created.letterSentTo?.length
                ? `sent to ${created.letterSentTo.join(", ")}`
                : created.letterError
                  ? "not sent"
                  : "not sent — sending was off"
            }
          />
        </dl>
        {created.letterError && (
          <p
            role="alert"
            className="border-t border-brand-red/30 bg-brand-red-50 px-4 py-2.5 text-xs text-brand-red-dark"
          >
            <strong>The records were created, but the letter was not sent:</strong>{" "}
            {created.letterError} Send it from the panel below — creating the
            purchase order again would duplicate it.
          </p>
        )}
        <p className="border-t border-navy-100 bg-navy-50 px-4 py-2.5 text-xs text-navy-600/70">
          Saved with this award, so it will not be created twice.
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
      <header className="border-b border-navy-100 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-wide text-navy-800 uppercase">
          Create PO &amp; bills
        </h2>
        <p className="mt-0.5 text-xs text-navy-600/70">
          Writes the purchase order, its cost item and the billing lines into
          Quickbase.
        </p>
      </header>

      {!linked ? (
        <p className="px-4 py-6 text-sm text-navy-600/70">
          Pick the job and the subcontractor from the Quickbase lookups above. A
          purchase order has to point at real records, so a typed-in name is not
          enough.
        </p>
      ) : (
        <>
          <div className="space-y-3 p-4">
            <div>
              <label
                htmlFor="po-title"
                className="mb-1 block text-xs font-medium text-navy-700"
              >
                PO title
              </label>
              <input
                id="po-title"
                type="text"
                value={effectiveTitle}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md border border-navy-200 px-2.5 py-2 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="po-status"
                  className="mb-1 block text-xs font-medium text-navy-700"
                >
                  PO status
                </label>
                <select
                  id="po-status"
                  value={poStatus}
                  onChange={(e) => setPoStatus(e.target.value)}
                  className="w-full rounded-md border border-navy-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
                >
                  {PO_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="po-expense"
                  className="mb-1 block text-xs font-medium text-navy-700"
                >
                  Expense class
                </label>
                <select
                  id="po-expense"
                  value={expenseClass}
                  onChange={(e) => setExpenseClass(e.target.value)}
                  className="w-full rounded-md border border-navy-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
                >
                  {EXPENSE_CLASSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="po-due"
                  className="mb-1 block text-xs font-medium text-navy-700"
                >
                  Due date
                </label>
                <input
                  id="po-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-md border border-navy-200 px-2.5 py-2 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
                />
              </div>
              <div className="flex flex-col justify-end gap-2 pb-2">
                <label className="flex items-center gap-2 text-xs text-navy-700">
                  <input
                    type="checkbox"
                    checked={lienWaiver}
                    onChange={(e) => setLienWaiver(e.target.checked)}
                    className="h-4 w-4 accent-[var(--color-navy-700)]"
                  />
                  Lien waiver required
                </label>
                <label className="flex items-center gap-2 text-xs text-navy-700">
                  <input
                    type="checkbox"
                    checked={createBills}
                    onChange={(e) => setCreateBills(e.target.checked)}
                    className="h-4 w-4 accent-[var(--color-navy-700)]"
                  />
                  Create the {plan.bills.length || "payment"} bills
                </label>
              </div>
            </div>

            <div className="rounded-md border border-navy-100 bg-navy-50/60 p-3">
              <label className="flex items-center gap-2 text-xs font-medium text-navy-800">
                <input
                  type="checkbox"
                  checked={sendLetter}
                  onChange={(e) => setSendLetter(e.target.checked)}
                  className="h-4 w-4 accent-[var(--color-navy-700)]"
                />
                Email the award letter to the subcontractor
              </label>
              {sendLetter && (
                <div className="mt-2">
                  <label
                    htmlFor="po-letter-to"
                    className="mb-1 block text-xs font-medium text-navy-700"
                  >
                    To
                  </label>
                  <input
                    id="po-letter-to"
                    type="email"
                    multiple
                    value={effectiveTo}
                    onChange={(e) => {
                      setToTouched(true);
                      setTo(e.target.value);
                    }}
                    placeholder="subcontractor@example.com"
                    className="w-full rounded-md border border-navy-200 px-2.5 py-2 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
                  />
                  <p className="mt-1 text-[10px] text-navy-600/70">
                    {effectiveTo.trim()
                      ? suggestedTo && !toTouched
                        ? "From the subcontractor's Quickbase record. The letter goes out after the records are created."
                        : "The letter goes out after the records are created."
                      : "No address on the subcontractor's Quickbase record — add one here, or the records will be created without a letter."}
                  </p>
                </div>
              )}
            </div>

            {keyNeeded && (
              <div>
                <label
                  htmlFor="po-key"
                  className="mb-1 block text-xs font-medium text-navy-700"
                >
                  Send key
                </label>
                <input
                  id="po-key"
                  type="password"
                  value={sendKey}
                  onChange={(e) => setSendKey(e.target.value)}
                  className="w-full rounded-md border border-navy-200 px-2.5 py-2 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
                />
              </div>
            )}

            {error && (
              <p
                role="alert"
                className="rounded-md border border-brand-red/30 bg-brand-red-50 px-3 py-2 text-xs text-brand-red-dark"
              >
                {error}
                {partial && (
                  <span className="mt-1 block font-semibold">{partial}</span>
                )}
              </p>
            )}
          </div>

          <div className="border-t-2 border-navy-200 bg-navy-50 p-4">
            {stage === "confirming" ? (
              <div className="rounded-md border border-brand-red/40 bg-white p-3">
                <p className="text-xs font-semibold text-navy-800">
                  Create these records in Quickbase?
                </p>
                <dl className="mt-2 space-y-1 text-xs text-navy-700">
                  <Row k="Job" v={jobName} />
                  <Row k="Subcontractor" v={subcontractor} />
                  <Row k="PO" v={`${plan.po.title} — ${plan.po.status}`} />
                  <Row
                    k="Award breakdown"
                    v={
                      `Demolición ${money(plan.po.demolition)} · Site ${money(plan.po.site)}` +
                      (plan.po.ada > 0 ? ` · ADA ${money(plan.po.ada)}` : "")
                    }
                  />
                  <Row k="Cost Item" v={`${money(plan.costItem.unitCost)} (1 × LS)`} />
                  <Row
                    k="Bills"
                    v={
                      plan.bills.length
                        ? `${plan.bills.length} lines totalling ${money(plan.billTotal)}`
                        : "none"
                    }
                  />
                  <Row
                    k="Award letter"
                    v={willSend ? `emailed to ${effectiveTo}` : "not being sent"}
                  />
                </dl>
                {plan.bills.length > 0 && (
                  <ul className="mt-2 max-h-32 overflow-auto rounded border border-navy-100 text-[11px]">
                    {plan.bills.map((b) => (
                      <li
                        key={b.title}
                        className="flex justify-between border-b border-navy-50 px-2 py-1 last:border-0"
                      >
                        <span className="text-navy-700">{b.title}</span>
                        <span className="tabular text-navy-800">{money(b.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-[11px] text-navy-600/70">
                  These become real records in Quickbase and are not undone from here.
                  {willSend
                    ? " The letter goes to the subcontractor and cannot be recalled."
                    : ""}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={create}
                    className="rounded-md bg-brand-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-red-dark"
                  >
                    Yes, create them
                  </button>
                  <button
                    type="button"
                    onClick={() => setStage("idle")}
                    className="rounded-md border border-navy-200 bg-white px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  disabled={!(award > 0) || stage === "working"}
                  onClick={() => setStage("confirming")}
                  className={`w-full rounded-md px-4 py-2.5 text-sm font-semibold text-white transition ${
                    award > 0 && stage !== "working"
                      ? "bg-navy-700 hover:bg-navy-800"
                      : "cursor-not-allowed bg-navy-300"
                  }`}
                >
                  {stage === "working"
                    ? "Creating…"
                    : willSend
                      ? "Create PO & Send Letter"
                      : "Create PO & Bills"}
                </button>
                <p className="mt-2 text-xs text-navy-600/70">
                  {award > 0
                    ? `${money(award)} contract${
                        plan.bills.length ? `, split into ${plan.bills.length} payments` : ""
                      }${willSend ? ", letter emailed after" : ""}. You will be asked to confirm.`
                    : "The award has to be above zero."}
                </p>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2">
      <dt className="text-navy-600">{label}</dt>
      <dd className="tabular font-semibold text-navy-800">{value}</dd>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-navy-600/70">{k}:</span>
      <span className="truncate font-medium">{v}</span>
    </div>
  );
}

export { pct };
