"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import AwardPanel from "./AwardPanel";
import ExtractPanel from "./ExtractPanel";
import FileDrop from "./FileDrop";
import LetterPanel, { type LetterFields } from "./LetterPanel";
import PreviewPanel from "./PreviewPanel";
import HistoryRail from "./HistoryRail";
import StepRail, { type Step } from "./StepRail";
import {
  DEMO_SITE_COVERAGES,
  calculateAward,
  groupByCoverage,
  suggestBaseCoverages,
} from "@/lib/award";
import { coverageLabel, extract } from "@/lib/extract";
import { buildCsv, buildScopeCsv, downloadCsv, summaryText } from "@/lib/export";
import { parseWorkbook } from "@/lib/parse";
import { DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from "@/lib/prefs";
import {
  getServerSnapshot,
  getSnapshot,
  newId,
  remove as removeRecord,
  clear as clearHistory,
  subscribe,
  upsert,
  type AwardRecord,
} from "@/lib/history";
import type { ParseResult } from "@/lib/types";

type StepId = "upload" | "extract" | "preview" | "award" | "letter";

const EMPTY_LETTER: LetterFields = {
  jobName: "",
  jobAddress: "",
  subcontractor: "",
  scopeOfWork: "",
  jobType: "",
};

export default function AwardApp() {
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<StepId>("upload");
  const [showIgnored, setShowIgnored] = useState(false);
  const [copied, setCopied] = useState(false);

  const [keptCoverages, setKeptCoverages] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  // localStorage is an external store, so it is read through the subscription
  // API rather than an effect — that also keeps the server render empty and
  // avoids a hydration mismatch.
  const history = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [lessOandPOverride, setLessOandPOverride] = useState<number | null>(null);
  const [letter, setLetter] = useState<LetterFields>(EMPTY_LETTER);

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

  const { basis, oandpPct, tiers, selectedTier, hc } = prefs;

  const extraction = useMemo(
    () =>
      parsed
        ? extract(parsed.items, keptCoverages, DEMO_SITE_COVERAGES)
        : null,
    [parsed, keptCoverages],
  );

  const result = useMemo(
    () =>
      calculateAward(extraction?.keptGroups ?? [], {
        basis,
        baseCoverages: keptCoverages,
        oandpPct,
        lessOandPOverride,
        tiers,
        selectedTier,
        hc,
      }),
    [extraction, basis, keptCoverages, oandpPct, lessOandPOverride, tiers, selectedTier, hc],
  );

  const handleFile = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const next = parseWorkbook(buffer);
      const groups = groupByCoverage(next.items);

      const stored = loadPrefs();
      prefsRef.current = stored;
      setPrefsState(stored);

      setParsed(next);
      setFileName(file.name);
      setKeptCoverages(suggestBaseCoverages(groups));
      setLessOandPOverride(null);
      setLetter(EMPTY_LETTER);
      setShowIgnored(false);
      setActiveId(null);
      setRestoredAt(null);
      setSaveNote(null);
      setStep("extract");
    } catch (e) {
      setParsed(null);
      setFileName(null);
      setError(e instanceof Error ? e.message : "Could not read that file.");
    } finally {
      setBusy(false);
    }
  }, []);

  const ctx =
    parsed && extraction
      ? {
          fileName: fileName ?? "scope",
          basis,
          oandpPct,
          baseCoverages: keptCoverages,
          groups: extraction.allCoverages,
          items: extraction.items,
          result,
        }
      : null;

  function saveAward() {
    if (!parsed) return;
    const chosen = result.tierRows.find((r) => r.selected);
    const now = new Date().toISOString();
    const existing = history.find((r) => r.id === activeId);

    const record: AwardRecord = {
      id: existing?.id ?? newId(),
      savedAt: existing?.savedAt ?? now,
      updatedAt: now,
      fileName: fileName ?? "scope",
      sheetName: parsed.sheetName,
      headerRow: parsed.headerRow,
      letter: { ...letter },
      settings: {
        basis,
        keptCoverages: [...keptCoverages],
        oandpPct,
        lessOandPOverride,
        tiers: [...tiers],
        selectedTier,
        hc,
      },
      totals: {
        base: result.base,
        lessOandP: result.lessOandP,
        subsPct: chosen ? chosen.pct : null,
        subsAmount: chosen ? chosen.amount : 0,
        hc: result.hc,
        award: result.award,
      },
      items: parsed.items,
    };

    const { evicted } = upsert(record);
    setActiveId(record.id);
    setRestoredAt(null);
    setSaveNote(
      evicted > 0
        ? `Saved. ${evicted} older award${evicted === 1 ? "" : "s"} dropped to make room.`
        : existing
          ? "Award updated"
          : "Award saved",
    );
    setTimeout(() => setSaveNote(null), 2600);
  }

  function openRecord(record: AwardRecord) {
    setParsed({
      sheetName: record.sheetName,
      headerRow: record.headerRow,
      items: record.items,
      ignored: [],
      mappedColumns: {},
    });
    setFileName(record.fileName);
    setKeptCoverages([...record.settings.keptCoverages]);
    setLessOandPOverride(record.settings.lessOandPOverride);
    // jobType arrived later than the first saved awards, so default it.
    setLetter({ ...EMPTY_LETTER, ...record.letter });

    const restored: Prefs = {
      basis: record.settings.basis,
      oandpPct: record.settings.oandpPct,
      tiers: [...record.settings.tiers],
      selectedTier: record.settings.selectedTier,
      hc: record.settings.hc,
    };
    prefsRef.current = restored;
    setPrefsState(restored);

    setActiveId(record.id);
    setRestoredAt(record.updatedAt);
    setSaveNote(null);
    setError(null);
    setShowIgnored(false);
    setStep("award");
  }

  function deleteRecord(id: string) {
    removeRecord(id);
    if (id === activeId) {
      setActiveId(null);
      setRestoredAt(null);
    }
  }

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

  const loaded = Boolean(parsed && extraction);
  const steps: Step[] = [
    { id: "upload", label: "Upload", hint: "Raw scope export", enabled: true },
    { id: "extract", label: "Extract", hint: "Choose coverages", enabled: loaded },
    { id: "preview", label: "Preview", hint: "Structured lines", enabled: loaded },
    { id: "award", label: "Award", hint: "Totals & subs %", enabled: loaded },
    { id: "letter", label: "Award Letter", hint: "Generate document", enabled: loaded },
  ];

  const base = fileName ? fileName.replace(/\.[^.]+$/, "") : "scope";

  return (
    <div className="mx-auto w-full max-w-[94rem] px-4 py-6 sm:px-6 lg:py-8">
      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-6">
        <HistoryRail
          records={history}
          activeId={activeId}
          onOpen={openRecord}
          onDelete={deleteRecord}
          onClear={() => {
            clearHistory();
            setActiveId(null);
            setRestoredAt(null);
          }}
        />

        <div className="min-w-0">
      <StepRail steps={steps} current={step} onSelect={(id) => setStep(id as StepId)} />

      {loaded && parsed && extraction && ctx && (
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
              {parsed.headerRow} &middot; {parsed.items.length} raw lines
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
              {restoredAt && (
                <>
                  {" · "}
                  <span className="font-medium text-navy-700">
                    restored from history
                  </span>
                </>
              )}
              {saveNote && (
                <>
                  {" · "}
                  <span className="font-semibold text-brand-red">{saveNote}</span>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() =>
                downloadCsv(`${base} - extracted scope.csv`, buildScopeCsv(extraction, basis))
              }
            >
              Export scope
            </Button>
            <Button onClick={copySummary}>{copied ? "Copied" : "Copy summary"}</Button>
            <Button onClick={() => downloadCsv(`${base} - award.csv`, buildCsv(ctx))}>
              Download CSV
            </Button>
            <Button onClick={() => window.print()}>Print</Button>
            <Button variant="primary" onClick={saveAward}>
              {activeId ? "Update award" : "Save award"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setParsed(null);
                setFileName(null);
                setError(null);
                setStep("upload");
              }}
            >
              New file
            </Button>
          </div>
        </div>
      )}

      {showIgnored && parsed && (
        <div className="no-print mb-5 rounded-lg border border-navy-200 bg-white p-4">
          <p className="mb-2 text-xs font-semibold tracking-wide text-navy-800 uppercase">
            Rows read but not counted
          </p>
          <p className="mb-3 text-xs text-navy-600/70">
            A row becomes a line item only when it carries a Coverage value. These did
            not, so they were left out of every total &mdash; usually the
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

      {step === "upload" && (
        <div className="mx-auto max-w-2xl">
          <FileDrop onFile={handleFile} busy={busy} fileName={fileName} />
          <HowItWorks />
        </div>
      )}

      {step === "extract" && extraction && (
        <ExtractPanel
          extraction={extraction}
          basis={basis}
          onBasis={(next) => updatePrefs({ basis: next })}
          onToggle={(coverage) =>
            setKeptCoverages((prev) =>
              prev.includes(coverage)
                ? prev.filter((c) => c !== coverage)
                : [...prev, coverage],
            )
          }
          onSet={setKeptCoverages}
        />
      )}

      {step === "preview" && extraction && (
        <PreviewPanel extraction={extraction} basis={basis} />
      )}

      {step === "award" && extraction && (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
          {/* min-w-0: a grid item defaults to min-width:auto, so the wide
              preview table would otherwise push the page sideways. */}
          <div className="min-w-0">
            <PreviewPanel extraction={extraction} basis={basis} />
          </div>
          <div className="min-w-0 lg:sticky lg:top-6">
            <AwardPanel
              result={result}
              oandpPct={oandpPct}
              tiers={tiers}
              selectedTier={selectedTier}
              baseCount={keptCoverages.length}
              baseLabel={coverageLabel(keptCoverages)}
              onOandP={(v) => updatePrefs({ oandpPct: v })}
              onLessOandP={setLessOandPOverride}
              onResetLessOandP={() => setLessOandPOverride(null)}
              onHc={(v) => updatePrefs({ hc: v })}
              onSelectTier={(i) => updatePrefs({ selectedTier: i })}
              onTier={(i, v) =>
                updatePrefs({ tiers: tiers.map((t, j) => (j === i ? v : t)) })
              }
              onAddTier={() =>
                updatePrefs({
                  tiers: [...tiers, tiers.length ? tiers[tiers.length - 1] + 5 : 50],
                })
              }
              onRemoveTier={(i) =>
                updatePrefs({
                  tiers: tiers.filter((_, j) => j !== i),
                  selectedTier:
                    selectedTier > i
                      ? selectedTier - 1
                      : selectedTier === i
                        ? 0
                        : selectedTier,
                })
              }
            />
          </div>
        </div>
      )}

      {step === "letter" && (
        <LetterPanel
          fields={letter}
          onField={(patch) => setLetter((prev) => ({ ...prev, ...patch }))}
          result={result}
          onHc={(v) => updatePrefs({ hc: v })}
          coverages={keptCoverages}
        />
      )}

      {loaded && step !== "upload" && (
        <StepNav
          steps={steps}
          current={step}
          onSelect={(id) => setStep(id as StepId)}
        />
      )}
        </div>
      </div>
    </div>
  );
}

function StepNav({
  steps,
  current,
  onSelect,
}: {
  steps: Step[];
  current: string;
  onSelect: (id: string) => void;
}) {
  const i = steps.findIndex((s) => s.id === current);
  const prev = i > 0 ? steps[i - 1] : null;
  const next = i < steps.length - 1 ? steps[i + 1] : null;
  return (
    <div className="no-print mt-5 flex items-center justify-between">
      {prev ? (
        <button
          type="button"
          onClick={() => onSelect(prev.id)}
          className="rounded-md border border-navy-200 bg-white px-3.5 py-2 text-sm font-medium text-navy-700 hover:bg-navy-50"
        >
          &larr; {prev.label}
        </button>
      ) : (
        <span />
      )}
      {next && (
        <button
          type="button"
          onClick={() => onSelect(next.id)}
          className="rounded-md bg-navy-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-navy-800"
        >
          {next.label} &rarr;
        </button>
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
  variant?: "solid" | "ghost" | "primary";
}) {
  const styles = {
    solid:
      "border border-navy-200 bg-white text-navy-700 hover:border-navy-300 hover:bg-navy-50",
    primary: "bg-navy-700 text-white hover:bg-navy-800",
    ghost: "text-navy-600/80 hover:text-brand-red",
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="mb-5 rounded-lg border border-brand-red/30 bg-brand-red-50 px-4 py-3 text-sm text-brand-red-dark"
    >
      {message}
    </p>
  );
}

const STEPS: [string, string][] = [
  ["Upload", "Drop the raw scope export straight out of the estimating system."],
  ["Extract", "Pick any coverages to build the base from. CE-DEMO and CE-SITE are ticked for you."],
  ["Preview", "The extracted lines, plus a totals view rolled up by coverage and group."],
  ["Less O&P", "Selected total ÷ 1.32, editable if you need to override it."],
  ["Subs %", "Prefilled at 50 / 55 / 60 — edit the rates and pick which applies."],
  ["Award", "HC plus the selected subs percentage."],
];

function HowItWorks() {
  return (
    <div className="mt-8 rounded-xl border border-navy-100 bg-white/60 p-5">
      <h2 className="text-xs font-semibold tracking-wide text-navy-800 uppercase">
        How it works
      </h2>
      <dl className="mt-3 space-y-2.5">
        {STEPS.map(([term, detail]) => (
          <div key={term} className="grid grid-cols-[6rem_1fr] gap-3 text-sm">
            <dt className="font-semibold text-navy-700">{term}</dt>
            <dd className="text-navy-600/80">{detail}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
