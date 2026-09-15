"use client";

import { REGIONS, REGION_KEYS, missingSetup, type RegionKey } from "@/lib/regions";

interface Props {
  value: RegionKey;
  onChange: (region: RegionKey) => void;
}

/**
 * Which region this award is being struck in.
 *
 * It is deliberately prominent and always on screen. The region decides which
 * jobs and subcontractors are offered, which letter goes out and which account
 * the cost posts to, and all three of those are silent consequences — the job
 * list is the only one a user would notice was wrong.
 *
 * Changing it clears the job and subcontractor, because those records belong to
 * the region they were picked from.
 */
export default function RegionPicker({ value, onChange }: Props) {
  const region = REGIONS[value];
  const missing = missingSetup(region);

  return (
    <div className="no-print mb-5 rounded-xl border border-navy-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label
          htmlFor="region"
          className="text-xs font-semibold tracking-wide text-navy-700 uppercase"
        >
          Region
        </label>
        <select
          id="region"
          value={value}
          onChange={(e) => onChange(e.target.value as RegionKey)}
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
        <p className="mt-2 border-t border-navy-100 pt-2 text-xs text-navy-600/80">
          <strong className="text-brand-red">
            {region.label} is not fully set up.
          </strong>{" "}
          Still needed: {missing.join("; ")}. The scope can be extracted and the
          award calculated, but the steps that depend on what is missing stay
          disabled rather than falling back to Puerto Rico&rsquo;s.
        </p>
      )}
    </div>
  );
}
