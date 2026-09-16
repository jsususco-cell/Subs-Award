import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/quickbase";
import { htmlToPdf, pdfFileName } from "@/lib/pdf";
import { renderPoDocument } from "@/lib/po-doc";
import { poBody, poSubject } from "@/lib/po-email";
import {
  fetchPoDocument,
  PoNotFoundError,
  PoNotInRegionError,
} from "@/lib/qb-po-doc";
import { regionFor } from "@/lib/regions";
import {
  allowlist,
  archiveBcc,
  checkRecipients,
  explainSendError,
  isMailConfigured,
  mailMode,
  missingMailConfig,
  parseRecipients,
  sendKey,
  sendKeyMatches,
  sendKeyRequired,
  sendMail,
} from "@/lib/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Email the purchase order to the subcontractor as a PDF attachment.
 *
 * Gated exactly like the award letter, and for the same reason: this puts a
 * binding offer in front of a real company. The document is built from the
 * Quickbase record rather than from the request, so the caller chooses who
 * receives a purchase order but never what it says.
 */
export async function POST(request: Request) {
  if (sendKeyRequired()) {
    if (!sendKey()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Sending is disabled on this deployment: LETTER_SEND_KEY is not set. A hosted deployment must require a key, otherwise anyone who finds the URL could send a purchase order as the company.",
        },
        { status: 503 },
      );
    }
    if (!sendKeyMatches(request.headers.get("x-send-key") ?? "")) {
      return NextResponse.json(
        {
          ok: false,
          keyRequired: true,
          error: "Send key missing or incorrect.",
        },
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
  if (!isConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error: "Quickbase is not configured — QB_USER_TOKEN is not set.",
      },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  const region = regionFor(body.region);
  const poRecordId = Number(body.poRecordId) || 0;

  /*
   * Refused before any recipient is looked at. A region that does not send
   * purchase orders to subcontractors must not be able to start doing so by
   * way of a request that happens to name it.
   */
  if (!region.poDocument) {
    return NextResponse.json(
      {
        ok: false,
        error: `${region.label} does not send a purchase order document to subcontractors.`,
      },
      { status: 400 },
    );
  }
  if (!poRecordId) {
    return NextResponse.json(
      { ok: false, error: "A purchase order record id is required." },
      { status: 400 },
    );
  }

  const to = parseRecipients(String(body.to ?? ""));
  const cc = parseRecipients(String(body.cc ?? ""));
  if (!to.length) {
    return NextResponse.json(
      { ok: false, error: "Add at least one recipient." },
      { status: 400 },
    );
  }

  const check = checkRecipients([...to, ...cc]);
  if (!check.ok) {
    const parts: string[] = [];
    if (check.invalid.length)
      parts.push(`Not a valid address: ${check.invalid.join(", ")}`);
    if (check.blocked.length) {
      parts.push(
        `Blocked by LETTER_SEND_ALLOWLIST: ${check.blocked.join(", ")}. ` +
          `Only ${allowlist().join(", ")} can be mailed while the allowlist is set.`,
      );
    }
    return NextResponse.json(
      { ok: false, error: parts.join(" ") },
      { status: 400 },
    );
  }

  let doc;
  try {
    doc = await fetchPoDocument(region, poRecordId);
  } catch (e) {
    if (e instanceof PoNotFoundError || e instanceof PoNotInRegionError) {
      return NextResponse.json(
        { ok: false, error: e.message },
        { status: 400 },
      );
    }
    const message =
      e instanceof Error ? e.message : "Could not read the purchase order";
    console.error("[po/send] read", message);
    return NextResponse.json(
      {
        ok: false,
        error: `Could not read the purchase order, so nothing was sent: ${message}`,
      },
      { status: 502 },
    );
  }

  /*
   * The subject and the note may be overridden; the attachment may not. What
   * the subcontractor is being offered comes from the record.
   */
  const subject = String(body.subject ?? "").trim() || poSubject(doc);
  const text = String(body.text ?? "").trim() || poBody(doc);
  const fileName = pdfFileName(doc.poNumber || `PO-${poRecordId}`, ".pdf");

  try {
    const pdf = await htmlToPdf(renderPoDocument(doc));
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
      bcc,
      poNumber: doc.poNumber,
      attachment: fileName,
      bytes: pdf.byteLength,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Send failed";
    console.error("[po/send]", message);
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
