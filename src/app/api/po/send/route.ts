import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/quickbase";
import { htmlToPdf, pdfFileName } from "@/lib/pdf";
import { isReleased, renderPoDocument } from "@/lib/po-doc";
import { poBody, poSubject } from "@/lib/po-email";
import {
  fetchPoDocument,
  markPoSent,
  PoNotFoundError,
  PoNotInRegionError,
  PoNotReleasedError,
} from "@/lib/qb-po-doc";
import { regionFor } from "@/lib/regions";
import { refuseRegion } from "@/lib/auth/guard";
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

  const refused = await refuseRegion(request, body.region);
  if (refused) return refused;
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
   * Releasing is what sends a purchase order, so the status on the record is
   * what decides — not the caller, and not a box on a screen. Checked against
   * what Quickbase holds right now, after the read and before the mail, so a
   * purchase order pulled back to Unreleased stops going out even if the
   * request to send it was already on its way.
   */
  if (!isReleased(doc.status)) {
    return NextResponse.json(
      {
        ok: false,
        notReleased: true,
        error: new PoNotReleasedError(doc.poNumber, doc.status).message,
      },
      { status: 409 },
    );
  }

  /*
   * Sent once. The trigger for a send lives outside this app — a release in
   * Quickbase, an n8n run, a retried webhook, someone clicking twice — and any
   * of those can fire again for a purchase order that already went out. The
   * record says whether it has.
   *
   * `resend: true` is the deliberate override, for when a subcontractor has
   * genuinely lost the mail. It is never set by the automation.
   */
  const resend = body.resend === true;
  if (doc.sentToSubAt && !resend) {
    return NextResponse.json(
      {
        ok: false,
        alreadySent: true,
        sentAt: doc.sentToSubAt,
        poNumber: doc.poNumber,
        error:
          `${doc.poNumber || "That purchase order"} was already sent to the ` +
          `subcontractor on ${doc.sentToSubAt}, so it was not sent again. ` +
          `Pass resend to send it anyway.`,
      },
      { status: 409 },
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

    /*
     * The mail is away, so from here nothing may report the send as failed.
     * If the marker cannot be written the send still happened — say so, and
     * say loudly that the next trigger will send it again, rather than
     * swallowing it and letting the subcontractor receive a second copy with
     * no explanation.
     */
    const sentAt = new Date();
    let markError: string | null = null;
    try {
      await markPoSent(poRecordId, sentAt);
    } catch (e) {
      markError = e instanceof Error ? e.message : "could not record the send";
      console.error("[po/send] mark", markError);
    }

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
      resent: resend && Boolean(doc.sentToSubAt),
      sentAt: sentAt.toISOString(),
      ...(markError
        ? {
            warning:
              `The purchase order was sent, but recording that on the record ` +
              `failed: ${markError}. Nothing stops it being sent again — set ` +
              `"PO Sent to Sub At" on ${doc.poNumber} by hand.`,
          }
        : {}),
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
