import { NextResponse } from "next/server";
import { renderLetter } from "@/lib/letter";
import { parseLetterInput } from "@/lib/letter-input";
import { htmlToPdf, pdfFileName } from "@/lib/pdf";
import {
  MAIL_CONFIG,
  checkRecipients,
  explainSendError,
  isMailConfigured,
  mailMode,
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
      { ok: false, error: "Missing or malformed letter details" },
      { status: 400 },
    );
  }

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
          `Only ${MAIL_CONFIG.allowlist.join(", ")} can be mailed while the allowlist is set.`,
      );
    }
    return NextResponse.json({ ok: false, error: parts.join(" ") }, { status: 400 });
  }

  try {
    const pdf = await htmlToPdf(renderLetter(input));
    const { messageId, mode } = await sendMail({
      to,
      cc,
      subject,
      text,
      attachments: [
        {
          filename: pdfFileName(input.jobName),
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
      attachment: pdfFileName(input.jobName),
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
