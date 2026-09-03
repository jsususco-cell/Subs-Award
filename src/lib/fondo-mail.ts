import { money } from "./format";

/**
 * The messages the Fondo flow sends.
 *
 * Laid out like the Credit Card Reconciliation reminder (n8n workflow 15) so
 * they read as the same company: navy brand strip, a coloured strip naming the
 * thing that needs doing, the facts in a bordered card, then one button.
 *
 * Every message carries both a plain-text and an HTML body. The text is not a
 * throwaway — it is what a client that refuses HTML shows, and what lands in a
 * plain-text reply chain.
 *
 * Three of the four go to a subcontractor, so those are in Spanish, like the
 * award letter they follow. They arrive on a phone, often on site: say what
 * happened, what to do, and nothing else.
 */

const NAVY = "#1F3864";
const NAVY_MID = "#20406f";
const GOLD = "#C9A84C";
const INK = "#1f2733";
const MUTED = "#475467";
const FAINT = "#98a2b3";

export interface FondoMailCase {
  caseNumber: string;
  subcontractor: string;
  awardedAmount: number;
  formUrl: string;
}

export interface FondoMail {
  subject: string;
  text: string;
  html: string;
}

function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );
}

interface ShellInput {
  /** Small caps label at top right. */
  eyebrow: string;
  /** The one line saying what needs doing. */
  headline: string;
  subhead: string;
  /** Colour of the strip under the brand bar. */
  stripe?: string;
  intro: string;
  /** Rows inside the bordered card. */
  rows: [string, string][];
  /** The figure the card leads with, and what it is. */
  leadLabel: string;
  leadAmount: string;
  /** Render the lead as prose rather than a headline figure. */
  leadIsText?: boolean;
  action?: { text: string; url: string };
  /** Bolded lead-in plus the rest, above the button. */
  whatToDo?: string;
  footnote: string;
  footerNote: string;
}

function shell(i: ShellInput): string {
  const stripe = i.stripe ?? NAVY_MID;
  const rows = i.rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 0;color:${FAINT};width:150px;vertical-align:top;">${esc(k)}</td>` +
        `<td style="padding:4px 0;color:${INK};font-weight:600;">${esc(v)}</td></tr>`,
    )
    .join("");

  const button = i.action
    ? `<div><a href="${esc(i.action.url)}" style="display:inline-block;background:${NAVY};color:${GOLD};text-decoration:none;font-weight:700;font-size:14px;letter-spacing:.03em;text-transform:uppercase;padding:13px 24px;border-radius:8px;">${esc(i.action.text)} &rarr;</a></div>`
    : "";

  const whatToDo = i.whatToDo
    ? `<div style="font-size:14px;color:${INK};margin:20px 0 14px;line-height:1.55;">${i.whatToDo}</div>`
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef1f6;font-family:-apple-system,Segoe UI,Arial,sans-serif;color:${INK};">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f6;">
<tr><td align="center" style="padding:28px 12px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e0e4ec;border-radius:14px;overflow:hidden;">

  <tr><td style="background:${NAVY};padding:18px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-size:19px;font-weight:800;color:#ffffff;letter-spacing:.04em;">BYRDSON<span style="color:${GOLD};">.</span></td>
      <td align="right" style="font-size:10px;font-weight:700;color:${GOLD};letter-spacing:.12em;text-transform:uppercase;">${esc(i.eyebrow)}</td>
    </tr></table>
  </td></tr>

  <tr><td style="background:${stripe};border-top:3px solid ${GOLD};padding:14px 24px;">
    <div style="color:#fff;font-size:13px;letter-spacing:.04em;font-weight:700;">${esc(i.headline)}</div>
    <div style="color:#cfd9ec;font-size:12.5px;margin-top:3px;">${esc(i.subhead)}</div>
  </td></tr>

  <tr><td style="padding:24px;">
    <div style="font-size:13px;color:${MUTED};margin:0 0 16px;line-height:1.55;">${i.intro}</div>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f2;border:1px solid #ecdfb8;border-left:4px solid ${NAVY};border-radius:8px;">
      <tr><td style="padding:16px 18px;">
        <div style="font-size:13px;font-weight:700;color:${NAVY};">${esc(i.leadLabel)}</div>
        <div style="font-size:${i.leadIsText ? "14px" : "26px"};font-weight:${i.leadIsText ? "600" : "800"};color:#101828;margin:4px 0 12px;line-height:1.5;">${esc(i.leadAmount)}</div>
        <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:${MUTED};">${rows}</table>
      </td></tr>
    </table>

    ${whatToDo}
    ${button}

    <div style="margin-top:20px;font-size:12px;color:${FAINT};line-height:1.5;">${i.footnote}</div>
  </td></tr>

  <tr><td style="background:${NAVY};padding:16px 24px;text-align:center;">
    <div style="font-size:12px;font-weight:800;color:${GOLD};letter-spacing:.08em;">BYRDSON SERVICES</div>
    <div style="font-size:11px;color:#8fa1c4;margin-top:3px;">${esc(i.footerNote)}</div>
  </td></tr>

