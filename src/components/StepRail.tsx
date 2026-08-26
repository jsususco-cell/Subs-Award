"use client";

export interface Step {
  id: string;
  label: string;
  hint: string;
  enabled: boolean;
}

interface Props {
  steps: Step[];
  current: string;
  onSelect: (id: string) => void;
}

export default function StepRail({ steps, current, onSelect }: Props) {
  const currentIndex = steps.findIndex((s) => s.id === current);

  return (
    <nav aria-label="Progress" className="no-print mb-6">
      <ol className="flex flex-wrap gap-2">
        {steps.map((step, i) => {
          const active = step.id === current;
          const done = i < currentIndex && step.enabled;
          return (
            <li key={step.id} className="flex-1 basis-40">
              <button
                type="button"
                disabled={!step.enabled}
                onClick={() => onSelect(step.id)}
                aria-label={`Step ${i + 1}: ${step.label} — ${step.hint}`}
                aria-current={active ? "step" : undefined}
                className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                  active
                    ? "border-navy-700 bg-navy-700 text-white shadow-sm"
                    : step.enabled
                      ? "border-navy-200 bg-white text-navy-700 hover:border-navy-400 hover:bg-navy-50"
                      : "cursor-not-allowed border-navy-100 bg-navy-50/50 text-navy-300"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      active
                        ? "bg-brand-red text-white"
                        : done
                          ? "bg-navy-600 text-white"
                          : step.enabled
                            ? "bg-navy-100 text-navy-600"
                            : "bg-navy-100 text-navy-300"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <span className="truncate text-sm font-semibold">{step.label}</span>
                </span>
                <span
                  className={`mt-0.5 block truncate pl-7 text-[11px] ${
                    active ? "text-navy-200" : "text-navy-600/60"
                  }`}
                >
                  {step.hint}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
