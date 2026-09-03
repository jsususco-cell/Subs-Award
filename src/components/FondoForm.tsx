"use client";

import { useState } from "react";
import { money } from "@/lib/format";
import {
  FONDO_STATUS,
  MAX_POLIZA_BYTES,
  canSubmit,
  coverageOf,
  type FondoCase,
} from "@/lib/fondo";

/**
 * The form a subcontractor fills in after being awarded.
 *
 * Written for someone opening a link on a phone who has never seen this
 * before: the case they are looking at is stated first, the ask is one
 * sentence, and the amount asked for is the amount that has to be covered.
 * It is in Spanish because the award letter it follows is.
 */

interface Props {
  accessKey: string;
  initial: FondoCase;
}

type Stage = "form" | "sending" | "sent";

export default function FondoForm({ accessKey, initial }: Props) {
  const [amount, setAmount] = useState(
    initial.submittedAmount > 0 ? String(initial.submittedAmount) : "",
  );
  const [policyNumber, setPolicyNumber] = useState(initial.submittedPolicyNumber);
  const [submittedBy, setSubmittedBy] = useState("");
  const [file, setFile] = useState<{ fileName: string; data: string } | null>(null);
  const [fileLabel, setFileLabel] = useState(initial.submittedFileName);
  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState<string | null>(null);

  const returned = initial.status === FONDO_STATUS.returned;
  const pending = initial.status === FONDO_STATUS.submitted;
  const open = canSubmit(initial.status);

  const parsed = Number(amount.replace(/[^0-9.]/g, "")) || 0;
  const cover = coverageOf(parsed, initial.awardedAmount);

  async function readFile(f: File) {
    setError(null);
    if (f.size > MAX_POLIZA_BYTES) {
      setError("Ese archivo pesa más de 10 MB. Envíe un escaneo más pequeño.");
      return;
    }
    const buf = await f.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    setFile({ fileName: f.name, data: btoa(binary) });
    setFileLabel(f.name);
  }

  async function submit() {
    setStage("sending");
    setError(null);
    try {
      const res = await fetch("/api/fondo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessKey,
          recordId: initial.recordId,
          insuranceAmount: parsed,
          policyNumber,
          submittedBy,
          file,
        }),
      });
      const body = await res.json();
      if (!body.ok) {
        setError(body.error ?? "No se pudo enviar. Intente otra vez.");
        setStage("form");
        return;
      }
      setStage("sent");
    } catch {
      setError("No se pudo conectar. Nada fue enviado. Intente otra vez.");
      setStage("form");
    }
  }

  if (stage === "sent" || pending) {
    return (
      <Shell caseNumber={initial.caseNumber} sub={initial.subcontractor}>
        <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-navy-800">
            Recibimos su póliza
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-navy-600/80">
            Byrdson la revisará. Si algo hace falta le escribiremos con lo que hay
            que corregir. No tiene que hacer nada más por ahora.
          </p>
        </div>
      </Shell>
    );
  }

  if (!open) {
    return (
      <Shell caseNumber={initial.caseNumber} sub={initial.subcontractor}>
        <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-navy-800">
            Póliza aprobada
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-navy-600/80">
            La póliza de este caso ya fue aceptada. No hace falta enviar nada más.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell caseNumber={initial.caseNumber} sub={initial.subcontractor}>
      {returned && initial.reviewNotes && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-brand-red/40 bg-brand-red-50 p-4"
        >
          <p className="text-sm font-semibold text-brand-red-dark">
            Hay que corregir algo antes de continuar
          </p>
          <p className="mt-1 text-sm whitespace-pre-line text-brand-red-dark/90">
            {initial.reviewNotes}
          </p>
        </div>
      )}

      <div className="rounded-xl border border-navy-200 bg-white shadow-sm">
        <div className="border-b border-navy-100 px-5 py-4">
          <h2 className="text-base font-semibold text-navy-800">
            Póliza del Fondo (CFSE)
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-navy-600/80">
            La póliza tiene que cubrir el monto adjudicado de{" "}
            <strong className="text-navy-800">{money(initial.awardedAmount)}</strong>.
            Adjunte la póliza y escriba por cuánto es.
          </p>
        </div>

        <div className="space-y-4 p-5">
          <Field label="Monto de la póliza" htmlFor="fondo-amount">
            <div className="flex items-center gap-2">
              <span className="text-sm text-navy-600/70">$</span>
              <input
                id="fondo-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-md border border-navy-200 px-3 py-2.5 text-base outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
              />
            </div>
            {parsed > 0 && !cover.covers && (
              <p className="mt-1.5 text-xs text-brand-red-dark">
                Esto es {money(cover.shortfall)} menos que el monto adjudicado.
                Puede enviarlo, pero Byrdson lo va a revisar.
              </p>
            )}
          </Field>

          <Field label="Número de póliza (opcional)" htmlFor="fondo-policy">
            <input
              id="fondo-policy"
              value={policyNumber}
              onChange={(e) => setPolicyNumber(e.target.value)}
              className="w-full rounded-md border border-navy-200 px-3 py-2.5 text-base outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
            />
          </Field>

          <Field label="Póliza (PDF o foto)" htmlFor="fondo-file">
            <input
              id="fondo-file"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,application/pdf,image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void readFile(f);
              }}
              className="block w-full text-sm text-navy-700 file:mr-3 file:rounded-md file:border-0 file:bg-navy-700 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-navy-800"
            />
            {fileLabel && (
              <p className="mt-1.5 text-xs text-navy-600/70">
                Adjuntado: <strong>{fileLabel}</strong>
              </p>
            )}
          </Field>

          <Field label="Su nombre" htmlFor="fondo-by">
            <input
              id="fondo-by"
              value={submittedBy}
              onChange={(e) => setSubmittedBy(e.target.value)}
              className="w-full rounded-md border border-navy-200 px-3 py-2.5 text-base outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
            />
          </Field>

          {error && (
            <p
              role="alert"
              className="rounded-md border border-brand-red/30 bg-brand-red-50 px-3 py-2 text-sm text-brand-red-dark"
            >
              {error}
            </p>
          )}
        </div>

        <div className="border-t-2 border-navy-200 bg-navy-50 p-5">
          <button
            type="button"
            disabled={stage === "sending"}
            onClick={submit}
            className={`w-full rounded-md px-4 py-3 text-base font-semibold text-white transition ${
              stage === "sending"
                ? "cursor-not-allowed bg-navy-300"
                : "bg-navy-700 hover:bg-navy-800"
            }`}
          >
            {stage === "sending" ? "Enviando…" : "Enviar póliza"}
          </button>
        </div>
      </div>
    </Shell>
  );
}

function Shell({
  caseNumber,
  sub,
  children,
}: {
  caseNumber: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:py-12">
      <p className="text-xs font-semibold tracking-wide text-navy-600/70 uppercase">
        Caso {caseNumber || "—"}
      </p>
      <h1 className="mt-1 mb-5 text-xl leading-tight font-semibold text-navy-800">
        {sub}
      </h1>
      {children}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-sm font-medium text-navy-700"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