</table>
</td></tr></table></body></html>`;
}

/** Sent to the subcontractor shortly after the award letter. */
export function formRequestMail(c: FondoMailCase): FondoMail {
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
    html: shell({
      eyebrow: "Póliza del Fondo",
      headline: "Falta la póliza del Fondo (CFSE)",
      subhead: `Caso ${c.caseNumber} · adjudicado a ${c.subcontractor}`,
      intro:
        "Este caso ya fue adjudicado. Para continuar necesitamos la póliza del Fondo del Seguro del Estado (CFSE) correspondiente a este proyecto.",
      leadLabel: "La póliza tiene que cubrir",
      leadAmount: money(c.awardedAmount),
      rows: [
        ["Caso", c.caseNumber],
        ["Subcontratista", c.subcontractor],
      ],
      whatToDo:
        "<strong>Qué hacer:</strong> adjunte la póliza y escriba por cuánto es. El enlace es únicamente para este caso.",
      action: { text: "Enviar póliza", url: c.formUrl },
      footnote:
        "La retención y el pago de Inspección Final no se liberan hasta que recibamos evidencia de cumplimiento con la CFSE para este proyecto.",
      footerNote: "Póliza del Fondo · mensaje automático",
    }),
  };
}

/** Sent to the reviewer when something is waiting. In English: internal. */
export function reviewRequestMail(
  c: FondoMailCase,
  submitted: number,
  reviewUrl: string,
): FondoMail {
  const short = c.awardedAmount - submitted;
  const covers = short <= 0;
  return {
    subject: `Fondo poliza to review — ${c.caseNumber} — ${c.subcontractor}`,
    text: [
      `${c.subcontractor} has sent in the Fondo poliza for case ${c.caseNumber}.`,
      "",
      `Awarded:   ${money(c.awardedAmount)}`,
      `Poliza:    ${money(submitted)}`,
      covers
        ? "           Covers the award."
        : `           SHORT by ${money(short)} — it does not cover the award.`,
      "",
      "Review it here:",
      reviewUrl,
      "",
      "Approving copies the poliza onto the case record, which is what makes it count as covered.",
    ].join("\n"),
    html: shell({
      eyebrow: "Fondo Review",
      headline: covers ? "Poliza to review" : "Poliza to review — short of the award",
      subhead: `${c.caseNumber} · ${c.subcontractor}`,
      stripe: covers ? NAVY_MID : "#7a2f22",
      intro:
        "A subcontractor has sent in their Fondo (CFSE) poliza. It does not count as covered until it is approved.",
      leadLabel: "Poliza is for",
      leadAmount: money(submitted),
      rows: [
        ["Case", c.caseNumber],
        ["Subcontractor", c.subcontractor],
        ["Awarded", money(c.awardedAmount)],
        ["Coverage", covers ? "Covers the award" : `Short by ${money(short)}`],
      ],
      whatToDo:
        "<strong>What to do:</strong> open the document and check it against the award before approving.",
      action: { text: "Review the poliza", url: reviewUrl },
      footnote:
        "Approving copies the poliza onto the case record, which is what makes it count as covered on the insurance page.",
      footerNote: "Fondo review · automated notice",
    }),
  };
}

/** Sent to the subcontractor when the reviewer sends it back. */
export function returnedMail(c: FondoMailCase, notes: string): FondoMail {
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
    html: shell({
      eyebrow: "Póliza del Fondo",
      headline: "Hay que corregir la póliza",
      subhead: `Caso ${c.caseNumber} · ${c.subcontractor}`,
      stripe: "#7a2f22",
      intro:
        "Revisamos la póliza que envió y no la podemos aceptar todavía. Esto es lo que hay que corregir:",
      leadLabel: "Lo que hay que corregir",
      leadAmount: notes.trim(),
      leadIsText: true,
      rows: [
        ["Caso", c.caseNumber],
        ["Subcontratista", c.subcontractor],
        ["Monto adjudicado", money(c.awardedAmount)],
      ],
      whatToDo:
        "<strong>Qué hacer:</strong> corrija lo indicado y envíe la póliza otra vez desde el mismo enlace.",
      action: { text: "Enviar de nuevo", url: c.formUrl },
      footnote:
        "Si tiene alguna duda sobre lo que hace falta, responda a este correo.",
      footerNote: "Póliza del Fondo · mensaje automático",
    }),
  };
}

/** Sent to the subcontractor once it is accepted. */
export function approvedMail(c: FondoMailCase): FondoMail {
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
    html: shell({
      eyebrow: "Póliza del Fondo",
      headline: "Póliza aceptada",
      subhead: `Caso ${c.caseNumber} · ${c.subcontractor}`,
      stripe: "#1d5c3f",
      intro:
        "Recibimos y aceptamos la póliza del Fondo (CFSE) para este caso. No hace falta enviar nada más.",
      leadLabel: "Monto adjudicado",
      leadAmount: money(c.awardedAmount),
      rows: [
        ["Caso", c.caseNumber],
        ["Subcontratista", c.subcontractor],
      ],
      footnote:
        "Guarde este correo como constancia. La póliza queda en el expediente de este caso.",
      footerNote: "Póliza del Fondo · mensaje automático",
    }),
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

/**
 * Who gets told a poliza is waiting.
 *
 * Read at call time so it can be repointed without a rebuild, and unset means
 * nobody is emailed rather than a default address being guessed. Nothing is
 * lost when it is unset: the submission is already in the review queue, it
 * just waits to be noticed rather than announcing itself.
 */
export function reviewerEmail(): string {
  return (process.env.FONDO_REVIEWER_EMAIL ?? "").trim();
}

export function fondoReviewUrl(): string {
  const base = appBaseUrl();
  return base ? `${base}/fondo/review` : "";
}
