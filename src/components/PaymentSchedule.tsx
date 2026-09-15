"use client";

import { money, pct } from "@/lib/format";
import {
  SCHEDULE_LABEL,
  isUnmappedJobType,
  mobilisationOverage,
  scheduleAmounts,
  scheduleForJobType,
  scheduleLines,
  scheduleKeyForJobType,
  type ScheduleKey,
  scheduleSetFor,
} from "@/lib/schedule";
import { regionFor, type RegionKey } from "@/lib/regions";
import { templateFor } from "@/lib/letter-content";

interface Props {
  /** Decides which milestones apply, or whether any do. */
  region: RegionKey;
  jobType: string;
  onJobType: (jobType: string) => void;
  /** The amount the schedule divides up — the award total. */
  amount: number;
}

const JOB_TYPES = [
  "Reconstruction",
  "New Construction",
  "Repair",
  "Renovation",
  "Relocation",
  "Demolition",
  "Acquisition & Demolition",
  "Rehabilitation",
  "MHU",
  "Home Elevation",
  "Modular Home",
];

/**
 * The payment breakdown as it appears on the award letter: milestone,
 * percentage, amount, and a 100% total row.
 *
 * The milestones belong to the region. A region with none shows what is
 * missing instead of Puerto Rico's — billing a Florida subcontractor against
 * "Empañetado" would be meaningless to them and wrong in the ledger.
 */
export default function PaymentSchedule({
  region,
  jobType,
  onJobType,
  amount,
}: Props) {
  const cfg = regionFor(region);
  const set = scheduleSetFor(cfg);

  if (!set) {
    return (
      <section className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
        <header className="border-b-2 border-brand-red bg-navy-700 px-4 py-3">
          <h2 className="text-sm font-semibold tracking-wide text-white uppercase">
            Payment schedule
          </h2>
          <p className="mt-0.5 text-xs text-navy-200">{cfg.label}</p>
        </header>
        <p className="px-4 py-4 text-sm text-navy-700">
          There is no payment schedule for {cfg.label} yet, so this award has no
          payment breakdown and no billing lines will be created against the
          purchase order. The milestones come with the {cfg.label} award letter
          template — until that lands, bill the purchase order from Quickbase.
        </p>
      </section>
    );
  }

  const heading = templateFor(cfg)?.labels.sectionSchedule ?? "Payment schedule";
  const key = scheduleKeyForJobType(jobType, cfg) as ScheduleKey;
  const schedule = scheduleForJobType(jobType, cfg) ?? [];
  const lines = scheduleLines(amount, schedule, set.mobilisationCap);
  const total = lines.reduce((sum, l) => sum + l.amount, 0);
  const capped = mobilisationOverage(
    schedule,
    scheduleAmounts(amount, schedule),
    set.mobilisationCap,
  );
  const guessing = isUnmappedJobType(jobType, cfg) || !jobType.trim();

  return (
    <section className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
      <header className="border-b-2 border-brand-red bg-navy-700 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-wide text-white uppercase">
          {heading}
        </h2>
        <p className="mt-0.5 text-xs text-navy-200">
          Payment breakdown &middot; {schedule.length}{" "}
          {schedule.length === 1 ? "payment" : "payments"} ({SCHEDULE_LABEL[key]})
        </p>
      </header>

      <div className="border-b border-navy-100 px-4 py-3">
        <label
          htmlFor="schedule-job-type"
          className="mb-1 block text-xs font-medium text-navy-700"
        >
          Job Type
        </label>
        <select
          id="schedule-job-type"
          value={JOB_TYPES.includes(jobType) ? jobType : ""}
          onChange={(e) => onJobType(e.target.value)}
          className="w-full rounded-md border border-navy-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
        >
          <option value="">— select —</option>
          {JOB_TYPES.map((t) => (
            <option key={t} value={t}>
              {t} — {SCHEDULE_LABEL[scheduleKeyForJobType(t, cfg) as ScheduleKey]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[10px] text-navy-600/70">
          {guessing
            ? "No schedule is mapped to this job type, so the 8-milestone default is shown. Confirm it before sending."
            : "Set automatically from the job you picked; change it to use a different schedule."}
        </p>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-navy-100 bg-navy-100/60 text-xs tracking-wide text-navy-700 uppercase">
            <th scope="col" className="w-10 px-4 py-2 text-left font-semibold">
              #
            </th>
            <th scope="col" className="py-2 text-left font-semibold">
              Etapa
            </th>
            <th scope="col" className="py-2 text-right font-semibold">
              %
            </th>
            <th scope="col" className="px-4 py-2 text-right font-semibold">
              Monto del Pago
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.n} className="border-b border-navy-50 last:border-0">
              <td className="tabular px-4 py-1.5 text-navy-600/60">{l.n}</td>
              <td className="py-1.5 font-medium text-navy-800">{l.desc}</td>
              <td className="tabular py-1.5 text-right text-navy-600/80">
                {pct(l.pct)}
              </td>
              <td className="tabular px-4 py-1.5 text-right font-medium text-navy-800">
                {amount > 0 ? money(l.amount) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-navy-700 bg-navy-50">
            <td />
            <td className="py-2.5 text-xs font-bold tracking-wide text-navy-800 uppercase">
              Total
            </td>
            <td className="tabular py-2.5 text-right text-sm font-bold text-navy-800">
              100.00%
            </td>
            <td className="tabular px-4 py-2.5 text-right text-sm font-bold text-navy-800">
              {amount > 0 ? money(total) : "—"}
            </td>
          </tr>
        </tfoot>
      </table>

      {capped > 0 && (
        <p className="border-t border-navy-100 bg-navy-50 px-4 py-2.5 text-xs text-navy-600/80">
          <strong>
            {schedule[0].desc} is capped at {money(set.mobilisationCap ?? 0)}.
          </strong>{" "}
          At {pct(schedule[0].pct)} it would have been{" "}
          {money((set.mobilisationCap ?? 0) + capped)}, so the {money(capped)}{" "}
          balance is spread across the remaining stages and every percentage
          restated.
        </p>
      )}
    </section>
  );
}
