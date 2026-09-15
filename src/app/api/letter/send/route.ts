import { NextResponse } from "next/server";
import { canRenderLetter, NoLetterTemplateError, renderLetter } from "@/lib/letter";
import { parseLetterInput } from "@/lib/letter-input";
import { templateFor } from "@/lib/letter-content";
import { regionFor } from "@/lib/regions";
import { htmlToPdf, pdfFileName } from "@/lib/pdf";
import {
  allowlist,
  archiveBcc,
  checkRecipients,
  explainSendError,
  isMailConfigured,
  mailMode,
  sendKey,
  sendKeyMatches,
  sendKeyRequired,
  missingMailConfig,
  parseRecipients,
  sendMail,
} from "@/lib/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Send the award letter as a PDF attachment.
 *
 * This delivers a contract to a real subcontractor, so it refuses rather than
 * guesses: no recipient, a malformed address, or an address outside the
 * configured allowlist all stop the send and say why.
 */
export async function POST(request: Request) {
  // Checked before anything else, so an unauthorised caller learns nothing
  // about the mail configuration or the letter payload.
  if (sendKeyRequired()) {
    if (!sendKey()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Sending is disabled on this deployment: LETTER_SEND_KEY is not set. A hosted deployment must require a key, otherwise anyone who finds the URL could send an award letter as the company.",
        },
        { status: 503 },
      );
    }
    if (!sendKeyMatches(request.headers.get("x-send-key") ?? "")) {
      return NextResponse.json(
        { ok: false, keyRequired: true, error: "Send key missing or incorrect." },
        { status: 401 },
      );
    }
  }

  if (!isMailConfigured()) {
    return NextResponse.json({
      ok: false,
      configured: false,
      error: missingMailConfig(),
    });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const input = parseLetterInput(body.letter);
  if (!input) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Missing or malformed letter details. A valid region is required — the letter's language and conditions follow from it.",
      },
      { status: 400 },
    );
  }

  /*
   * Refused before any recipient check and long before the mail is built. This
   * endpoint puts a contract in front of a subcontractor, so a region with no
   * letter of its own must not be able to send another region's terms.
   */
  if (!canRenderLetter(input.region)) {
    return NextResponse.json(
      { ok: false, error: new NoLetterTemplateError(regionFor(input.region).label).message },
      { status: 400 },
    );
  }

  const fileName = pdfFileName(
    input.jobName,
    templateFor(regionFor(input.region))?.fileSuffix ?? ".pdf",
  );

  const to = parseRecipients(String(body.to ?? ""));
  const cc = parseRecipients(String(body.cc ?? ""));
  const subject = String(body.subject ?? "").trim();
  const text = String(body.text ?? "").trim();

  if (!to.length) {
    return NextResponse.json(
      { ok: false, error: "Add at least one recipient." },
      { status: 400 },
    );
  }
  if (!subject) {
    return NextResponse.json({ ok: false, error: "Add a subject." }, { status: 400 });
  }

  const check = checkRecipients([...to, ...cc]);
  if (!check.ok) {
    const parts: string[] = [];
    if (check.invalid.length) {
      parts.push(`Not a valid address: ${check.invalid.join(", ")}`);
    }
    if (check.blocked.length) {
      parts.push(
        `Blocked by LETTER_SEND_ALLOWLIST: ${check.blocked.join(", ")}. ` +
          `Only ${allowlist().join(", ")} can be mailed while the allowlist is set.`,
      );
    }
    return NextResponse.json({ ok: false, error: parts.join(" ") }, { status: 400 });
  }

  try {
    const pdf = await htmlToPdf(renderLetter(input));
    // The office keeps a blind copy of every award letter that goes out.
    const bcc = archiveBcc().filter((a) => !to.includes(a) && !cc.includes(a));

    const { messageId, mode } = await sendMail({
      to,
      cc,
      bcc,
      subject,
      text,
      attachments: [
        {
          filename: fileName,
          content: Buffer.from(pdf),
          contentType: "application/pdf",
        },
      ],
    });

    return NextResponse.json({
      ok: true,
      configured: true,
      messageId,
      mode,
      to,
      cc,
      // Reported so the archive copy is verifiable. A blind copy that silently
      // stopped being applied would otherwise look identical to one that works.
      bcc,
      attachment: fileName,
      bytes: pdf.byteLength,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Send failed";
    console.error("[letter/send]", message);
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        mode: mailMode(),
        error: message + explainSendError(message),
      },
      { status: 502 },
    );
  }
}
