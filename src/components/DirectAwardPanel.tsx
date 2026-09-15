"use client";

import { useState } from "react";
import BreakdownEditor from "./BreakdownEditor";
import CreatePoPanel, { type CreatePoResult } from "./CreatePoPanel";
import LookupField from "./LookupField";
import NumberField from "./NumberField";
import PaymentSchedule from "./PaymentSchedule";
import { money } from "@/lib/format";
import { loadJobs, loadSubs } from "@/lib/qb-client";
import {
  CATEGORY_FIELDS,
  EMPTY_CATEGORIES,
  breakdownTotal,
  categoriesTotal,
  type BreakdownRow,
  type PoCategories,
} from "@/lib/qb-award";
import { canRenderLetter, renderLetter, type LetterInput } from "@/lib/letter";
import { templateFor } from "@/lib/letter-content";
import { isContractEntry, regionFor, type RegionKey } from "@/lib/regions";
import type { AwardResult } from "@/lib/types";

export interface DirectAwardFields {
  jobName: string;
  jobAddress: string;
  jobRecordId: string;
  jobType: string;
  house: string;
  subcontractor: string;
  subRecordId: string;
  trade: string;
  scopeOfWork: string;
  program: string;
  startDate: string;
  endDate: string;
  itemsNotIncluded: string;
  categories: PoCategories;
  /** Contract entry: what the whole subcontract is worth. */
  contractPrice: number;
  /** Contract entry: the hand-entered breakdown, one PO line item per row. */
  breakdown: BreakdownRow[];
}

export function emptyDirectAward(region: RegionKey): DirectAwardFields {
  return {
    jobName: "",
    jobAddress: "",
    jobRecordId: "",
    jobType: "",
    house: "",
    subcontractor: "",
    subRecordId: "",
    trade: "",
    scopeOfWork: "",
    program: regionFor(region).defaultProgram,
    startDate: "",
    endDate: "",
    itemsNotIncluded: "",
    categories: { ...EMPTY_CATEGORIES },
    contractPrice: 0,
    breakdown: [],
  };
}

interface Props {
  region: RegionKey;
  fields: DirectAwardFields;
  onField: (patch: Partial<DirectAwardFields>) => void;
  created: CreatePoResult | null;
  onCreated: (result: CreatePoResult) => void;
}

/**
 * Award a purchase order without a scope file.
 *
 * The Canopy route derives the award from an uploaded scope; this one is for
 * when there is no scope to derive from and the figures are known. The Award
 * Breakdown is typed in category by category, exactly as on the Quickbase
 * award page, and Quickbase's Total Amount is the sum of those categories —
 * so the contract amount is computed here rather than entered separately, and
 * the two cannot disagree.
 */
