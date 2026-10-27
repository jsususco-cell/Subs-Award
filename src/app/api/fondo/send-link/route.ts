import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/quickbase";
import { QB_AWARD } from "@/lib/qb-award";
import {
  FONDO_FIELDS,
  FONDO_STATUS,
  fondoConfigured,
  missingFondoFields,
  fondoHiddenSub,
  fondoNoEmailReason,
  rejectManualSend,
} from "@/lib/fondo";
import {
  caseForSend,
  createSubmittal,
  openAwards,
  sendQueue,
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
import { recordFondo } from "@/lib/fondo-history";
import { money } from "@/lib/format";

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

  // A pooled subcontractor's combined row: one email, one poliza for the total.
  if (typeof body.pool === "string" && body.pool) {
    return sendPool(body.pool, override);
  }

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
    if (fondoHiddenSub(award.subcontractor)) {
      return NextResponse.json({ ok: false, error: "This subcontractor is excluded from Fondo emails." }, { status: 409 });
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
  if (fondoHiddenSub(found.vendor?.company || found.subcontractor)) {
    return NextResponse.json({ ok: false, error: "This subcontractor is excluded from Fondo emails." }, { status: 409 });
  }
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
  // Once asked, the case is awaiting the subcontractor: a migrated case had no status.
  if (found.status === "") {
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

  const actor = (await currentSession())?.email ?? "";
  if (created && award) {
    await recordFondo(
      "case.opened",
      recordId,
      actor,
      `Case opened from Send link for PO ${award.poNumber}; required coverage ${money(award.required)}.`,
    );
  }
  await recordFondo("link.sent", recordId, actor, `Form link emailed to ${to}${short ? " (asking for a poliza that covers the award)" : ""}.`);

  return NextResponse.json({ ok: true, recordId, created, to, sentAt, stampError });
}

/**
 * Send the combined row of a pooled subcontractor (fondoPoolOf).
 *
 * Every open award in the pool that has no case yet gets one, then ONE email
 * asks for one poliza covering the total, with the link on the lead case (the
 * oldest). Every case in the pool is stamped as sent, so the automatic sender
 * and the per-case reminders treat them as one. Approving the lead's upload
 * records the poliza on all of them (see /api/fondo/review).
 */
async function sendPool(pool: string, override: string) {
  const row = (await sendQueue()).find((i) => i.pool === pool);
  if (!row || !row.members?.length) {
    return NextResponse.json({ ok: false, error: "Nothing in that group is still owed a poliza." }, { status: 409 });
  }
  const actor = (await currentSession())?.email ?? "";

  // Open the missing cases first; nothing is emailed if any of them fails.
  const awards = row.members.some((m) => !m.recordId) ? await openAwards() : [];
  const members: { recordId: number; caseNumber: string; amount: number; created: boolean }[] = [];
  for (const m of row.members) {
    if (m.recordId) {
      members.push({ recordId: m.recordId, caseNumber: m.caseNumber, amount: m.amount, created: false });
      continue;
    }
    const award = awards.find((a) => a.poRecordId === m.poRecordId);
    if (!award) continue; // closed or covered since the list loaded
    try {
      const id = await createSubmittal(award, actor);
      members.push({ recordId: id, caseNumber: m.caseNumber, amount: award.required, created: true });
    } catch (e) {
      return NextResponse.json(
        {
          ok: false,
          error: `Could not open the Fondo case for ${m.caseNumber}, so nothing was sent: ${
            e instanceof Error ? e.message : "create failed"
          }`,
        },
        { status: 502 },
      );
    }
  }

  // Re-check each case now; one already submitted or approved drops out.
  const live: { recordId: number; caseNumber: string; amount: number; created: boolean; status: string }[] = [];
  let vendor: { accessKey: string; email: string; company: string } | null = null;
  let leadNotes = "";
  for (const m of members.sort((a, b) => a.recordId - b.recordId)) {
    const found = await caseForSend(m.recordId);
    if (!found) continue;
    const short = row.members.find((x) => x.caseNumber === m.caseNumber)?.kind === "short";
    if (rejectManualSend(found.status, found.hasPoliza, short)) continue;
    vendor ??= found.vendor;
    if (!live.length) leadNotes = found.status === FONDO_STATUS.returned ? found.reviewNotes : "";
    live.push({ ...m, status: found.status });
  }
  if (!live.length) {
    return NextResponse.json({ ok: false, error: "Nothing in that group is still owed a poliza." }, { status: 409 });
  }
  if (!vendor?.accessKey) {
    return NextResponse.json(
      { ok: false, error: "The subcontractor has no access key (Subs/Vendors field 66), so the link cannot be built." },
      { status: 400 },
    );
  }
  const to = override || vendor.email;
  if (!to) {
    return NextResponse.json({ ok: false, error: "The subcontractor has no email on file. Type one in to send it." }, { status: 400 });
  }
  const check = checkRecipients([to]);
  if (!check.ok) {
    return NextResponse.json(
      { ok: false, error: check.blocked.length ? `${to} is not on the send allowlist.` : `${to} is not a valid address.` },
      { status: 400 },
    );
  }

  const lead = live[0];
  const formUrl = fondoFormUrl(vendor.accessKey, lead.recordId);
  if (!formUrl) {
    return NextResponse.json({ ok: false, error: "APP_BASE_URL is not set, so the link would be broken. Nothing was sent." }, { status: 503 });
  }
  const total = Math.round(live.reduce((t, m) => t + m.amount, 0) * 100) / 100;
  const shape = {
    caseNumber: lead.caseNumber,
    subcontractor: row.subcontractor,
    awardedAmount: total,
    formUrl,
    cases: live.map((m) => m.caseNumber),
  };
  const mail = leadNotes ? returnedMail(shape, leadNotes) : formRequestMail(shape);
  try {
    await sendMail({ to: [to], cc: [], subject: mail.subject, text: mail.text, html: mail.html, attachments: [] });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `The email did not go out: ${e instanceof Error ? e.message : "send failed"}` },
      { status: 502 },
    );
  }

  const sentAt = new Date().toISOString();
  let stampError: string | null = null;
  for (const m of live) {
    const stamp: Record<string, { value: unknown }> = {
      [QB_AWARD.insurance.recordId]: { value: m.recordId },
      [FONDO_FIELDS.formSentAt]: { value: sentAt },
      [QB_AWARD.insurance.awardedAmount]: { value: m.amount },
    };
    if (m.status === "") stamp[FONDO_FIELDS.status] = { value: FONDO_STATUS.awaiting };
    try {
      await updateSubmittal(stamp);
    } catch (e) {
      stampError = `The email went out, but Quickbase did not record it on every case: ${
        e instanceof Error ? e.message : "update failed"
      }`;
    }
    if (m.created) {
      await recordFondo("case.opened", m.recordId, actor, `Case opened from the ${row.subcontractor} combined row.`);
    }
    await recordFondo(
      "link.sent",
      m.recordId,
      actor,
      `One link for ${live.length} cases (${shape.cases.join(", ")}), one poliza for ${money(total)}, emailed to ${to}. Upload goes to ${lead.caseNumber}.`,
    );
  }

  return NextResponse.json({
    ok: true,
    recordId: lead.recordId,
    created: live.some((m) => m.created),
    to,
    sentAt,
    stampError,
    cases: shape.cases,
    total,
  });
}
