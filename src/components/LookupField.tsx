"use client";

import { useId, useRef, useState } from "react";
import { refreshLookups } from "@/lib/qb-client";

export interface Choice {
  id: string;
  label: string;
  hint?: string;
  /** Extra values applied alongside the label when this choice is picked. */
  extra?: Record<string, string>;
}

interface Props {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string, extra?: Record<string, string>) => void;
  /** Fetches the options. Called on first focus, never during render. */
  loadChoices: () => Promise<{
    configured: boolean;
    choices: Choice[];
    warning?: string;
    error?: string;
  }>;
}

/**
 * A text field that offers Quickbase matches once they load, and stays a plain
 * text field if the lookup is unavailable. It is never a hard dependency —
 * whatever is typed is what the letter uses.
 */
export default function LookupField({
  label,
  value,
  placeholder,
  onChange,
  loadChoices,
}: Props) {
  const id = useId();
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "off">("idle");
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function ensureLoaded(force = false) {
    if (!force && state !== "idle") return;
    setState("loading");
    setNote(null);
    const result = await loadChoices();
    if (!result.configured || result.error) {
      setState("off");
      setNote(result.error ?? null);
      return;
    }
    setChoices(result.choices);
    setNote(result.warning ?? null);
    setState("ready");
  }

  const query = value.trim().toLowerCase();
  const matches = (choices ?? [])
    .filter((c) =>
      !query
        ? true
        : c.label.toLowerCase().includes(query) ||
          (c.hint ?? "").toLowerCase().includes(query),
    )
    .slice(0, 50);

  const exact = choices?.some((c) => c.label === value.trim());
  const showList = open && state === "ready" && matches.length > 0;

  function pick(choice: Choice) {
    onChange(choice.label, choice.extra);
    setOpen(false);
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1 flex items-center gap-2 text-xs font-medium text-navy-700">
        {label}
        {state === "loading" && <span className="text-navy-600/60">loading…</span>}
        {state === "ready" && exact && (
          <span className="text-[10px] font-semibold text-navy-600">✓ matched</span>
        )}
      </label>

      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
        aria-controls={showList ? `${id}-list` : undefined}
        onFocus={() => {
          setOpen(true);
          void ensureLoaded();
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (matches[active]) pick(matches[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="w-full rounded-md border border-navy-200 px-2.5 py-2 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
      />

      {showList && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-navy-200 bg-white shadow-lg"
        >
          {matches.map((choice, i) => (
            <li key={choice.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  // Beat the blur so the click registers.
                  e.preventDefault();
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                }}
                onClick={() => pick(choice)}
                className={`block w-full px-2.5 py-1.5 text-left text-sm ${
                  i === active ? "bg-navy-50 text-navy-900" : "text-navy-800"
                }`}
              >
                <span className="block truncate font-medium">{choice.label}</span>
                {choice.hint && (
                  <span className="block truncate text-xs text-navy-600/70">
                    {choice.hint}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {note && <p className="mt-1 text-[10px] text-navy-600/70">{note}</p>}
      {state === "off" && (
        <p className="mt-1 text-[10px] text-navy-600/60">
          {note ? "" : "Quickbase lookup unavailable — type the value."}{" "}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              // A failed lookup must not strand the field for the whole
              // session — drop the shared cache and try again.
              refreshLookups();
              void ensureLoaded(true);
            }}
            className="font-semibold text-navy-600 underline underline-offset-2 hover:text-brand-red"
          >
            Retry
          </button>
        </p>
      )}
    </div>
  );
}
