"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * "History" on a Fondo case: every activity, newest first, in a dialog.
 *
 * Read from the System Log (see lib/fondo-history.ts). Steps from before
 * history was logged are rebuilt from the case's own dates and marked
 * "from the case record".
 */

type Entry = { at: string; actor: string; action: string; note: string; fromRecord: boolean };

const LABEL: Record<string, string> = {
  "case.opened": "Case opened",
  "link.sent": "Link sent",
  "link.auto-sent": "Link sent automatically",
  "reminder.sent": "Reminder sent",
  submitted: "Poliza submitted",
  approved: "Approved",
  returned: "Sent back",
};

export function HistoryButton({ recordId, caseNumber }: { recordId: number; caseNumber: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (!recordId) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-navy-600/80 underline hover:text-navy-800"
      >
        History
      </button>
      {open && <HistoryDialog recordId={recordId} caseNumber={caseNumber} onClose={close} />}
    </>
  );
}

function HistoryDialog({
  recordId,
  caseNumber,
  onClose,
}: {
  recordId: number;
  caseNumber: string;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/fondo/history?recordId=${recordId}`)
      .then((r) => r.json())
      .then((b) => {
        if (cancelled) return;
        if (b.ok) setEntries(b.entries);
        else setError(b.error ?? "History could not be loaded.");
      })
      .catch(() => !cancelled && setError("History could not be loaded."));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKey);
    };
  }, [recordId, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`History for ${caseNumber}`}
      className="fixed inset-0 z-50 flex items-start justify-center bg-navy-900/40 p-4 pt-16"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-xl border border-navy-200 bg-white text-left shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-navy-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-navy-800">History · {caseNumber}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs font-semibold text-navy-700 hover:bg-navy-50"
          >
            Close
          </button>
        </div>
        <div className="px-4 py-3">
          {error ? (
            <p className="text-xs text-brand-red-dark">{error}</p>
          ) : !entries ? (
            <p className="text-xs text-navy-600/70">Loading…</p>
          ) : !entries.length ? (
            <p className="text-xs text-navy-600/70">Nothing recorded yet.</p>
          ) : (
            <ol className="space-y-3">
              {entries.map((e, i) => (
                <li key={i} className="border-l-2 border-navy-200 pl-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-xs font-semibold text-navy-800">
                      {LABEL[e.action] ?? e.action}
                    </span>
                    <span className="text-[11px] text-navy-600/70">{when(e.at)}</span>
                  </div>
                  {e.note && <p className="mt-0.5 text-xs text-navy-700">{e.note}</p>}
                  <p className="mt-0.5 text-[11px] text-navy-600/60">
                    {e.actor && e.actor !== "system" ? e.actor : e.actor === "system" ? "Automatic" : ""}
                    {e.fromRecord ? `${e.actor ? " · " : ""}from the case record` : ""}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
