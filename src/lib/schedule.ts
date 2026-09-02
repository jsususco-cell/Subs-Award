/**
 * Desglose de Pagos — the payment breakdown from the Puerto Rico award letter.
 *
 * These schedules and the job-type mapping are carried over verbatim from the
 * Quickbase award code page, so the letter this app produces matches the bills
 * that page creates against the PO. Changing one without the other would put
 * the letter and the Billing Line Items out of step.
 */

export interface Milestone {
  n: number;
  desc: string;
  pct: number;
}

export type ScheduleKey = "standard8" | "split5050" | "split2080";

export const PAY_SCHEDULES: Record<ScheduleKey, Milestone[]> = {
  standard8: [
    { n: 1, desc: "Movilización", pct: 10 },
    { n: 2, desc: "Demolición", pct: 15 },
    { n: 3, desc: "Fundación", pct: 10 },
    { n: 4, desc: "Paredes", pct: 10 },
    { n: 5, desc: "Techo", pct: 10 },
    { n: 6, desc: "Empañetado", pct: 20 },
    { n: 7, desc: "Terminaciones", pct: 15 },
    { n: 8, desc: "Inspección Final", pct: 10 },
  ],
  split5050: [
    { n: 1, desc: "Pago Inicial", pct: 50 },
    { n: 2, desc: "Pago Final", pct: 50 },
  ],
  split2080: [
    { n: 1, desc: "Pago Inicial", pct: 20 },
    { n: 2, desc: "Pago Final", pct: 80 },
  ],
};

export const SCHEDULE_LABEL: Record<ScheduleKey, string> = {
  standard8: "8 milestones",
  split5050: "50 / 50",
  split2080: "20 / 80",
};

/** Job Type (Jobs fid 34) to schedule. Anything unmapped falls back to the 8. */
export const JOB_TYPE_SCHEDULE: Record<string, ScheduleKey> = {
  Reconstruction: "standard8",
  "New Construction": "standard8",
  Repair: "split5050",
  Renovation: "split5050",
  Relocation: "split2080",
  Demolition: "split2080",
  "Acquisition & Demolition": "split2080",
};

/**
 * Job Types that exist in Quickbase but have no schedule of their own. They
 * fall back to the 8-milestone schedule, which is a guess rather than a rule —
 * the UI says so rather than presenting it as settled.
 */
export const UNMAPPED_JOB_TYPES = [
  "Rehabilitation",
  "MHU",
  "Home Elevation",
  "Modular Home",
  "Job Template",
  "Master Project",
];

export function scheduleKeyForJobType(jobType: string): ScheduleKey {
  return JOB_TYPE_SCHEDULE[(jobType || "").trim()] ?? "standard8";
}

export function scheduleForJobType(jobType: string): Milestone[] {
  return PAY_SCHEDULES[scheduleKeyForJobType(jobType)];
}

/** True when the job type is not in the map and is only defaulting. */
export function isUnmappedJobType(jobType: string): boolean {
  const t = (jobType || "").trim();
  return t.length > 0 && !(t in JOB_TYPE_SCHEDULE);
}

/**
 * Split an amount across a schedule. Each line is rounded to the cent and any
 * drift lands on the final line, so the rows always add up to the total
 * exactly — the same approach the code page uses.
 */
export function scheduleAmounts(amount: number, schedule: Milestone[]): number[] {
  if (!schedule.length) return [];
  const amounts = schedule.map((m) => round(amount * (m.pct / 100)));
  const drift = round(amount - amounts.reduce((sum, a) => sum + a, 0));
  amounts[amounts.length - 1] = round(amounts[amounts.length - 1] + drift);
  return amounts;
}

/** The award letter caps the mobilisation payment at $10,000. */
export const MOBILISATION_CAP = 10000;

function mobilisationIndex(schedule: Milestone[]): number {
  return schedule.findIndex((m) => /^movilizaci/i.test(m.desc));
}

/** One row of the Desglose de Pagos: what is paid, and what share that is. */
export interface ScheduleLine {
  n: number;
  desc: string;
  /** The share of the award this line actually is, after any cap. */
  pct: number;
  amount: number;
}

/**
 * Build the payment schedule for an award, applying the mobilisation cap.
 *
 * Movilización is the lesser of its scheduled share and $10,000. When the cap
 * bites, the balance is spread across the remaining stages in proportion to
 * their shares, and every percentage is restated from the amount actually
 * being paid — so Movilización on a $180,800 award reads 5.53%, not 10%.
 *
 * The lines always total the award exactly. Capping without redistributing
 * would bill the subcontractor less than the contract, and the percentages are
 * derived from the amounts rather than tracked separately so the two cannot
 * disagree.
 *
 * Percentages are each rounded to two decimals and may therefore sum to a
 * hundredth either side of 100; the total row states 100.00%, as the letters
 * this mirrors do.
 */
export function scheduleLines(amount: number, schedule: Milestone[]): ScheduleLine[] {
  if (!schedule.length) return [];

  const line = (m: Milestone, value: number): ScheduleLine => ({
    n: m.n,
    desc: m.desc,
    // round() already works to two decimals; scaling again gave four.
    pct: amount > 0 ? round((value / amount) * 100) : m.pct,
    amount: value,
  });

  const uncapped = scheduleAmounts(amount, schedule);
  const i = mobilisationIndex(schedule);
  const otherPct = schedule.reduce((sum, m, j) => (j === i ? sum : sum + m.pct), 0);

  // Nothing to cap, or nowhere to move the balance to. A schedule that is
  // mobilisation alone stays uncapped rather than stranding the difference.
  if (i === -1 || !(amount > 0) || uncapped[i] <= MOBILISATION_CAP || !(otherPct > 0)) {
    return schedule.map((m, j) => line(m, uncapped[j]));
  }

  const remaining = round(amount - MOBILISATION_CAP);
  const amounts = schedule.map((m, j) =>
    j === i ? MOBILISATION_CAP : round(remaining * (m.pct / otherPct)),
  );

  // Drift from rounding lands on the last line that is not the capped one, so
  // the rows come to the award exactly and Movilización stays on $10,000.
  const last = i === schedule.length - 1 ? schedule.length - 2 : schedule.length - 1;
  amounts[last] = round(amounts[last] + (amount - amounts.reduce((s, a) => s + a, 0)));

  return schedule.map((m, j) => line(m, amounts[j]));
}

/** How much the uncapped schedule would exceed the mobilisation cap by. */
export function mobilisationOverage(
  schedule: Milestone[],
  amounts: number[],
): number {
  const i = mobilisationIndex(schedule);
  if (i === -1) return 0;
  const over = (amounts[i] ?? 0) - MOBILISATION_CAP;
  return over > 0 ? round(over) : 0;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
