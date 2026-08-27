"use client";

import { useState } from "react";
import LookupField from "./LookupField";
import NumberField from "./NumberField";
import { loadJobs, loadSubs } from "@/lib/qb-client";
import PaymentSchedule from "./PaymentSchedule";
import { scheduleAmounts, scheduleForJobType } from "@/lib/schedule";
import { renderLetter } from "@/lib/letter";
import { money, pct } from "@/lib/format";
import type { AwardResult } from "@/lib/types";

export interface LetterFields {
  jobName: string;
  jobAddress: string;
  subcontractor: string;
  scopeOfWork: string;
  /** Drives the Desglose de Pagos schedule. */
  jobType: string;
  program: string;
  startDate: string;
  endDate: string;
}

interface Props {
  fields: LetterFields;
  onField: (patch: Partial<LetterFields>) => void;
  result: AwardResult;
  onHc: (v: number) => void;
  /** The coverage codes the scope total was built from. */
  coverages: string[];
}

/**
 * Collects the details an award letter needs and previews the figures it will
 * carry. The letter template itself is still to come, so this deliberately
 * stops short of rendering a document rather than inventing a layout.
 */
export default function LetterPanel({
  fields,
  onField,
  result,
  onHc,
  coverages,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [letterError, setLetterError] = useState<string | null>(null);
  const chosen = result.tierRows.find((r) => r.selected);
  const ready = fields.jobName.trim() !== "" && fields.subcontractor.trim() !== "";

  const merge: [string, string][] = [
    ["Job name", fields.jobName || "—"],
    ["Job address", fields.jobAddress || "—"],
    ["Subcontractor", fields.subcontractor || "—"],
    ["Scope of work", fields.scopeOfWork || "—"],
    ["Job type", fields.jobType || "—"],
    ["Coverages", coverages.join(" + ") || "—"],
    ["Scope total", money(result.base)],
    ["Less O&P", money(result.lessOandP)],
    ["Subs %", chosen ? pct(chosen.pct) : "—"],
    ["Subs amount", chosen ? money(chosen.amount) : "—"],
    ["HC", money(result.hc)],
    ["Award total", money(result.award)],
    ...scheduleForJobType(fields.jobType).map((m, i) => [
      `${m.n}. ${m.desc} (${m.pct}%)`,
      money(scheduleAmounts(result.award, scheduleForJobType(fields.jobType))[i]),
    ] as [string, string]),
  ];

  function buildLetter(): string {
    return renderLetter({
      jobName: fields.jobName,
      jobAddress: fields.jobAddress,
      subcontractor: fields.subcontractor,
      scopeOfWork: fields.scopeOfWork,
      jobType: fields.jobType,
      program: fields.program,
      startDate: fields.startDate,
      endDate: fields.endDate,
      coverages,
      result,
      issuedOn: new Date().toISOString(),
    });
  }

  function openLetter(mode: "print" | "download") {
    const html = buildLetter();
    const slug =
      (fields.jobName.trim() || "award").replace(/[^\w.-]+/g, "-") + " - award letter";

    if (mode === "download") {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = slug + ".html";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return;
    }

    const win = window.open("", "_blank");
    if (!win) {
      setLetterError(
        "The browser blocked the letter window. Allow pop-ups for this site, or use Download.",
      );
      return;
    }
    setLetterError(null);
    win.document.write(html);
    win.document.close();
  }

  async function copyMerge() {
    const text = merge.map(([k, v]) => `${k}\t${v}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the table on screen is still readable */
    }
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <section className="rounded-xl border border-navy-200 bg-white shadow-sm">
        <header className="border-b border-navy-100 px-4 py-3">
          <h2 className="text-sm font-semibold tracking-wide text-navy-800 uppercase">
            Letter details
          </h2>
          <p className="mt-0.5 text-xs text-navy-600/70">
            Everything the award letter needs beyond the figures.
          </p>
        </header>
        <div className="space-y-3 p-4">
          <LookupField
            label="Job name"
            value={fields.jobName}
            placeholder="PR-R3-03073"
            onChange={(v, extra) =>
              onField({
                jobName: v,
                // Only overwrite these when the job actually carries them, so
                // hand-typed values are not wiped by a blank lookup.
                ...(extra?.address ? { jobAddress: extra.address } : {}),
                ...(extra?.jobType ? { jobType: extra.jobType } : {}),
              })
            }
            loadChoices={async () => {
              const r = await loadJobs();
              return {
                configured: r.configured,
                warning: r.warning,
                error: r.error,
                choices: r.items.map((j) => ({
                  id: j.id,
                  label: j.name,
                  hint: [j.address, j.jobType].filter(Boolean).join("  ·  "),
                  extra: { address: j.address, jobType: j.jobType },
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
          <LookupField
            label="Subcontractor"
            value={fields.subcontractor}
            placeholder="Company name"
            onChange={(v) => onField({ subcontractor: v })}
            loadChoices={async () => {
              const r = await loadSubs();
              return {
                configured: r.configured,
                warning: r.warning,
                error: r.error,
                choices: r.items.map((sub) => ({
                  id: sub.id,
                  label: sub.company,
                  hint: sub.trade,
                })),
              };
            }}
          />
          <div>
            <label
              htmlFor="letter-scope"
              className="mb-1 block text-xs font-medium text-navy-700"
            >
              Scope of work
            </label>
            <textarea
              id="letter-scope"
              rows={3}
              value={fields.scopeOfWork}
              onChange={(e) => onField({ scopeOfWork: e.target.value })}
              placeholder="Demolition and site work per the extracted scope"
              className="w-full rounded-md border border-navy-200 px-2.5 py-2 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Programa"
              value={fields.program}
              onChange={(v) => onField({ program: v })}
              placeholder="PR R3"
            />
            <DateField
              label="Fecha de Inicio"
              value={fields.startDate}
              onChange={(v) => onField({ startDate: v })}
            />
          </div>
          <DateField
            label="Fecha de Finalizacion"
            value={fields.endDate}
            onChange={(v) => onField({ endDate: v })}
          />
          <div>
            <span className="mb-1 block text-xs font-medium text-navy-700">HC</span>
            <NumberField
              ariaLabel="Hard cost amount"
              value={result.hc}
              onChange={onHc}
              prefix="$"
              decimals={2}
            />
          </div>
        </div>
      </section>

      <div className="space-y-5">
      <PaymentSchedule
        jobType={fields.jobType}
        onJobType={(v) => onField({ jobType: v })}
        amount={result.award}
      />

      <section className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
        <header className="flex items-center justify-between gap-3 border-b border-navy-100 px-4 py-3">
          <h2 className="text-sm font-semibold tracking-wide text-navy-800 uppercase">
            Merge fields
          </h2>
          <button
            type="button"
            onClick={copyMerge}
            className="no-print rounded-md border border-navy-200 px-2.5 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50"
          >
            {copied ? "Copied" : "Copy all"}
          </button>
        </header>
        <table className="w-full text-sm">
          <tbody>
            {merge.map(([label, value], i) => (
              <tr key={label} className="border-b border-navy-50 last:border-0">
                <td className="w-1/2 px-4 py-1.5 text-navy-600">{label}</td>
                <td
                  className={`tabular px-4 py-1.5 text-right ${
                    i >= 4 ? "font-semibold text-navy-800" : "text-navy-800"
                  }`}
                >
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border-t-2 border-navy-200 bg-navy-50 p-4">
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!ready}
              onClick={() => openLetter("print")}
              className={`flex-1 rounded-md px-4 py-2.5 text-sm font-semibold text-white transition ${
                ready ? "bg-navy-700 hover:bg-navy-800" : "cursor-not-allowed bg-navy-300"
              }`}
            >
              Generate Award Letter
            </button>
            <button
              type="button"
              disabled={!ready}
              onClick={() => openLetter("download")}
              className={`rounded-md border px-3 py-2.5 text-sm font-semibold transition ${
                ready
                  ? "border-navy-200 bg-white text-navy-700 hover:bg-navy-50"
                  : "cursor-not-allowed border-navy-100 text-navy-300"
              }`}
            >
              Download
            </button>
          </div>
          {letterError && (
            <p role="alert" className="mt-2 text-xs font-semibold text-brand-red">
              {letterError}
            </p>
          )}
          <p className="mt-2 text-xs text-navy-600/70">
            {ready
              ? "Opens the letter ready to print or save as PDF. Wording and conditions follow the Quickbase template; the Desglose de Adjudicacion shows this system's derivation."
              : "Fill in the job name and subcontractor to generate the letter."}
          </p>
        </div>
      </section>
      </div>
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = "letter-" + label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-navy-700">
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-navy-200 px-2.5 py-2 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
      />
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
  placeholder: string;
}) {
  const id = `letter-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-navy-700">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-navy-200 px-2.5 py-2 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
      />
    </div>
  );
}
