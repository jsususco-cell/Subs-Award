"use client";

import { money, pct } from "@/lib/format";
import {
  MOBILISATION_CAP,
  PAY_SCHEDULES,
  SCHEDULE_LABEL,
  isUnmappedJobType,
  mobilisationOverage,
  scheduleAmounts,
  scheduleForJobType,
  scheduleLines,
  scheduleKeyForJobType,
  type ScheduleKey,
} from "@/lib/schedule";

interface Props {
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
 * Desglose de Pagos — the payment breakdown as it appears on the Puerto Rico
 * award letter: milestone, percentage, amount, and a 100% total row.
 */
export default function PaymentSchedule({ jobType, onJobType, amount }: Props) {
  const key: ScheduleKey = scheduleKeyForJobType(jobType);
  const schedule = scheduleForJobType(jobType);
  const lines = scheduleLines(amount, schedule);
  const total = lines.reduce((sum, l) => sum + l.amount, 0);
  const capped = mobilisationOverage(schedule, scheduleAmounts(amount, schedule));
  const guessing = isUnmappedJobType(jobType) || !jobType.trim();

  return (
    <section className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
      <header className="border-b-2 border-brand-red bg-navy-700 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-wide text-white uppercase">
          Desglose de Pagos
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
              {t} — {SCHEDULE_LABEL[scheduleKeyForJobType(t)]}
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
          <strong>Movilización is capped at {money(MOBILISATION_CAP)}.</strong> At{" "}
          {pct(PAY_SCHEDULES.standard8[0].pct)} it would have been{" "}
          {money(MOBILISATION_CAP + capped)}, so the {money(capped)} balance is
          spread across the remaining stages and every percentage restated.
        </p>
      )}
    </section>
  );
}
