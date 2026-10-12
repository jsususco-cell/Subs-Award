"use client";

import { useState } from "react";
import FileDrop from "./FileDrop";
import LookupField from "./LookupField";
import { loadJobs, loadEverySub } from "@/lib/qb-client";
import { money } from "@/lib/format";
import type { RegionKey } from "@/lib/regions";

/**
 * What kind of upload this is, asked before the file is dropped.
 *
 * A revised scope and a first award look identical once parsed — the same
 * coverages, the same columns, a different total. Rather than guess from the
 * numbers, the person says which they are doing, and a scope change then has
 * to clear two gates before the file is even read:
 *
 *   1. the case has to be awarded already, because a change needs a contract
 *      to change and milestones to land on;
 *   2. the file has to be newer than that award, because a file saved before
 *      the award cannot be a revision of it — it is the original, or a stale
 *      copy somebody re-downloaded.
 *
 * Both are checked before the upload rather than after, so nothing is parsed
 * and no figure is shown that is about to be thrown away.
 */

export type ScopeIntent = "new" | "scope-change";

export interface ExistingAward {
  poRecordId: number;
  poNumber: string;
  contract: number;
  awardedOn: string;
  jobName: string;
  /** The purchase order's own title and scope, to carry into the letter. */
  title?: string;
  scope?: string;
}

/**
 * Everything the upload step already knows about a revision, so the steps
 * after it open filled in. The case is in the system; nothing downstream
 * should ask for it again.
 */
export interface RevisionContext {
  award: ExistingAward;
  jobRecordId: string;
  jobName: string;
  jobAddress: string;
  jobType: string;
  subRecordId: string;
  subcontractor: string;
}

