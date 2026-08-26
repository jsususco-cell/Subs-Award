"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import CoveragePanel from "./CoveragePanel";
import FileDrop from "./FileDrop";
import LineItemsTable from "./LineItemsTable";
import SummaryPanel from "./SummaryPanel";
import {
  calculateAward,
  findHcGroup,
  groupAmount,
  groupByCoverage,
  suggestBaseCoverages,
} from "@/lib/award";
import { buildCsv, downloadCsv, summaryText } from "@/lib/export";
import { parseWorkbook } from "@/lib/parse";
import { DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from "@/lib/prefs";
import type { ParseResult } from "@/lib/types";

export default function AwardApp() {
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showIgnored, setShowIgnored] = useState(false);
  const [copied, setCopied] = useState(false);

  const [baseCoverages, setBaseCoverages] = useState<string[]>([]);
  const [hc, setHc] = useState(0);

  // Preferences start at the defaults so the server and the first client render
  // agree, then the stored set is applied when a file is loaded — always a
  // client-side event, so there is no hydration mismatch and no effect needed.
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const prefsRef = useRef<Prefs>(DEFAULT_PREFS);

  const updatePrefs = useCallback((patch: Partial<Prefs>) => {
    const next = { ...prefsRef.current, ...patch };
    prefsRef.current = next;
    setPrefsState(next);
    savePrefs(next);
  }, []);

  const { basis, oandpPct, tiers, selectedTier } = prefs;

  const groups = useMemo(() => (parsed ? groupByCoverage(parsed.items) : []), [parsed]);
  const hcGroup = useMemo(() => findHcGroup(groups), [groups]);

  const result = useMemo(
    () =>
      calculateAward(groups, {
        basis,
        baseCoverages,
        oandpPct,
        tiers,
        selectedTier,
        hc,
      }),
    [groups, basis, baseCoverages, oandpPct, tiers, selectedTier, hc],
  );

  const handleFile = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const next = parseWorkbook(buffer);
      const nextGroups = groupByCoverage(next.items);

      const stored = loadPrefs();
      prefsRef.current = stored;
      setPrefsState(stored);

      setParsed(next);
      setFileName(file.name);
      setBaseCoverages(suggestBaseCoverages(nextGroups));
      setHc(0);
      setShowIgnored(false);
    } catch (e) {
      setParsed(null);
      setFileName(null);
      setError(e instanceof Error ? e.message : "Could not read that file.");
    } finally {
      setBusy(false);
    }
  }, []);

  const ctx = parsed
    ? {
        fileName: fileName ?? "scope",
        basis,
        oandpPct,
        baseCoverages,
        groups,
        items: parsed.items,
        result,
      }
    : null;

  async function copySummary() {
    if (!ctx) return;
    try {
      await navigator.clipboard.writeText(summaryText(ctx));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Could not copy to the clipboard. Use Download CSV instead.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      {!parsed && (
        <div className="mx-auto max-w-2xl">
          <FileDrop onFile={handleFile} busy={busy} fileName={fileName} />
          {error && <ErrorNote message={error} />}
          <HowItWorks />
        </div>
      )}

      {parsed && ctx && (
        <>
          <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p
                className="truncate text-sm font-semibold text-navy-800"
                title={fileName ?? ""}
              >
                {fileName}
              </p>
              <p className="mt-0.5 text-xs text-navy-600/70">
                Sheet &ldquo;{parsed.sheetName}&rdquo; &middot; header on row{" "}
                {parsed.headerRow} &middot; {parsed.items.length} line items
                {parsed.ignored.length > 0 && (
                  <>
                    {" · "}
                    <button
                      type="button"
                      onClick={() => setShowIgnored((v) => !v)}
                      className="font-medium underline underline-offset-2 hover:text-brand-red"
                    >
                      {parsed.ignored.length} row
                      {parsed.ignored.length === 1 ? "" : "s"} skipped
                    </button>
                  </>
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={copySummary}>{copied ? "Copied" : "Copy summary"}</Button>
              <Button
                onClick={() =>
                  downloadCsv(
                    `${(fileName ?? "scope").replace(/\.[^.]+$/, "")} - award.csv`,
                    buildCsv(ctx),
                  )
                }
              >
                Download CSV
              </Button>
              <Button onClick={() => window.print()}>Print</Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setParsed(null);
                  setFileName(null);
                  setError(null);
                }}
              >
                New file
              </Button>
            </div>
          </div>

          {showIgnored && (
            <div className="no-print mb-5 rounded-lg border border-navy-200 bg-white p-4">
              <p className="mb-2 text-xs font-semibold tracking-wide text-navy-800 uppercase">
                Rows read but not counted
              </p>
              <p className="mb-3 text-xs text-navy-600/70">
                A row becomes a line item only when it carries a Coverage value. These
                did not, so they were left out of every total &mdash; usually the
                worksheet&rsquo;s own summary block.
              </p>
              <ul className="space-y-1 text-xs text-navy-600">
                {parsed.ignored.slice(0, 40).map((r) => (
                  <li key={r.row} className="tabular">
                    <span className="text-navy-300">row {r.row}</span>{" "}
                    {r.preview || <em>blank</em>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && <ErrorNote message={error} />}

          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="space-y-5">
              <CoveragePanel
                groups={groups}
                selected={baseCoverages}
                basis={basis}
                onBasis={(next) => updatePrefs({ basis: next })}
                onToggle={(coverage) =>
                  setBaseCoverages((prev) =>
                    prev.includes(coverage)
                      ? prev.filter((c) => c !== coverage)
                      : [...prev, coverage],
                  )
                }
                onSelectAll={(all) =>
                  setBaseCoverages(all ? groups.map((g) => g.coverage) : [])
                }
              />
              <LineItemsTable
                items={parsed.items}
                basis={basis}
                baseCoverages={baseCoverages}
              />
            </div>

            <div className="lg:sticky lg:top-6">
              <SummaryPanel
                result={result}
                oandpPct={oandpPct}
                tiers={tiers}
                selectedTier={selectedTier}
                baseCount={baseCoverages.length}
                hcGroup={hcGroup}
                hcGroupAmount={hcGroup ? groupAmount(hcGroup, basis) : 0}
                onOandP={(v) => updatePrefs({ oandpPct: v })}
                onHc={setHc}
                onSelectTier={(i) => updatePrefs({ selectedTier: i })}
                onTier={(i, v) =>
                  updatePrefs({ tiers: tiers.map((t, j) => (j === i ? v : t)) })
                }
                onAddTier={() =>
                  updatePrefs({
                    tiers: [...tiers, tiers.length ? tiers[tiers.length - 1] : 50],
                  })
                }
                onRemoveTier={(i) =>
                  updatePrefs({
                    tiers: tiers.filter((_, j) => j !== i),
                    selectedTier:
                      selectedTier > i ? selectedTier - 1 : selectedTier === i ? 0 : selectedTier,
                  })
                }
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Button({
  children,
  onClick,
  variant = "solid",
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "solid" | "ghost";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
        variant === "solid"
          ? "border border-navy-200 bg-white text-navy-700 hover:border-navy-300 hover:bg-navy-50"
          : "text-navy-600/80 hover:text-brand-red"
      }`}
    >
      {children}
    </button>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="mt-4 rounded-lg border border-brand-red/30 bg-brand-red/5 px-4 py-3 text-sm text-brand-red-dark"
    >
      {message}
    </p>
  );
}

const STEPS: [string, string][] = [
  ["Demo/Site", "Adds up the RCV of the CE-DEMO and CE-SITE coverages."],
  ["Less O&P", "Divides that base by 1.32 to back out 32% overhead & profit."],
  ["50 / 60 / 70%", "Percentage tiers off the ex-O&P figure. Pick the one to apply."],
  ["HC", "The hard-cost allowance, typed in as an absolute amount."],
  ["Award", "HC plus the tier you selected."],
];

function HowItWorks() {
  return (
    <div className="mt-8 rounded-xl border border-navy-100 bg-white/60 p-5">
      <h2 className="text-xs font-semibold tracking-wide text-navy-800 uppercase">
        What gets calculated
      </h2>
      <dl className="mt-3 space-y-2.5">
        {STEPS.map(([term, detail]) => (
          <div key={term} className="grid grid-cols-[7.5rem_1fr] gap-3 text-sm">
            <dt className="font-semibold text-navy-700">{term}</dt>
            <dd className="text-navy-600/80">{detail}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs text-navy-600/60">
        Every coverage, percentage and rate is adjustable once the file is loaded.
      </p>
    </div>
  );
}
