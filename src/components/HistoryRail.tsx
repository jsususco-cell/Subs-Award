"use client";

import { useState } from "react";
import { money } from "@/lib/format";
import { recordTitle, type AwardRecord } from "@/lib/history";

interface Props {
  records: AwardRecord[];
  activeId: string | null;
  onOpen: (record: AwardRecord) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}

export default function HistoryRail({
  records,
  activeId,
  onOpen,
  onDelete,
  onClear,
}: Props) {
  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <aside className="no-print mb-5 lg:mb-0">
      <div className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm lg:sticky lg:top-6">
        <header className="flex items-center justify-between gap-2 border-b border-navy-100 px-3 py-2.5">
          <h2 className="text-xs font-semibold tracking-wide text-navy-800 uppercase">
            History
            {records.length > 0 && (
              <span className="ml-1.5 rounded-full bg-navy-100 px-1.5 py-0.5 text-[10px] font-bold text-navy-700">
                {records.length}
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="rounded px-1.5 py-0.5 text-xs font-medium text-navy-600 hover:bg-navy-50 lg:hidden"
          >
            {open ? "Hide" : "Show"}
          </button>
        </header>

        <div className={`${open ? "block" : "hidden"} lg:block`}>
          {records.length === 0 ? (
            <p className="px-3 py-6 text-xs leading-relaxed text-navy-600/70">
              Saved awards land here. Use <strong>Save award</strong> once the figures
              are right, then come back to review or revise it.
            </p>
          ) : (
            <ul className="max-h-[26rem] divide-y divide-navy-50 overflow-auto">
              {records.map((record) => {
                const active = record.id === activeId;
                return (
                  <li key={record.id} className={active ? "bg-navy-50" : ""}>
                    <div className="group relative">
                      <button
                        type="button"
                        onClick={() => onOpen(record)}
                        aria-current={active ? "true" : undefined}
                        className="w-full px-3 py-2.5 pr-8 text-left transition hover:bg-navy-50"
                      >
                        <span
                          className={`block truncate text-sm font-semibold ${
                            active ? "text-navy-900" : "text-navy-800"
                          }`}
                          title={recordTitle(record)}
                        >
                          {recordTitle(record)}
                        </span>
                        {record.letter.subcontractor.trim() &&
                          record.letter.subcontractor.trim() !==
                            recordTitle(record) && (
                            <span className="block truncate text-xs text-navy-600/80">
                              {record.letter.subcontractor}
                            </span>
                          )}
                        <span className="mt-1 flex items-baseline justify-between gap-2">
                          <span className="tabular text-xs font-bold text-brand-red">
                            {money(record.totals.award)}
                          </span>
                          <span className="text-[10px] text-navy-600/60">
                            {when(record.updatedAt)}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-navy-600/60">
                          {record.settings.keptCoverages.join(" + ") || "no coverages"}
                          {record.totals.subsPct !== null &&
                            ` · ${record.totals.subsPct}%`}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(record.id)}
                        aria-label={`Delete ${recordTitle(record)}`}
                        className="absolute top-2 right-1.5 rounded px-1.5 py-0.5 text-navy-300 opacity-0 transition group-hover:opacity-100 hover:bg-navy-100 hover:text-brand-red focus-visible:opacity-100"
                      >
                        &times;
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {records.length > 0 && (
            <footer className="border-t border-navy-100 px-3 py-2">
              {confirmClear ? (
                <span className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-navy-700">Delete all {records.length}?</span>
                  <span className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        onClear();
                        setConfirmClear(false);
                      }}
                      className="rounded bg-brand-red px-2 py-0.5 font-semibold text-white hover:bg-brand-red-dark"
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClear(false)}
                      className="rounded px-2 py-0.5 font-medium text-navy-600 hover:bg-navy-50"
                    >
                      No
                    </button>
                  </span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="text-xs font-medium text-navy-600/70 hover:text-brand-red"
                >
                  Clear history
                </button>
              )}
            </footer>
          )}

          <p className="border-t border-navy-100 bg-navy-50/50 px-3 py-2 text-[10px] leading-relaxed text-navy-600/70">
            Stored in this browser only — not shared with other devices or teammates.
          </p>
        </div>
      </div>
    </aside>
  );
}

/** A short, readable stamp. Absolute once it is no longer today. */
function when(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";

  const now = new Date();
  const sameDay = then.toDateString() === now.toDateString();
  if (sameDay) {
    return then.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (then.toDateString() === yesterday.toDateString()) return "Yesterday";

  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
