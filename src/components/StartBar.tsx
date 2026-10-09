"use client";

import type { Grant } from "@/lib/auth/roster";
import {
  REGIONS,
  missingSetup,
  type AwardRoute,
  type RegionKey,
} from "@/lib/regions";

/** Kept as the component's own name for the route being taken. */
export type Mode = AwardRoute;

const MODES: { id: Mode; label: string; hint: string }[] = [
  {
    id: "canopy",
    label: "Upload from Canopy",
    hint: "The usual route. Upload the scope export and derive the award from it.",
  },
  {
    id: "award-po",
    label: "Award a new PO",
    hint: "No scope file. Enter the award breakdown and create the PO, cost item and bills.",
  },
  {
    id: "bill-po",
    label: "Bill an existing PO",
    hint: "Break down more of a contract, or bill the milestones already on it.",
  },
  {
    id: "vendor-status",
    label: "Vendor status",
    hint: "What a subcontractor is owed across their purchase orders, and what has been paid.",
  },
  {
    id: "attachments",
    label: "Attachments",
    hint: "Documents filed against a job — invoices, award letters, permits.",
  },
  {
    id: "scope-change",
    label: "Scope change",
    hint: "The scope has been revised. Compare it against the award, then spread the difference across the milestones still outstanding.",
  },
];

interface Props {
  region: RegionKey;
  onRegion: (region: RegionKey) => void;
  mode: Mode;
  onMode: (mode: Mode) => void;
  /** The regions this person may work in. Never empty. */
  allowed: RegionKey[];
  /** Why they hold those regions, so the note can say which it was. */
  grant: Grant;
}

/**
 * Region and route, always on screen and always the first thing set.
 *
 * Both are deliberately prominent. The region decides which jobs and
 * subcontractors are offered, which letter goes out and which account the cost
 * posts to — and all but the job list are silent consequences.
 */
export default function StartBar({ region, onRegion, mode, onMode, allowed, grant }: Props) {
  const cfg = REGIONS[region];
  const missing = missingSetup(cfg);
  // Only the routes this region actually has, in its own order.
  const offered = cfg.routes
    .map((id) => MODES.find((m) => m.id === id))
    .filter((m): m is (typeof MODES)[number] => Boolean(m));

  return (
    <div className="no-print mb-5 rounded-xl border border-navy-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <label
          htmlFor="region"
          className="text-xs font-semibold tracking-wide text-navy-700 uppercase"
        >
          Region
        </label>
        {allowed.length > 1 ? (
          <select
            id="region"
            value={region}
            onChange={(e) => onRegion(e.target.value as RegionKey)}
            className="rounded-md border border-navy-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-navy-800 focus:border-navy-500 focus:outline-none"
          >
            {allowed.map((key) => (
              <option key={key} value={key}>
                {REGIONS[key].label}
              </option>
            ))}
          </select>
        ) : (
          /* One region is not a choice. A select with a single option invites
             someone to look for the others and conclude the app is broken. */
          <span className="rounded-md border border-navy-200 bg-navy-50 px-2.5 py-1.5 text-sm font-semibold text-navy-800">
            {cfg.label}
          </span>
        )}
        <p className="text-xs text-navy-600/70">
          {allowed.length > 1
            ? "Jobs, subcontractors, the award letter and the account the cost posts to all follow this."
            : `Your Quickbase record covers ${cfg.label}, so that is what this shows.`}
        </p>
      </div>

      {grant === "admin" && (
        <p className="border-t border-navy-100 px-4 py-2 text-xs text-navy-600/70">
          Admin Access is ticked on your Internal Users record, so every region
          is offered whatever its Region field says.
        </p>
      )}

      {grant === "head-office" && (
        <p className="border-t border-navy-100 px-4 py-2 text-xs text-navy-600/70">
          Your Internal Users record names no region, so every region is
          offered. Setting one narrows this to the states you work in.
        </p>
      )}

      {missing.length > 0 && (
        <p className="border-t border-navy-100 px-4 py-2 text-xs text-navy-600/80">
          <strong className="text-brand-red">
            {cfg.label} is not fully set up.
          </strong>{" "}
          Still needed: {missing.join("; ")}. The scope can be extracted and the
          award calculated, but the steps that depend on what is missing stay
          disabled rather than falling back to Puerto Rico&rsquo;s.
        </p>
      )}

      <fieldset className="border-t border-navy-100 px-4 py-3">
        <legend className="sr-only">What are you doing?</legend>
        {!cfg.routes.includes("canopy") && (
          <p className="mb-2 text-xs text-navy-600/70">
            {cfg.label} awards are raised straight against a purchase order —
            there is no Canopy scope upload here.
          </p>
        )}
        {/*
          One row, shared equally, wrapping only when the screen is too narrow
          for it. The routes are a choice of five at most and each is two or
          three words, so a card apiece was a block of chrome above the work.

          The description moves out of the tile and under the row, showing the
          chosen route's only. It still carries real information — "no scope
          file", "break down more of a contract" — so it is kept rather than
          dropped, just not repeated five times.
        */}
        <div className="flex flex-wrap gap-2">
          {offered.map((m) => {
            const active = mode === m.id;
            return (
              <label
                key={m.id}
                title={m.hint}
                className={`flex min-w-0 flex-1 basis-36 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition ${
                  active
                    ? "border-navy-600 bg-navy-50 ring-1 ring-navy-600/30"
                    : "border-navy-200 bg-white hover:bg-navy-50/50"
                }`}
              >
                <input
                  type="radio"
                  name="mode"
                  value={m.id}
                  checked={active}
                  onChange={() => onMode(m.id)}
                  className="h-3.5 w-3.5 shrink-0 accent-[var(--color-navy-700)]"
                />
                {/* Wraps rather than truncating. A label clipped to "Bill an
                    existing..." with no ellipsis to click is worse than a pill
                    that grows a second line on a narrow screen. */}
                <span
                  className={`text-sm leading-tight ${
                    active ? "font-semibold text-navy-800" : "font-medium text-navy-700"
                  }`}
                >
                  {m.label}
                </span>
              </label>
            );
          })}
        </div>

        {offered.find((m) => m.id === mode)?.hint ? (
          <p className="mt-2 text-xs leading-relaxed text-navy-600/70">
            {offered.find((m) => m.id === mode)?.hint}
          </p>
        ) : null}
      </fieldset>
    </div>
  );
}