interface Props {
  region: RegionKey;
  busy: boolean;
  fileName: string | null;
  /** The file, with the revision context when this is a scope change. */
  onFile: (file: File, revision: RevisionContext | null) => void;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function ScopeIntake({ region, busy, fileName, onFile }: Props) {
  const [intent, setIntent] = useState<ScopeIntent>("new");
  const [job, setJob] = useState("");
  const [jobRecordId, setJobRecordId] = useState("");
  const [sub, setSub] = useState("");
  const [subRecordId, setSubRecordId] = useState("");
  /* Kept so the steps after the upload open filled in rather than blank. */
  const [jobAddress, setJobAddress] = useState("");
  const [jobType, setJobType] = useState("");
  const [award, setAward] = useState<ExistingAward | null>(null);
  const [checked, setChecked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const changing = intent === "scope-change";
  const picked = Boolean(jobRecordId && subRecordId);

  function reset() {
    setAward(null);
    setChecked(false);
    setProblem(null);
  }

  /** Gate one: the case has to have a purchase order to change. */
  async function checkAward() {
    setChecking(true);
    setProblem(null);
    setAward(null);
    setChecked(false);
    try {
      const res = await fetch(
        `/api/qb/scope-change?job=${encodeURIComponent(jobRecordId)}&sub=${encodeURIComponent(subRecordId)}`,
      );
      const body = await res.json();
      if (!body.ok) {
        setProblem(body.error ?? "Could not check the case.");
        return;
      }
      if (!body.award) {
        setProblem(
          `${job || "That case"} has no purchase order for ${sub || "that subcontractor"}, so there is no award to change. Upload it as a new scope instead.`,
        );
        return;
      }
      setAward(body.award);
      setChecked(true);
    } catch {
      setProblem("Could not reach Quickbase.");
    } finally {
      setChecking(false);
    }
  }

  /** Gate two: the file has to postdate the award it claims to revise. */
  function handleFile(file: File) {
    if (!changing) {
      onFile(file, null);
      return;
    }
    if (!award) return;

    const awardedAt = new Date(award.awardedOn).getTime();
    if (Number.isFinite(awardedAt) && file.lastModified && file.lastModified < awardedAt) {
      setProblem(
        `That file was last saved on ${shortDate(new Date(file.lastModified).toISOString())}, before ${award.poNumber} was awarded on ${shortDate(award.awardedOn)}. A revision has to be newer than the award it revises — this looks like the original scope, or an older copy.`,
      );
      return;
    }
    setProblem(null);
    onFile(file, {
      award,
      jobRecordId,
      jobName: job,
      jobAddress,
      jobType,
      subRecordId,
      subcontractor: sub,
    });
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-navy-200 bg-white shadow-sm">
        <div className="border-b border-navy-100 px-4 py-3">
          <h2 className="text-sm font-semibold tracking-wide text-navy-700 uppercase">
            What are you uploading?
          </h2>
        </div>
        <div className="flex flex-wrap gap-2 px-4 py-3">
          {(
            [
              { id: "new" as const, label: "New scope", hint: "A case being awarded for the first time." },
              {
                id: "scope-change" as const,
                label: "Scope change",
                hint: "A revised scope for a case that is already awarded.",
              },
            ]
          ).map((o) => {
            const active = intent === o.id;
            return (
              <label
                key={o.id}
                title={o.hint}
                className={`flex min-w-0 flex-1 basis-40 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition ${
                  active
                    ? "border-navy-600 bg-navy-50 ring-1 ring-navy-600/30"
                    : "border-navy-200 bg-white hover:bg-navy-50/50"
                }`}
              >
                <input
                  type="radio"
                  name="intent"
                  checked={active}
                  onChange={() => {
                    setIntent(o.id);
                    reset();
                  }}
                  className="h-3.5 w-3.5 shrink-0 accent-[var(--color-navy-700)]"
                />
                <span
                  className={`text-sm leading-tight ${
                    active ? "font-semibold text-navy-800" : "font-medium text-navy-700"
                  }`}
                >
                  {o.label}
                </span>
              </label>
            );
          })}
        </div>

        {changing ? (
          <div className="border-t border-navy-100 px-4 py-3">
            <p className="mb-3 text-xs leading-relaxed text-navy-600/70">
              Pick the case and the subcontractor first. The award has to exist
              before a change can land on it.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <LookupField
                label="Case"
                value={job}
                placeholder="Case number or job name"
                region={region}
                onChange={(v, extra) => {
                  setJob(v);
                  setJobRecordId(extra?.recordId ?? "");
                  setJobAddress(extra?.address ?? "");
                  setJobType(extra?.jobType ?? "");
                  reset();
                }}
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
                        recordId: j.id,
                        address: j.address ?? "",
                        jobType: j.jobType ?? "",
                      },
                    })),
                  };
                }}
              />
              <LookupField
                label="Subcontractor"
                value={sub}
                placeholder="Company name"
                region={region}
                onChange={(v, extra) => {
                  setSub(v);
                  setSubRecordId(extra?.recordId ?? "");
                  reset();
                }}
                loadChoices={async () => {
                  const r = await loadEverySub(region);
                  return {
                    configured: r.configured,
                    warning: r.warning,
                    error: r.error,
                    choices: r.items.map((v) => ({
                      id: v.id,
                      label: v.company,
                      hint: [v.trade, v.email].filter(Boolean).join("  ·  "),
                      extra: { recordId: v.id },
                    })),
                  };
                }}
              />
            </div>

            <button
              type="button"
              onClick={checkAward}
              disabled={!picked || checking}
              className="mt-3 rounded-md bg-navy-700 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-navy-800 disabled:cursor-not-allowed disabled:bg-navy-200 disabled:text-navy-600/60"
            >
              {checking ? "Checking…" : "Check the award"}
            </button>

            {award && checked ? (
              <p className="mt-3 rounded-lg border border-navy-200 bg-navy-50 px-3 py-2 text-xs leading-relaxed text-navy-700">
                {award.poNumber} was awarded on {shortDate(award.awardedOn)} at{" "}
                <strong className="tabular">{money(award.contract)}</strong>. Upload the
                revised scope below; it has to be newer than that.
              </p>
            ) : null}
          </div>
        ) : null}

        {problem ? (
          <p
            role="alert"
            className="mx-4 mb-4 rounded-lg border border-brand-red/30 bg-brand-red-50 px-3 py-2 text-sm leading-relaxed text-brand-red-dark"
          >
            {problem}
          </p>
        ) : null}
      </section>

      {!changing || checked ? (
        <FileDrop onFile={handleFile} busy={busy} fileName={fileName} />
      ) : (
        <p className="rounded-xl border border-dashed border-navy-200 bg-white px-4 py-8 text-center text-sm text-navy-600/60">
          Pick the case and subcontractor, then check the award, before uploading
          the revised scope.
        </p>
      )}
    </div>
  );
}
