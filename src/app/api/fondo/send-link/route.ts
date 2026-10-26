import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/quickbase";
import { QB_AWARD } from "@/lib/qb-award";
import {
  FONDO_FIELDS,
  FONDO_STATUS,
  fondoConfigured,
  missingFondoFields,
  fondoNoEmailReason,
  rejectManualSend,
} from "@/lib/fondo";
import {
  caseForSend,
  createSubmittal,
  openAwards,
  updateSubmittal,
  type OpenAward,
} from "@/lib/fondo-server";
import { fondoFormUrl, formRequestMail, returnedMail } from "@/lib/fondo-mail";
import {
  checkRecipients,
  isMailConfigured,
  missingMailConfig,
  sendKey,
  sendKeyMatches,
  sendKeyRequired,
  sendMail,
} from "@/lib/mail";
import { refuseRegion } from "@/lib/auth/guard";
import { currentSession } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Send one case's Fondo form link by hand.
 *
 * The scheduled notifier mails each case once, right after the award. This is
 * for everything after that: a subcontractor who lost the email, a case whose
 * vendor email was fixed, a returned poliza that needs chasing, or one of the
 * migrated cases that never had a link at all.
 *
 * It also covers open awards (the Fondo Coverage page's rule) that have no
 * Fondo case at all: sending opens the case first, then mails the link. And
 * awards whose poliza on file is short: the link asks for one that covers it.
 *
 * It stamps Form Sent like the notifier does, so the two never double up: a
 * case sent here is skipped by the next scheduled run.
 */
export async function POST(request: Request) {
  if (sendKeyRequired()) {
    if (!sendKey()) {
      return NextResponse.json(
        { ok: false, error: "Sending is disabled on this deployment: LETTER_SEND_KEY is not set." },
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

  // Fondo is Puerto Rico work; see /api/fondo/review.
  const refusedRegion = await refuseRegion(request, "PR");
  if (refusedRegion) return refusedRegion;

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
  if (!isMailConfigured()) {
    return NextResponse.json({ ok: false, error: missingMailConfig() }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  let recordId = Number(body.recordId) || 0;
  // An open award (new or short rows) is sent by its PO: the case may not exist yet.
  const poRecordId = Number(body.poRecordId) || 0;
  // Optional: send to someone other than the address on the vendor record,
  // for when that address is missing or wrong.
  const override = typeof body.to === "string" ? body.to.trim().slice(0, 200) : "";

  if (!recordId && !poRecordId) {
    return NextResponse.json({ ok: false, error: "No case given." }, { status: 400 });
  }

  // Re-read the award now rather than trusting the page: it may have been
  // covered, closed or given a case since the list was loaded.
  let award: OpenAward | null = null;
  if (poRecordId) {
    award = (await openAwards()).find((a) => a.poRecordId === poRecordId) ?? null;
    if (!award) {
      return NextResponse.json(
        { ok: false, error: "That award is no longer open or no longer needs Fondo coverage." },
        { status: 409 },
      );
    }
    const noEmail = fondoNoEmailReason(award.subcontractor);
    if (noEmail) return NextResponse.json({ ok: false, error: noEmail }, { status: 409 });
    recordId = award.caseRecordIds[0] ?? 0;
  }

  // No case for this award yet: open it, as an award made in this app would.
  let created = false;
  if (!recordId && award) {
    try {
      recordId = await createSubmittal(award, (await currentSession())?.email ?? "");
      created = true;
    } catch (e) {
      return NextResponse.json(
        {
          ok: false,
          error: `Could not open the Fondo case, so nothing was sent: ${
            e instanceof Error ? e.message : "create failed"
          }`,
        },
        { status: 502 },
      );
    }
  }

  const found = await caseForSend(recordId);
  if (!found) {
    return NextResponse.json({ ok: false, error: "That case no longer exists." }, { status: 404 });
  }
  const short = Boolean(award && award.gap > 0);
  const refused = rejectManualSend(found.status, found.hasPoliza, short);
  if (refused) return NextResponse.json({ ok: false, error: refused }, { status: 409 });
  const noEmail = fondoNoEmailReason(found.vendor?.company ?? found.subcontractor);
  if (noEmail) return NextResponse.json({ ok: false, error: noEmail }, { status: 409 });

  if (!found.vendor) {
    return NextResponse.json(
      { ok: false, error: "No subcontractor on the case, so there is no link to send." },
      { status: 400 },
    );
  }
  if (!found.vendor.accessKey) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "The subcontractor has no access key (Subs/Vendors field 66), so the link cannot be built.",
      },
      { status: 400 },
    );
  }

  const to = override || found.vendor.email;
  if (!to) {
    return NextResponse.json(
      { ok: false, error: "The subcontractor has no email on file. Type one in to send it." },
      { status: 400 },
    );
  }
  const check = checkRecipients([to]);
  if (!check.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: check.blocked.length
          ? `${to} is not on the send allowlist.`
          : `${to} is not a valid address.`,
      },
      { status: 400 },
    );
  }

  const formUrl = fondoFormUrl(found.vendor.accessKey, recordId);
  if (!formUrl) {
    return NextResponse.json(
      { ok: false, error: "APP_BASE_URL is not set, so the link would be broken. Nothing was sent." },
      { status: 503 },
    );
  }

  const shape = {
    caseNumber: found.caseNumber,
    subcontractor: found.subcontractor,
    // What the poliza has to cover now: the award plus approved change orders.
    awardedAmount: award?.required ?? found.awardedAmount,
    formUrl,
  };
  // A returned case gets the correction notice again, so the reason travels
  // with the link instead of the subcontractor having to find the old email.
  const mail =
    found.status === FONDO_STATUS.returned && found.reviewNotes
      ? returnedMail(shape, found.reviewNotes)
      : formRequestMail(shape);

  try {
    await sendMail({
      to: [to],
      cc: [],
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      attachments: [],
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `The email did not go out: ${e instanceof Error ? e.message : "send failed"}` },
      { status: 502 },
    );
  }

  const sentAt = new Date().toISOString();
  const stamp: Record<string, { value: unknown }> = {
    [QB_AWARD.insurance.recordId]: { value: recordId },
    [FONDO_FIELDS.formSentAt]: { value: sentAt },
  };
  // Once asked, the case is awaiting the subcontractor: a migrated case had no
  // status, and an approved-but-short one has to reopen or the form refuses it.
  if (found.status === "" || found.status === FONDO_STATUS.approved) {
    stamp[FONDO_FIELDS.status] = { value: FONDO_STATUS.awaiting };
  }
  // Compare future uploads against what the award needs today.
  if (award) stamp[QB_AWARD.insurance.awardedAmount] = { value: award.required };

  let stampError: string | null = null;
  try {
    await updateSubmittal(stamp);
  } catch (e) {
    stampError = `The email went out, but Quickbase did not record when: ${
      e instanceof Error ? e.message : "update failed"
    }`;
  }

  return NextResponse.json({ ok: true, recordId, created, to, sentAt, stampError });
}