export default function DirectAwardPanel({
  region,
  fields,
  onField,
  created,
  onCreated,
}: Props) {
  const cfg = regionFor(region);
  const template = templateFor(cfg);
  const [subEmail, setSubEmail] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [letterError, setLetterError] = useState<string | null>(null);

  const contract = isContractEntry(cfg);
  /*
   * What the award is worth. On a contract entry that is the figure typed in,
   * not the breakdown's total — the breakdown is allowed to cover only part of
   * the contract on a first pass.
   */
  const total = contract ? fields.contractPrice : categoriesTotal(fields.categories);
  const allocated = breakdownTotal(fields.breakdown);
  const overAllocated = contract && allocated - total > 0.005;
  const linked = Boolean(fields.jobRecordId && fields.subRecordId);

  function setCategory(key: keyof PoCategories, value: number) {
    onField({ categories: { ...fields.categories, [key]: value } });
  }

  /*
   * The letter for a direct award carries the categories rather than a scope
   * derivation, so the figures that would describe one are zero. The award
   * total is the only number the letter's payment breakdown divides.
   */
  const result: AwardResult = {
    base: 0,
    derivedLessOandP: 0,
    lessOandP: 0,
    lessOandPIsManual: false,
    tierRows: [],
    hc: 0,
    ada: fields.categories.ada,
    award: total,
  };

  const letter: LetterInput = {
    region,
    jobName: fields.jobName,
    jobAddress: fields.jobAddress,
    subcontractor: fields.subcontractor,
    scopeOfWork: fields.scopeOfWork,
    jobType: fields.jobType,
    program: fields.program,
    startDate: fields.startDate,
    endDate: fields.endDate,
    coverages: [],
    categories: fields.categories,
    result,
    issuedOn: new Date().toISOString(),
  };

  /*
   * The letter can be read before anything is written. The route can email it
   * along with the purchase order, but a contract nobody looked at first is
   * not something to put in front of a subcontractor.
   */
  const letterReady =
    canRenderLetter(region) &&
    fields.jobName.trim() !== "" &&
    fields.subcontractor.trim() !== "";

  function openLetter() {
    const win = window.open("", "_blank");
    if (!win) {
      setLetterError(
        "The browser blocked the letter window. Allow pop-ups for this site, or use Download.",
      );
      return;
    }
    setLetterError(null);
    win.document.write(renderLetter(letter));
    win.document.close();
  }

  async function downloadPdf() {
    setPdfBusy(true);
    setLetterError(null);
    try {
      const res = await fetch("/api/letter/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(letter),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLetterError(body.error ?? "Could not render the PDF.");
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download =
        (fields.jobName.trim() || "award").replace(/[^\w.-]+/g, "-") +
        (template?.fileSuffix ?? ".pdf");
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setLetterError("Could not reach the server to render the PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        <section className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
          <header className="border-b border-navy-100 px-4 py-3">
            <h2 className="text-sm font-semibold tracking-wide text-navy-800 uppercase">
              Assignment
            </h2>
            <p className="mt-0.5 text-xs text-navy-600/70">
              {cfg.label} jobs and award-eligible subcontractors.
            </p>
          </header>

          <div className="space-y-3 p-4">
            <LookupField
              label="Project"
              value={fields.jobName}
              placeholder={cfg.key === "PR" ? "PR-R3-03073" : "Case number"}
              onChange={(v, extra) =>
                onField({
                  jobName: v,
                  // Only overwrite when the job actually carries them, so a
                  // hand-typed value is not wiped by a blank lookup.
                  ...(extra?.address ? { jobAddress: extra.address } : {}),
                  ...(extra?.jobType ? { jobType: extra.jobType } : {}),
                  ...(extra?.house ? { house: extra.house } : {}),
                  jobRecordId: extra?.recordId ?? "",
                })
              }
              loadChoices={async () => {
                const r = await loadJobs(region);
                return {
                  configured: r.configured,
                  warning: r.warning,
                  error: r.error,
                  choices: r.items.map((j) => ({
                    id: j.id,
                    label: j.name,
                    hint: [j.address, j.jobType].filter(Boolean).join("  ·  "),
                    extra: {
                      address: j.address,
                      jobType: j.jobType,
                      house: j.house,
                      recordId: j.id,
                    },
                  })),
                };
              }}
            />

            <Field
              label="Job address"
              value={fields.jobAddress}
              onChange={(v) => onField({ jobAddress: v })}
              placeholder="Street, municipality"
            />

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Job Type"
                value={fields.jobType}
                onChange={(v) => onField({ jobType: v })}
                placeholder="auto-fills from the project"
              />
              <Field
                label="House"
                value={fields.house}
                onChange={(v) => onField({ house: v })}
                placeholder="auto-fills from the project"
              />
            </div>

            <LookupField
              label="Subcontractor (award-eligible)"
              value={fields.subcontractor}
              placeholder="Company name"
              onChange={(v, extra) => {
                onField({
                  subcontractor: v,
                  subRecordId: extra?.recordId ?? "",
                  ...(extra?.trade ? { trade: extra.trade } : {}),
                });
                if (extra?.email !== undefined) setSubEmail(extra.email);
              }}
              loadChoices={async () => {
                const r = await loadSubs(region);
                return {
                  configured: r.configured,
                  warning: r.warning,
                  error: r.error,
                  choices: r.items.map((sub) => ({
                    id: sub.id,
                    label: sub.company,
                    hint: [sub.trade, sub.email].filter(Boolean).join("  ·  "),
                    extra: { email: sub.email, trade: sub.trade, recordId: sub.id },
                  })),
                };
              }}
            />

            <Field
              label="Trade"
              value={fields.trade}
              onChange={(v) => onField({ trade: v })}
              placeholder="auto-fills from the subcontractor"
            />

            <div>
              <label
                htmlFor="direct-scope"
                className="mb-1 block text-xs font-medium text-navy-700"
              >
                Scope description
              </label>
              <textarea
                id="direct-scope"
                value={fields.scopeOfWork}
                onChange={(e) => onField({ scopeOfWork: e.target.value })}
                rows={2}
                placeholder="e.g. Reconstrucción completa per plans"
                className="w-full rounded-md border border-navy-200 px-2.5 py-2 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
              />
            </div>
          </div>
        </section>

        {contract ? (
          <>
            <section className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
              <header className="border-b border-navy-100 px-4 py-3">
                <h2 className="text-sm font-semibold tracking-wide text-navy-800 uppercase">
                  Total contract price
                </h2>
                <p className="mt-0.5 text-xs text-navy-600/70">
                  What the whole subcontract is worth. The breakdown below turns
                  it into PO line items.
                </p>
              </header>
              <div className="p-4">
                <NumberField
                  value={fields.contractPrice}
                  onChange={(v) => onField({ contractPrice: v })}
                  prefix="$"
                  decimals={2}
                  ariaLabel="Total contract price"
                />
              </div>
            </section>

            <BreakdownEditor
              rows={fields.breakdown}
              onRows={(breakdown) => onField({ breakdown })}
              contractPrice={fields.contractPrice}
            />
          </>
        ) : (
        <section className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
          <header className="border-b border-navy-100 px-4 py-3">
            <h2 className="text-sm font-semibold tracking-wide text-navy-800 uppercase">
              Award breakdown
            </h2>
            <p className="mt-0.5 text-xs text-navy-600/70">
              Leave a category at zero where it does not apply — it is then left
              off the purchase order rather than written as $0.
            </p>
          </header>

          <div className="grid gap-3 p-4 sm:grid-cols-2">
            {CATEGORY_FIELDS.map((c) => (
              <div key={c.key}>
                <span className="mb-1 block text-xs font-medium text-navy-700">
                  {c.label}
                  {c.hint && (
                    <span className="font-normal text-navy-600/60"> ({c.hint})</span>
                  )}
                  {c.optional && (
                    <span className="font-normal text-navy-600/60"> · optional</span>
                  )}
                </span>
                <NumberField
                  value={fields.categories[c.key]}
                  onChange={(v) => setCategory(c.key, v)}
                  prefix="$"
                  decimals={2}
                  ariaLabel={c.label}
                />
              </div>
            ))}
          </div>

          <div className="flex items-baseline justify-between border-t-2 border-navy-200 bg-navy-50 px-4 py-3">
            <span className="text-xs font-semibold tracking-wide text-navy-700 uppercase">
              Total Amount
            </span>
            <span className="tabular text-lg font-bold text-navy-800">
              {money(total)}
            </span>
          </div>
          <p className="border-t border-navy-100 px-4 py-2 text-xs text-navy-600/70">
            Quickbase computes Total Amount from exactly these seven categories,
            so this is the contract amount and the figure the bills divide.
          </p>

          <div className="border-t border-navy-100 p-4">
            <label
              htmlFor="direct-not-included"
              className="mb-1 block text-xs font-medium text-navy-700"
            >
              Items or materials not included, or provided by CM
              <span className="font-normal text-navy-600/60"> · optional</span>
            </label>
            <textarea
              id="direct-not-included"
              value={fields.itemsNotIncluded}
              onChange={(e) => onField({ itemsNotIncluded: e.target.value })}
              rows={2}
              placeholder="e.g. Photovoltaic System (If Applicable) · Cistern (If Applicable)"
              className="w-full rounded-md border border-navy-200 px-2.5 py-2 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
            />
          </div>
        </section>
        )}
      </div>

      <div className="space-y-5">
        {!linked && (
          <p className="rounded-xl border border-navy-200 bg-navy-50 px-4 py-3 text-sm text-navy-700">
            Pick a project and a subcontractor from the lookups. A purchase
            order has to point at the Quickbase records, so typed-in names alone
            are not enough to create one.
          </p>
        )}

        {overAllocated && (
          <p
            role="alert"
            className="rounded-xl border border-brand-red/30 bg-brand-red/5 px-4 py-3 text-sm font-semibold text-brand-red"
          >
            The breakdown comes to more than the contract price. Fix it before
            creating the purchase order.
          </p>
        )}

        <CreatePoPanel
          jobRecordId={fields.jobRecordId}
          subRecordId={fields.subRecordId}
          jobName={fields.jobName}
          subcontractor={fields.subcontractor}
          scopeOfWork={fields.scopeOfWork}
          jobType={fields.jobType}
          award={total}
          demoTotal={0}
          siteTotal={0}
          ada={fields.categories.ada}
          {...(contract
            ? {
                contractPrice: fields.contractPrice,
                breakdown: fields.breakdown,
                blocked: overAllocated,
              }
            : { categories: fields.categories, itemsNotIncluded: fields.itemsNotIncluded })}
          house={fields.house}
          created={created}
          onCreated={onCreated}
          letter={letter}
          suggestedTo={subEmail}
        />

        <section className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
          <header className="border-b border-navy-100 px-4 py-3">
            <h2 className="text-sm font-semibold tracking-wide text-navy-800 uppercase">
              Award letter
            </h2>
          </header>
          <div className="p-4">
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!letterReady}
                onClick={openLetter}
                className={`flex-1 rounded-md px-4 py-2.5 text-sm font-semibold text-white transition ${
                  letterReady
                    ? "bg-navy-700 hover:bg-navy-800"
                    : "cursor-not-allowed bg-navy-300"
                }`}
              >
                Generate Award Letter
              </button>
              <button
                type="button"
                disabled={!letterReady || pdfBusy}
                onClick={downloadPdf}
                className={`rounded-md border px-3 py-2.5 text-sm font-semibold transition ${
                  letterReady
                    ? "border-navy-200 bg-white text-navy-700 hover:bg-navy-50"
                    : "cursor-not-allowed border-navy-100 text-navy-300"
                }`}
              >
                {pdfBusy ? "Rendering…" : "Download PDF"}
              </button>
            </div>
            {letterError && (
              <p role="alert" className="mt-2 text-xs font-semibold text-brand-red">
                {letterError}
              </p>
            )}
            <p className="mt-2 text-xs text-navy-600/70">
              {!template
                ? `There is no award letter template for ${cfg.label} yet.`
                : letterReady
                  ? "Read it before anything is created. Its breakdown itemises the award categories above, not a scope derivation."
                  : "Fill in the project and subcontractor to produce the letter."}
            </p>
          </div>
        </section>

        {!contract && (
          <PaymentSchedule
            region={region}
            jobType={fields.jobType}
            onJobType={(v) => onField({ jobType: v })}
            amount={total}
          />
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const id = "direct-" + label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-navy-700">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-navy-200 px-2.5 py-2 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
      />
    </div>
  );
}
