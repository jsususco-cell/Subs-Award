"use client";

import { useEffect, useMemo, useState } from "react";
import { money } from "@/lib/format";
import type { ApprovedItem } from "@/lib/fondo-server";

/**
 * The Approved tab: every poliza that counts.
 *
 * Two kinds sit here. Polizas approved through the review queue, with who
 * approved them and when, and the older polizas that were already on file
 * before the queue existed — those were never reviewed here and say so.
 * Coverage is Quickbase's own Coverage Status formula, not recomputed.
 *
 * The document opens in place, fetched with the send key like the review
 * queue, because these are other companies' insurance certificates.
 */

type Filter = "all" | "here" | "before" | "covered" | "attention";
type Doc = { url: string; kind: "pdf" | "image" } | { error: string } | "loading";

export default function FondoApproved({
  items,
  sendKey,
}: {
  items: ApprovedItem[];
  sendKey: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (filter === "here" && !i.approvedHere) return false;
      if (filter === "before" && i.approvedHere) return false;
      if (filter === "covered" && i.coverage !== "COVERED") return false;
      if (filter === "attention" && i.coverage === "COVERED") return false;
      if (!q) return true;
      return [i.caseNumber, i.subcontractor, i.jobName].some((s) => s.toLowerCase().includes(q));
    });
  }, [items, filter, query]);

  // Load the document for the open row; drop the blob when it closes.
  useEffect(() => {
    if (open === null || !sendKey) return;
    let cancelled = false;
    let made = "";
    (async () => {
      try {
        const res = await fetch(`/api/fondo/poliza?recordId=${open}&doc=record`, {
          headers: { "x-send-key": sendKey },
        });
        if (cancelled) return;
        if (!res.ok) {
          setDoc({
            error:
              res.status === 401
                ? "The send key is not right, so the document cannot be shown."
                : "The document could not be loaded.",
          });
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;
        made = URL.createObjectURL(blob);
        setDoc({ url: made, kind: blob.type.startsWith("image/") ? "image" : "pdf" });
      } catch {
        if (!cancelled) setDoc({ error: "The document could not be loaded." });
      }
    })();
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [open, sendKey]);

  function toggle(recordId: number) {
    setDoc(open === recordId ? null : "loading");
    setOpen(open === recordId ? null : recordId);
  }

  const here = items.filter((i) => i.approvedHere).length;
  const filters: [Filter, string][] = [
    ["all", "All"],
    ["here", `Approved here (${here})`],
    ["before", `On file before (${items.length - here})`],
    ["covered", "Covered"],
    ["attention", "Needs attention"],
  ];

  const viewer =
    open === null ? null : !sendKey ? (
      <p className="px-4 py-3 text-xs text-navy-600/70">
        Enter the send key above to read the document here.
      </p>
    ) : doc === "loading" || doc === null ? (
      <p className="px-4 py-3 text-xs text-navy-600/70">Loading the document…</p>
    ) : "error" in doc ? (
      <p className="px-4 py-3 text-xs text-brand-red-dark">{doc.error}</p>
    ) : doc.kind === "image" ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={doc.url} alt="Poliza" className="mx-auto max-h-[560px] rounded border border-navy-200 bg-white" />
    ) : (
      <iframe src={doc.url} title="Poliza" className="h-[560px] w-full rounded border border-navy-200 bg-white" />
    );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {filters.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
              filter === key
                ? "border-navy-700 bg-navy-700 text-white"
                : "border-navy-200 bg-white text-navy-700 hover:bg-navy-50"
            }`}
          >
            {label}
          </button>
        ))}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search case or sub"
          aria-label="Search approved polizas"
          className="ml-auto w-full rounded-md border border-navy-200 px-2.5 py-1.5 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20 sm:w-60"
        />
      </div>

      {!shown.length && (
        <div className="rounded-xl border border-navy-200 bg-white px-4 py-6 text-center text-sm text-navy-600/70 shadow-sm">
          Nothing here.
        </div>
      )}

      <div className="space-y-2">
        {shown.map((i) => (
          <div
            key={i.recordId}
            className="overflow-hidden rounded-xl border border-navy-200 bg-white text-sm shadow-sm"
          >
            <div className="grid grid-cols-2 items-center gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[1.1fr_1.6fr_1fr_1fr_1.2fr_1.6fr_auto]">
              <div className="min-w-0">
                <div className="font-semibold whitespace-nowrap text-navy-800">{i.caseNumber || "—"}</div>
                <div className="truncate text-xs text-navy-600/70 md:hidden">{i.subcontractor}</div>
              </div>
              <div className="hidden min-w-0 text-navy-800 md:block">{i.subcontractor || "—"}</div>
              <div className="text-right md:text-right">
                <div className="text-[11px] text-navy-600 md:hidden">Poliza</div>
                <div className="tabular font-semibold text-navy-800">
                  {i.insuranceAmount ? money(i.insuranceAmount) : "—"}
                </div>
              </div>
              <div className="text-left md:text-right">
                <div className="text-[11px] text-navy-600 md:hidden">Awarded</div>
                <div className="tabular text-navy-800">
                  {i.awardedAmount ? money(i.awardedAmount) : "—"}
                </div>
              </div>
              <div className="text-right md:text-left">
                <CoveragePill coverage={i.coverage} />
              </div>
              <div className="col-span-2 text-xs text-navy-600 md:col-span-1">
                {i.approvedHere ? (
                  <>
                    <span className="font-semibold text-emerald-700">Approved</span>
                    {i.reviewedBy && <> by {i.reviewedBy}</>}
                    {i.reviewedAt && <> · {formatDay(i.reviewedAt)}</>}
                  </>
                ) : (
                  <span title={i.source}>On file before review{i.dateSubmitted && <> · {formatDay(i.dateSubmitted)}</>}</span>
                )}
              </div>
              <div className="col-span-2 text-right md:col-span-1">
                {i.polizaName ? (
                  <button
                    type="button"
                    onClick={() => toggle(i.recordId)}
                    className="rounded-md border border-navy-200 bg-white px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-navy-700 hover:bg-navy-50"
                  >
                    {open === i.recordId ? "Hide poliza" : "View poliza"}
                  </button>
                ) : (
                  <span className="text-xs text-brand-red-dark">No document</span>
                )}
              </div>
            </div>
            {open === i.recordId && (
              <div className="border-t border-navy-100 bg-navy-50 p-3">
                <p className="mb-2 truncate text-xs font-medium text-navy-700">{i.polizaName}</p>
                {viewer}
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-navy-600/70">
        Approved here = approved through the review queue. On file before review = the
        poliza was already on the case before this page existed and nobody has reviewed it
        here. Coverage is Quickbase&rsquo;s Coverage Status field. Approved polizas are never
        listed in Send link.
      </p>
    </div>
  );
}

function CoveragePill({ coverage }: { coverage: string }) {
  const cls =
    coverage === "COVERED"
      ? "bg-emerald-50 text-emerald-700"
      : coverage === "SHORT"
        ? "bg-amber-50 text-amber-800"
        : "bg-brand-red-50 text-brand-red-dark";
  const label =
    coverage === "COVERED"
      ? "Covered"
      : coverage === "SHORT"
        ? "Short"
        : coverage
          ? coverage.charAt(0) + coverage.slice(1).toLowerCase()
          : "—";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${cls}`}>
      {label}
    </span>
  );
}

function formatDay(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
