"use client";

import { useState } from "react";
import NumberField from "./NumberField";
import { money, pct } from "@/lib/format";
import type { AwardResult } from "@/lib/types";

export interface LetterFields {
  jobName: string;
  jobAddress: string;
  subcontractor: string;
  scopeOfWork: string;
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
  const chosen = result.tierRows.find((r) => r.selected);
  const ready = fields.jobName.trim() !== "" && fields.subcontractor.trim() !== "";

  const merge: [string, string][] = [
    ["Job name", fields.jobName || "—"],
    ["Job address", fields.jobAddress || "—"],
    ["Subcontractor", fields.subcontractor || "—"],
    ["Scope of work", fields.scopeOfWork || "—"],
    ["Coverages", coverages.join(" + ") || "—"],
    ["Scope total", money(result.base)],
    ["Less O&P", money(result.lessOandP)],
    ["Subs %", chosen ? pct(chosen.pct) : "—"],
    ["Subs amount", chosen ? money(chosen.amount) : "—"],
    ["HC", money(result.hc)],
    ["Award total", money(result.award)],
  ];

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
          <Field
            label="Job name"
            value={fields.jobName}
            onChange={(v) => onField({ jobName: v })}
            placeholder="PR-R3-03073"
          />
          <Field
            label="Job address"
            value={fields.jobAddress}
            onChange={(v) => onField({ jobAddress: v })}
            placeholder="Street, municipality"
          />
          <Field
            label="Subcontractor"
            value={fields.subcontractor}
            onChange={(v) => onField({ subcontractor: v })}
            placeholder="Company name"
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
          <button
            type="button"
            disabled
            title="Waiting on the award letter template"
            className="w-full cursor-not-allowed rounded-md bg-navy-300 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Generate Award Letter
          </button>
          <p className="mt-2 text-xs text-navy-600/70">
            {ready
              ? "Ready — waiting on the letter template. Send it over and this button will render and download the document."
              : "Fill in the job name and subcontractor. The letter template is still to come."}
          </p>
        </div>
      </section>
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
