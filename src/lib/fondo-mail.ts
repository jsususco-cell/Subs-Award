import { money } from "./format";

/**
 * The messages the Fondo flow sends.
 *
 * Three of the four go to a subcontractor, so they are in Spanish, like the
 * award letter they follow. Each one says what happened, what the person has
 * to do, and nothing else — these arrive on a phone, often on site.
 */

export interface FondoMailCase {
  caseNumber: string;
  subcontractor: string;
  awardedAmount: number;
  formUrl: string;
}

/** Sent to the subcontractor shortly after the award letter. */
export function formRequestMail(c: FondoMailCase): { subject: string; text: string } {
  return {
    subject: `Póliza del Fondo (CFSE) — Caso ${c.caseNumber}`,
    text: [
      `Estimados ${c.subcontractor}:`,
      "",
      `Para el caso ${c.caseNumber} necesitamos la póliza del Fondo del Seguro del Estado (CFSE), y tiene que cubrir el monto adjudicado de ${money(c.awardedAmount)}.`,
      "",
      "Puede enviarla desde este enlace:",
      c.formUrl,
      "",
      "Solo hace falta adjuntar la póliza y escribir por cuánto es. El enlace es únicamente para este caso.",
      "",
      "Recuerde que la retención y el pago de Inspección Final no se liberan hasta que recibamos evidencia de cumplimiento con la CFSE para este proyecto.",
      "",
      "Cordialmente,",
      "Byrdson Services, LLC",
    ].join("\n"),
  };
}

/** Sent to the reviewer when something is waiting. */
export function reviewRequestMail(
  c: FondoMailCase,
  submitted: number,
  reviewUrl: string,
): { subject: string; text: string } {
  const short = c.awardedAmount - submitted;
  return {
    subject: `Fondo poliza to review — ${c.caseNumber} — ${c.subcontractor}`,
    text: [
      `${c.subcontractor} has sent in the Fondo poliza for case ${c.caseNumber}.`,
      "",
      `Awarded:   ${money(c.awardedAmount)}`,
      `Poliza:    ${money(submitted)}`,
      short > 0
        ? `           SHORT by ${money(short)} — it does not cover the award.`
        : "           Covers the award.",
      "",
      "Review it here:",
      reviewUrl,
      "",
      "Approving copies the poliza onto the case record, which is what makes it count as covered.",
    ].join("\n"),
  };
}

/** Sent to the subcontractor when the reviewer sends it back. */
export function returnedMail(
  c: FondoMailCase,
  notes: string,
): { subject: string; text: string } {
  return {
    subject: `Corrección necesaria — Póliza del Fondo — Caso ${c.caseNumber}`,
    text: [
      `Estimados ${c.subcontractor}:`,
      "",
      `Revisamos la póliza que envió para el caso ${c.caseNumber} y hay algo que corregir:`,
      "",
      notes.trim(),
      "",
      "Puede enviarla otra vez desde el mismo enlace:",
      c.formUrl,
      "",
      "Cordialmente,",
      "Byrdson Services, LLC",
    ].join("\n"),
  };
}

/** Sent to the subcontractor once it is accepted. */
export function approvedMail(c: FondoMailCase): { subject: string; text: string } {
  return {
    subject: `Póliza recibida — Caso ${c.caseNumber}`,
    text: [
      `Estimados ${c.subcontractor}:`,
      "",
      `Recibimos y aceptamos la póliza del Fondo (CFSE) para el caso ${c.caseNumber}. No hace falta enviar nada más.`,
      "",
      "Cordialmente,",
      "Byrdson Services, LLC",
    ].join("\n"),
  };
}

/**
 * Where the app is reachable from, for links inside emails.
 *
 * A relative link is useless in an inbox, so this refuses to guess: without
 * it configured the sender reports that rather than mailing a broken link.
 */
export function appBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;
  return "";
}

export function fondoFormUrl(accessKey: string, recordId: number): string {
  const base = appBaseUrl();
  return base ? `${base}/fondo/${accessKey}/${recordId}` : "";
}

export function fondoReviewUrl(): string {
  const base = appBaseUrl();
  return base ? `${base}/fondo/review` : "";
}
