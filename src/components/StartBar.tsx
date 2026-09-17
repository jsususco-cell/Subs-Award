"use client";

import {
  REGIONS,
  REGION_KEYS,
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
];

interface Props {
  region: RegionKey;
  onRegion: (region: RegionKey) => void;
  mode: Mode;
  onMode: (mode: Mode) => void;
}

/**
 * Region and route, always on screen and always the first thing set.
 *
 * Both are deliberately prominent. The region decides which jobs and
 * subcontractors are offered, which letter goes out and which account the cost
 * posts to — and all but the job list are silent consequences.
 */
export default function StartBar({ region, onRegion, mode, onMode }: Props) {
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
        <select
          id="region"
          value={region}
          onChange={(e) => onRegion(e.target.value as RegionKey)}
          className="rounded-md border border-navy-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-navy-800 focus:border-navy-500 focus:outline-none"
        >
          {REGION_KEYS.map((key) => (
            <option key={key} value={key}>
              {REGIONS[key].label}
            </option>
          ))}
        </select>
        <p className="text-xs text-navy-600/70">
          Jobs, subcontractors, the award letter and the account the cost posts
          to all follow this.
        </p>
      </div>

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
        <div
          className={`grid gap-2 ${
            offered.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"
          }`}
        >
          {offered.map((m) => {
            const active = mode === m.id;
            return (
              <label
                key={m.id}
                className={`cursor-pointer rounded-lg border px-3 py-2.5 transition ${
                  active
                    ? "border-navy-600 bg-navy-50 ring-1 ring-navy-600/30"
                    : "border-navy-200 bg-white hover:bg-navy-50/50"
                }`}
              >
                <span className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="mode"
                    value={m.id}
                    checked={active}
                    onChange={() => onMode(m.id)}
                    className="mt-0.5 h-3.5 w-3.5 accent-[var(--color-navy-700)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-navy-800">
                      {m.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-navy-600/70">
                      {m.hint}
                    </span>
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
