import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/quickbase";
import {
  buildApprovalRecord,
  buildReturnRecord,
  fondoConfigured,
  missingFondoFields,
  rejectReturn,
} from "@/lib/fondo";
import { polizaFile, stagedFor, updateSubmittal, vendorById } from "@/lib/fondo-server";
import { approvedMail, fondoFormUrl, returnedMail } from "@/lib/fondo-mail";
import {
  checkRecipients,
  isMailConfigured,
  sendKey,
  sendKeyMatches,
  sendKeyRequired,
  sendMail,
} from "@/lib/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Approve a Fondo poliza, or send it back for correction.
 *
 * Approving is the only path that writes Insurance Amount (13) and Poliza (14),
 * which is what makes Coverage Status on the insurance page mean something.
 *
 * The Quickbase write happens first and the email second: a subcontractor told
 * their poliza was accepted when the record did not save would stop chasing it,
 * which is the worse failure. If the email then fails, the decision still
 * stands and the response says the notice did not go out.
 */
export async function POST(request: Request) {
  if (sendKeyRequired()) {
    if (!sendKey()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Reviewing is disabled on this deployment: LETTER_SEND_KEY is not set.",
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

  if (!isConfigured() || !fondoConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: fondoConfigured()
          ? "Quickbase is not configured."
          : `The Fondo fields are not set up yet: ${missingFondoFields().join(", ")}.`,
      },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const recordId = Number(body.recordId) || 0;
  const action = body.action === "approve" ? "approve" : "return";
  const notes = typeof body.notes === "string" ? body.notes.slice(0, 4000) : "";
  const reviewer =
    typeof body.reviewer === "string" ? body.reviewer.slice(0, 120) : "";

  if (!recordId) {
    return NextResponse.json({ ok: false, error: "No case given." }, { status: 400 });
  }
  if (action === "return") {
    const problem = rejectReturn(notes);
    if (problem) return NextResponse.json({ ok: false, error: problem }, { status: 400 });
  }

  const staged = await stagedFor(recordId);
  if (!staged) {
    return NextResponse.json({ ok: false, error: "That case no longer exists." }, { status: 404 });
  }
  if (action === "approve" && !(staged.amount > 0)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "There is no submitted amount on this case, so there is nothing to approve.",
      },
      { status: 400 },
    );
  }

  // Approving has to carry the document across, not just the figure. Coverage
  // Status reads "NO POLICY ON FILE" while the Poliza field is empty, so an
  // approval without the bytes would record a decision that changes nothing.
  // The bytes have to be fetched: what a query returns is a reference, and
  // writing a reference back uploads nothing.
  let file: { fileName: string; data: string } | null = null;
  if (action === "approve") {
    const fetched = await polizaFile(recordId);
    if (!fetched) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "The submitted document could not be read, so approving would leave the case showing no policy on file. Nothing was changed.",
        },
        { status: 502 },
      );
    }
    file = {
      fileName: fetched.fileName,
      data: fetched.body.toString("base64"),
    };
  }

  try {
    await updateSubmittal(
      action === "approve"
        ? buildApprovalRecord(recordId, { ...staged, file }, reviewer)
        : buildReturnRecord(recordId, notes, reviewer),
    );
  } catch (e) {
    console.error("[fondo/review]", e instanceof Error ? e.message : e);
    return NextResponse.json(
      {
        ok: false,
        error: "Quickbase would not accept the change, so nothing was recorded.",
      },
      { status: 502 },
    );
  }

  // Decision recorded. Anything below can only fail to *notify*.
  let notified = false;
  let notifyError: string | null = null;

  const vendor = await vendorById(staged.vendorRecordId);
  if (!vendor?.email) {
    notifyError = "The subcontractor has no email address on file, so no notice was sent.";
  } else if (!isMailConfigured()) {
    notifyError = "Email is not configured on this deployment, so no notice was sent.";
  } else if (!checkRecipients([vendor.email]).ok) {
    notifyError = `${vendor.email} is not on the send allowlist, so no notice was sent.`;
  } else {
    const shape = {
      caseNumber: staged.caseNumber,
      subcontractor: staged.subcontractor || vendor.company,
      awardedAmount: staged.awardedAmount,
      formUrl: fondoFormUrl(vendor.accessKey, recordId),
    };
    const mail = action === "approve" ? approvedMail(shape) : returnedMail(shape, notes);
    try {
      await sendMail({
        to: [vendor.email],
        cc: [],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        attachments: [],
      });
      notified = true;
    } catch (e) {
      notifyError = `The decision was saved but the email did not go out: ${
        e instanceof Error ? e.message : "send failed"
      }`;
    }
  }

  return NextResponse.json({
    ok: true,
    action,
    recordId,
    notified,
    notifyError,
  });
}
