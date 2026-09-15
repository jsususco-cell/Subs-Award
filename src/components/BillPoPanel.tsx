"use client";

import { useState } from "react";
import BreakdownEditor from "./BreakdownEditor";
import LookupField from "./LookupField";
import { money, pct as fmtPct } from "@/lib/format";
import { loadSubs } from "@/lib/qb-client";
import {
  backChargeProblem,
  billRows,
  billingConvention,
  netOf,
  type BillRow,
  type ExistingBill,
  type PoOption,
} from "@/lib/bills";
import { breakdownTotal, type BreakdownRow } from "@/lib/qb-award";
import { isContractEntry, regionFor, type RegionKey } from "@/lib/regions";
import { scheduleSetFor } from "@/lib/schedule";

const KEY_STORE = "subs-award:send-key";

function storedKey(): string {
  try {
    return localStorage.getItem(KEY_STORE) ?? "";
  } catch {
    return "";
  }
}

/** What the user has typed on a row, keyed by milestone number. */
interface Draft {
  selected: boolean;
  backCharge: number;
  backChargeDesc: string;
}

/**
 * Bill against a purchase order that already exists.
 *
 * The award flow creates every milestone at once; this is for a PO that was
 * awarded without its bills, or where only some milestones have been drawn so
 * far. Milestones already billed are shown but cannot be billed twice — only
 * their back charge stays editable, which is the whole point of coming back to
 * a PO later.
 */
