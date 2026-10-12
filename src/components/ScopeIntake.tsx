"use client";

import { useState } from "react";
import FileDrop from "./FileDrop";
import LookupField from "./LookupField";
import { loadJobs } from "@/lib/qb-client";
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
 *
 * The first gate is passed by choosing an award, not by naming a
 * subcontractor. A case can be awarded to several subcontractors, and one
 * subcontractor can hold several purchase orders on it, so naming the
 * subcontractor and taking their latest purchase order answered a different
 * question. The case's own awards are offered instead, and the one being
 * revised is picked from them.
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
  /** Who it was awarded to, read from the purchase order rather than asked. */
  subRecordId: number;
  subcontractor: string;
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

/**
 * The first line of the purchase order's scope.
 *
 * Scope holds the whole award letter, so printing it whole ran the award
 * letter's body through a one-line label. The opening line is what tells one
 * award on a case from another.
 */
function firstLine(text: string | undefined): string {
  return (
    (text ?? "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean) ?? ""
  );
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
  /* Kept so the steps after the upload open filled in rather than blank. */
  const [jobAddress, setJobAddress] = useState("");
  const [jobType, setJobType] = useState("");
  /** The awards on the chosen case, and which of them is being revised. */
  const [awards, setAwards] = useState<ExistingAward[] | null>(null);
  const [looking, setLooking] = useState(false);
  const [award, setAward] = useState<ExistingAward | null>(null);
  /** What the award field shows, which is not the award itself. */
  const [awardLabel, setAwardLabel] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const changing = intent === "scope-change";

  function reset() {
    setAwards(null);
    setAward(null);
    setAwardLabel("");
    setProblem(null);
  }

  /**
   * Gate one: the case has to have an award to change.
   *
   * Read as soon as the case is chosen, because the answer is a list to pick
   * from rather than a yes or no — there is nothing to confirm first.
   */
  async function loadAwards(recordId: string) {
    reset();
    if (!recordId) return;
    setLooking(true);
    try {
      const res = await fetch(`/api/qb/scope-change?job=${encodeURIComponent(recordId)}`);
      const body = await res.json();
      if (!body.ok) {
        setProblem(body.error ?? "Could not read the awards on this case.");
        return;
      }
      const found: ExistingAward[] = body.awards ?? [];
      setAwards(found);
      // One award is not a choice, so it is made.
      if (found.length === 1) {
        setAward(found[0]);
        setAwardLabel(`${found[0].poNumber}  ·  ${money(found[0].contract)}`);
      }
    } catch {
      setProblem("Could not reach Quickbase.");
    } finally {
      setLooking(false);
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
      // From the purchase order itself, so it is the award's own vendor.
      subRecordId: String(award.subRecordId),
      subcontractor: award.subcontractor,
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
              Pick the case, then the purchase order this revised scope
              belongs to. Only its awarded purchase orders are offered.
            </p>
            <div className="sm:max-w-sm">
              <LookupField
                label="Case"
                value={job}
                placeholder="Case number or job name"
                region={region}
                onChange={(v, extra) => {
                  setJob(v);
                  const recordId = extra?.recordId ?? "";
                  setJobRecordId(recordId);
                  setJobAddress(extra?.address ?? "");
                  setJobType(extra?.jobType ?? "");
                  void loadAwards(recordId);
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
            </div>

            {looking ? (
              <p className="mt-3 text-xs text-navy-600/70">
                Looking for awards on this case…
              </p>
            ) : null}

            {awards && awards.length === 0 ? (
              <p className="mt-3 rounded-lg border border-brand-red/30 bg-brand-red-50 px-3 py-2 text-xs leading-relaxed text-brand-red-dark">
                {job || "That case"} has no awarded purchase order, so there is
                nothing for a scope change to land on. Upload it as a new scope
                instead.
              </p>
            ) : null}

            {awards && awards.length > 0 ? (
              <div className="mt-4">
                {/*
                  * A searchable field rather than a list of every award.
                  *
                  * A case can carry twenty or more purchase orders, and a
                  * list of that many pushes the upload off the bottom of the
                  * screen — the award is chosen, then the page has to be
                  * scrolled back up to use it. One row stays one row whatever
                  * the case holds, and types ahead on the purchase order
                  * number or the subcontractor.
                  *
                  * Keyed by the case so the options are the case's own: this
                  * field caches what it loaded, and without the key the second
                  * case asked about would still offer the first one's awards.
                  */}
                <LookupField
                  key={jobRecordId}
                  label={awards.length === 1 ? "Award" : `Award (${awards.length} on this case)`}
                  value={awardLabel}
                  placeholder="PO number or subcontractor"
                  region={region}
                  onChange={(v, extra) => {
                    setAwardLabel(v);
                    const picked = extra?.recordId
                      ? (awards.find((a) => String(a.poRecordId) === extra.recordId) ?? null)
                      : null;
                    setAward(picked);
                    setProblem(null);
                  }}
                  loadChoices={async () => ({
                    configured: true,
                    choices: awards.map((a) => ({
                      id: String(a.poRecordId),
                      label: `${a.poNumber}  ·  ${money(a.contract)}`,
                      hint: [
                        a.subcontractor,
                        `awarded ${shortDate(a.awardedOn)}`,
                        firstLine(a.scope || a.title),
                      ]
                        .filter(Boolean)
                        .join("  ·  "),
                      extra: { recordId: String(a.poRecordId) },
                    })),
                  })}
                />

                {award ? (
                  <p className="mt-3 rounded-lg border border-navy-200 bg-navy-50 px-3 py-2 text-xs leading-relaxed text-navy-700">
                    Revising {award.poNumber}
                    {award.subcontractor ? ` to ${award.subcontractor}` : ""}, awarded
                    on {shortDate(award.awardedOn)} at{" "}
                    <strong className="tabular">{money(award.contract)}</strong>. Upload
                    the revised scope below; it has to be newer than that.
                  </p>
                ) : null}
              </div>
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

      {!changing || award ? (
        <FileDrop onFile={handleFile} busy={busy} fileName={fileName} />
      ) : (
        <p className="rounded-xl border border-dashed border-navy-200 bg-white px-4 py-8 text-center text-sm text-navy-600/60">
          Pick the case, then the award being revised, before uploading the
          revised scope.
        </p>
      )}
    </div>
  );
}
