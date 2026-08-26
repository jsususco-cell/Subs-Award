"use client";

import { useState } from "react";

interface Props {
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
  className?: string;
  ariaLabel: string;
  /** Fixed decimal places to show when not being edited — 2 for currency. */
  decimals?: number;
}

/**
 * A numeric input that holds a raw draft string while the user is typing, so
 * partial entries like "62." or an empty box survive the keystroke instead of
 * snapping back to the parsed value. Blur clears the draft and the field falls
 * back to rendering the canonical number.
 */
export default function NumberField({
  value,
  onChange,
  prefix,
  suffix,
  className = "",
  ariaLabel,
  decimals,
}: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? display(value, decimals);

  function commit(raw: string) {
    setDraft(raw);
    const cleaned = raw.replace(/[$,\s]/g, "");
    if (cleaned === "" || cleaned === "-" || cleaned === ".") {
      onChange(0);
      return;
    }
    const n = Number(cleaned);
    if (Number.isFinite(n)) onChange(n);
  }

  return (
    <div
      className={`flex items-center rounded-md border border-navy-200 bg-white transition focus-within:border-navy-600 focus-within:ring-2 focus-within:ring-navy-600/20 ${className}`}
    >
      {prefix && (
        <span className="pl-2 text-sm text-navy-600/70 select-none">{prefix}</span>
      )}
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={shown}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => setDraft(null)}
        onChange={(e) => commit(e.target.value)}
        className="tabular w-full bg-transparent px-2 py-1.5 text-right text-sm outline-none"
      />
      {suffix && (
        <span className="pr-2 text-sm text-navy-600/70 select-none">{suffix}</span>
      )}
    </div>
  );
}

function display(value: number, decimals?: number): string {
  if (!Number.isFinite(value)) return "0";
  if (decimals === undefined) return String(value);
  return value.toFixed(decimals);
}