export default function BillPoPanel({ region }: { region: RegionKey }) {
  const cfg = regionFor(region);
  const hasSchedule = scheduleSetFor(cfg) !== null;
  /*
   * A contract-entry region has no milestones to tick. Coming back to a
   * purchase order there means breaking down more of the contract into PO line
   * items, not drawing against a schedule.
   */
  const contractEntry = isContractEntry(cfg);

  const [sub, setSub] = useState("");
  const [subRecordId, setSubRecordId] = useState("");
  const [pos, setPos] = useState<PoOption[] | null>(null);
  const [poId, setPoId] = useState("");
  const [loadingPos, setLoadingPos] = useState(false);

  const [costItemId, setCostItemId] = useState<number | null>(null);
  const [account, setAccount] = useState<{ id: number; label: string } | null>(null);
  const [existing, setExisting] = useState<ExistingBill[]>([]);
  const [contract, setContract] = useState(0);
  const [loadingBills, setLoadingBills] = useState(false);

  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [lineItems, setLineItems] = useState<
    { recordId: number; title: string; amount: number }[]
  >([]);
  const [contractPrice, setContractPrice] = useState(0);
  const [newRows, setNewRows] = useState<BreakdownRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [keyNeeded, setKeyNeeded] = useState(false);
  const [sendKey, setSendKey] = useState("");

  const po = pos?.find((p) => String(p.recordId) === poId) ?? null;
  const rows: BillRow[] = po
    ? billRows(region, po.jobType, contract, existing)
    : [];
  const convention = po
    ? billingConvention(region, po.jobType, contract, existing)
    : "unbilled";

  function draftFor(row: BillRow): Draft {
    return (
      drafts[row.n] ?? {
        selected: false,
        backCharge: row.existing?.backCharge ?? 0,
        backChargeDesc: row.existing?.backChargeDesc ?? "",
      }
    );
  }

  function setDraft(n: number, patch: Partial<Draft>) {
    setDrafts((d) => ({
      ...d,
      [n]: { ...(d[n] ?? { selected: false, backCharge: 0, backChargeDesc: "" }), ...patch },
    }));
  }

  async function pickSub(recordId: string) {
    setSubRecordId(recordId);
    setPos(null);
    setPoId("");
    setExisting([]);
    setCostItemId(null);
    setDrafts({});
    setError(null);
    setDone(null);
    if (!recordId) return;

    setLoadingPos(true);
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
      setLoadingPos(false);
    }
  }

  async function pickPo(id: string) {
    setPoId(id);
    setExisting([]);
    setCostItemId(null);
    setAccount(null);
    setDrafts({});
    setLineItems([]);
    setNewRows([]);
    setContractPrice(0);
    setError(null);
    setDone(null);
    if (!id) return;

    setLoadingBills(true);
    try {
      if (contractEntry) {
        const r = await fetch(
          `/api/qb/bills?resource=lineitems&region=${region}&po=${id}`,
        );
        const b = await r.json();
        if (!b.ok) {
          setError(b.error ?? "Could not load the line items.");
          return;
        }
        setLineItems(b.items ?? []);
        setContractPrice(b.contractPrice ?? 0);
        setNewRows([]);
        return;
      }

      const res = await fetch(`/api/qb/bills?resource=bills&region=${region}&po=${id}`);
      const body = await res.json();
      if (!body.ok) {
        setError(body.error ?? "Could not load the bills.");
        return;
      }
      if (body.error) setError(body.error);
      setCostItemId(body.costItemRecordId ?? null);
      setAccount(body.qbLineItem ?? null);
      if (body.qbLineItemError) setError(body.qbLineItemError);
      setExisting(body.bills ?? []);
      const chosen = pos?.find((p) => String(p.recordId) === id);
      setContract(body.unitCost || chosen?.totalCost || 0);
    } catch {
      setError("Could not reach the server to load the bills.");
    } finally {
      setLoadingBills(false);
    }
  }

  const toCreate = rows.filter((r) => !r.existing && draftFor(r).selected);
  const toUpdate = rows.filter((r) => {
    if (!r.existing) return false;
    const d = draftFor(r);
    return (
      Math.abs(d.backCharge - r.existing.backCharge) > 0.005 ||
      d.backChargeDesc.trim() !== r.existing.backChargeDesc.trim()
    );
  });

  const problems = rows
    .map((r) => {
      const d = draftFor(r);
      if (!d.selected && !r.existing) return null;
      const problem = backChargeProblem(
        d.backCharge,
        d.backChargeDesc,
        r.existing?.amount || r.amount,
      );
      return problem ? `${r.desc}: ${problem}` : null;
    })
    .filter(Boolean) as string[];

  const canSave =
    (toCreate.length > 0 || toUpdate.length > 0) && problems.length === 0 && !busy;

  const alreadyBrokenDown = lineItems.reduce((s, i) => s + i.amount, 0);
  const addingTotal = breakdownTotal(newRows);
  const canAddLines =
    newRows.some((r) => r.amount > 0) &&
    (contractPrice <= 0 ||
      alreadyBrokenDown + addingTotal - contractPrice <= 0.005) &&
    !busy;

  async function addLineItems() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const key = sendKey || storedKey();
      const res = await fetch("/api/qb/bills", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(key ? { "x-send-key": key } : {}),
        },
        body: JSON.stringify({
          action: "line-items",
          region,
          poRecordId: po?.recordId,
          subRecordId: subRecordId ? Number(subRecordId) : 0,
          breakdown: newRows.filter((r) => r.amount > 0),
        }),
      });
      const body = await res.json();

      if (body.keyRequired) {
        setKeyNeeded(true);
        setError("This deployment needs the send key before it will write line items.");
        return;
      }
      if (!body.ok) {
        setError(body.error ?? "Could not add the line items.");
        return;
      }

      try {
        if (key) localStorage.setItem(KEY_STORE, key);
      } catch {
        /* private browsing just means it is asked for again */
      }
      setKeyNeeded(false);
      setDone(
        `${body.created} line item${body.created === 1 ? "" : "s"} added. ` +
          (body.balance > 0.005
            ? `${money(body.balance)} of the contract is still to break down.`
            : "The contract is fully broken down."),
      );
      await pickPo(poId);
    } catch {
      setError("Could not reach the server to add the line items.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const key = sendKey || storedKey();
      const res = await fetch("/api/qb/bills", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(key ? { "x-send-key": key } : {}),
        },
        body: JSON.stringify({
          region,
          poRecordId: po?.recordId,
          jobRecordId: po?.jobRecordId,
          jobType: po?.jobType,
          totalCost: contract,
          create: toCreate.map((r) => ({
            n: r.n,
            backCharge: draftFor(r).backCharge,
            backChargeDesc: draftFor(r).backChargeDesc,
          })),
          update: toUpdate.map((r) => ({
            recordId: r.existing!.recordId,
            backCharge: draftFor(r).backCharge,
            backChargeDesc: draftFor(r).backChargeDesc,
          })),
        }),
      });
      const body = await res.json();

      if (body.keyRequired) {
        setKeyNeeded(true);
        setError("This deployment needs the send key before it will write bills.");
        return;
      }
      if (!body.ok) {
        setError(body.error ?? "Could not save the bills.");
        return;
      }

      try {
        if (key) localStorage.setItem(KEY_STORE, key);
      } catch {
        /* private browsing just means it is asked for again */
      }
      setKeyNeeded(false);
      setDone(
        `${body.created} bill${body.created === 1 ? "" : "s"} created` +
          (body.updated ? `, ${body.updated} back charge${body.updated === 1 ? "" : "s"} saved` : ""),
      );
      setDrafts({});
      await pickPo(poId);
    } catch {
      setError("Could not reach the server to save the bills.");
    } finally {
      setBusy(false);
    }
  }

  if (!hasSchedule && !contractEntry) {
    return (
      <section className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
        <header className="border-b-2 border-brand-red bg-navy-700 px-4 py-3">
          <h2 className="text-sm font-semibold tracking-wide text-white uppercase">
            Bill an existing PO
          </h2>
          <p className="mt-0.5 text-xs text-navy-200">{cfg.label}</p>
        </header>
        <p className="px-4 py-4 text-sm text-navy-700">
          There is no payment schedule for {cfg.label} yet, so there are no
          milestones to bill against. Draw the bills from Quickbase until the{" "}
          {cfg.label} schedule lands.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-navy-200 bg-white shadow-sm">
        <header className="border-b border-navy-100 px-4 py-3">
          <h2 className="text-sm font-semibold tracking-wide text-navy-800 uppercase">
            Select vendor &amp; PO
          </h2>
          <p className="mt-0.5 text-xs text-navy-600/70">
            {cfg.label} purchase orders for a subcontractor.
          </p>
        </header>

        <div className="grid gap-3 p-4 sm:grid-cols-2">
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

          <div>
            <label
              htmlFor="bill-po"
              className="mb-1 block text-xs font-medium text-navy-700"
            >
              Purchase order
            </label>
            <select
              id="bill-po"
              value={poId}
              onChange={(e) => void pickPo(e.target.value)}
              disabled={!pos || loadingPos}
              className="w-full rounded-md border border-navy-200 bg-white px-2.5 py-2 text-sm text-navy-800 disabled:bg-navy-50 disabled:text-navy-400"
            >
              <option value="">
                {loadingPos
                  ? "Loading…"
                  : !subRecordId
                    ? "Pick a subcontractor first…"
                    : !pos?.length
                      ? `No billable ${cfg.label} POs for this vendor`
                      : "Select a purchase order…"}
              </option>
              {(pos ?? []).map((p) => (
                <option key={p.recordId} value={p.recordId}>
                  {p.poNumber || `#${p.recordId}`} — {p.jobName || p.title} ·{" "}
                  {p.status}
                </option>
              ))}
            </select>
            {po && (
              <p className="mt-1 text-xs text-navy-600/70">
                {po.jobType || "no job type"} · contract {money(contract)}
                {costItemId ? ` · cost item #${costItemId}` : ""}
                {account
                  ? ` · posts to ${account.label} (#${account.id})`
                  : ""}
              </p>
            )}
          </div>
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

      {keyNeeded && (
        <div className="rounded-xl border border-navy-200 bg-white p-4 shadow-sm">
          <label
            htmlFor="bill-key"
            className="mb-1 block text-xs font-medium text-navy-700"
          >
            Send key
          </label>
          <input
            id="bill-key"
            type="password"
            value={sendKey}
            onChange={(e) => setSendKey(e.target.value)}
            className="w-full rounded-md border border-navy-200 px-2.5 py-2 text-sm outline-none focus:border-navy-600"
          />
          <p className="mt-1 text-xs text-navy-600/70">
            Asked once, then remembered in this browser.
          </p>
        </div>
      )}

      {done && (
        <p className="rounded-xl border border-navy-200 bg-navy-50 px-4 py-3 text-sm font-medium text-navy-800">
          {done}
        </p>
      )}

      {po && !loadingBills && contractEntry && (
        <>
          {lineItems.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
              <header className="border-b border-navy-100 px-4 py-3">
                <h2 className="text-sm font-semibold tracking-wide text-navy-800 uppercase">
                  Line items already on this PO
                </h2>
              </header>
              <table className="w-full text-sm">
                <tbody>
                  {lineItems.map((li) => (
                    <tr key={li.recordId} className="border-b border-navy-50 last:border-0">
                      <td className="px-4 py-1.5 text-navy-600/60">#{li.recordId}</td>
                      <td className="py-1.5 text-navy-800">{li.title || "—"}</td>
                      <td className="tabular px-4 py-1.5 text-right text-navy-800">
                        {money(li.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {contractPrice > 0 ? (
            <BreakdownEditor
              rows={newRows}
              onRows={setNewRows}
              contractPrice={contractPrice}
              committed={alreadyBrokenDown}
              committedLabel="Already on this PO"
            />
          ) : (
            <p className="rounded-xl border border-navy-200 bg-navy-50 px-4 py-3 text-sm text-navy-700">
              This purchase order carries no Total Contract Price, so there is
              nothing to work a balance out against. It was raised before that
              field existed, or outside this app — set it on the PO in Quickbase
              and come back.
            </p>
          )}

          {contractPrice > 0 && (
            <div className="rounded-xl border border-navy-200 bg-navy-50 p-4 shadow-sm">
              <button
                type="button"
                disabled={!canAddLines}
                onClick={addLineItems}
                className={`w-full rounded-md px-4 py-2.5 text-sm font-semibold text-white transition ${
                  canAddLines
                    ? "bg-navy-700 hover:bg-navy-800"
                    : "cursor-not-allowed bg-navy-300"
                }`}
              >
                {busy
                  ? "Adding…"
                  : newRows.some((r) => r.amount > 0)
                    ? `Add ${newRows.filter((r) => r.amount > 0).length} line item${
                        newRows.filter((r) => r.amount > 0).length === 1 ? "" : "s"
                      } (${money(addingTotal)})`
                    : "Nothing to add"}
              </button>
              <p className="mt-2 text-xs text-navy-600/70">
                These become PO line items, which is what finance bills against.
                Adding them does not create a second purchase order.
              </p>
            </div>
          )}
        </>
      )}

      {po && !loadingBills && !contractEntry && rows.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
          <header className="border-b-2 border-brand-red bg-navy-700 px-4 py-3">
            <h2 className="text-sm font-semibold tracking-wide text-white uppercase">
              Payment breakdown
            </h2>
            <p className="mt-0.5 text-xs text-navy-200">
              Tick a milestone to bill it. A back charge nets the bill down and
              needs a reason.
            </p>
          </header>

          {convention === "uncapped" && (
            <p className="border-b border-navy-100 bg-navy-50 px-4 py-2.5 text-xs text-navy-700">
              <strong>This PO is billed without the mobilisation cap.</strong>{" "}
              Its milestones pay the flat percentage, which is how the Quickbase
              award page bills. The amounts below follow the same convention so
              they still total the contract — mixing the two would leave the
              bills adding up to more than {money(contract)}.
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-navy-100 bg-navy-100/60 text-xs tracking-wide text-navy-700 uppercase">
                  <th scope="col" className="w-10 px-3 py-2" />
                  <th scope="col" className="w-8 py-2 text-left font-semibold">
                    #
                  </th>
                  <th scope="col" className="py-2 text-left font-semibold">
                    Partida
                  </th>
                  <th scope="col" className="py-2 text-right font-semibold">
                    %
                  </th>
                  <th scope="col" className="py-2 text-right font-semibold">
                    Amount
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">
                    Back charge
                  </th>
                  <th scope="col" className="py-2 text-right font-semibold">
                    Net
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const d = draftFor(row);
                  const amount = row.existing?.amount || row.amount;
                  return (
                    <tr key={row.n} className="border-b border-navy-50 last:border-0">
                      <td className="px-3 py-2 text-center">
                        {row.existing ? (
                          <span title="Already billed" className="text-navy-400">
                            ✓
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            aria-label={`Bill ${row.desc}`}
                            checked={d.selected}
                            onChange={(e) =>
                              setDraft(row.n, { selected: e.target.checked })
                            }
                            className="h-4 w-4 accent-[var(--color-navy-700)]"
                          />
                        )}
                      </td>
                      <td className="py-2 text-navy-600/60">{row.n}</td>
                      <td className="py-2 text-navy-800">
                        {row.desc}
                        {row.amountDiffers && (
                          <span
                            className="ml-1 text-xs text-brand-red"
                            title={`The schedule computes ${money(row.amount)} for this milestone, but the bill on file is ${money(row.existing!.amount)}. Usually means this PO was billed without the mobilisation cap.`}
                          >
                            ⚠
                          </span>
                        )}
                      </td>
                      <td className="tabular py-2 text-right text-navy-600/80">
                        {fmtPct(row.pct)}
                      </td>
                      <td className="tabular py-2 text-right text-navy-800">
                        {money(amount)}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          aria-label={`Back charge on ${row.desc}`}
                          value={d.backCharge || ""}
                          onChange={(e) =>
                            setDraft(row.n, { backCharge: Number(e.target.value) || 0 })
                          }
                          placeholder="0.00"
                          className="w-24 rounded border border-navy-200 px-2 py-1 text-right text-sm outline-none focus:border-navy-600"
                        />
                        <input
                          type="text"
                          aria-label={`Back charge reason for ${row.desc}`}
                          value={d.backChargeDesc}
                          onChange={(e) =>
                            setDraft(row.n, { backChargeDesc: e.target.value })
                          }
                          placeholder={d.backCharge > 0 ? "Reason (required)" : "Reason"}
                          className={`mt-1 w-40 rounded border px-2 py-1 text-sm outline-none focus:border-navy-600 ${
                            d.backCharge > 0 && !d.backChargeDesc.trim()
                              ? "border-brand-red"
                              : "border-navy-200"
                          }`}
                        />
                      </td>
                      <td className="tabular py-2 text-right font-semibold text-navy-800">
                        {money(netOf(amount, d.backCharge))}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {row.existing ? (
                          <span className="text-navy-600/70">
                            Created #{row.existing.recordId}
                          </span>
                        ) : (
                          <span className="text-navy-400">Not created</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {problems.length > 0 && (
            <ul className="border-t border-navy-100 bg-brand-red/5 px-4 py-2 text-xs text-brand-red">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}

          <div className="border-t-2 border-navy-200 bg-navy-50 p-4">
            <button
              type="button"
              disabled={!canSave}
              onClick={save}
              className={`w-full rounded-md px-4 py-2.5 text-sm font-semibold text-white transition ${
                canSave
                  ? "bg-navy-700 hover:bg-navy-800"
                  : "cursor-not-allowed bg-navy-300"
              }`}
            >
              {busy
                ? "Saving…"
                : toCreate.length || toUpdate.length
                  ? `Create ${toCreate.length} bill${toCreate.length === 1 ? "" : "s"}` +
                    (toUpdate.length
                      ? ` · save ${toUpdate.length} back charge${toUpdate.length === 1 ? "" : "s"}`
                      : "")
                  : "Nothing selected"}
            </button>
            <p className="mt-2 text-xs text-navy-600/70">
              {toCreate.length
                ? `${money(toCreate.reduce((s, r) => s + netOf(r.amount, draftFor(r).backCharge), 0))} net across ${toCreate.length} bill${toCreate.length === 1 ? "" : "s"}.`
                : "Tick the milestones to bill, or change a back charge on one already created."}
            </p>
          </div>
        </section>
      )}

      {po && loadingBills && (
        <p className="rounded-xl border border-navy-200 bg-white px-4 py-3 text-sm text-navy-600/70">
          Loading the breakdown…
        </p>
      )}
    </div>
  );
}
