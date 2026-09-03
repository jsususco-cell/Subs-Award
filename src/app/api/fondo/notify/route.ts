import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/quickbase";
import { FONDO_FIELDS, fondoConfigured, missingFondoFields } from "@/lib/fondo";
import { QB_AWARD } from "@/lib/qb-award";
import { pendingNotices, updateSubmittal } from "@/lib/fondo-server";
import { fondoFormUrl, formRequestMail } from "@/lib/fondo-mail";
import {
  checkRecipients,
  isMailConfigured,
  missingMailConfig,
  sendKey,
  sendKeyMatches,
  sendMail,
} from "@/lib/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Ask subcontractors for the poliza on the cases that have just been awarded.
 *
 * Runs on a schedule rather than at award time, which is what puts a few
 * minutes between the award letter and this — two emails landing in the same
 * second train people to read neither.
 *
 * Sending is one case at a time and each is stamped the moment it succeeds, so
 * a run that dies half way has still recorded what went out. The alternative,
 * stamping them all at the end, would re-mail everyone on the next run.
 */
function authorised(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    const header = request.headers.get("authorization") ?? "";
    if (header === `Bearer ${cronSecret}`) return true;
  }
  if (sendKey() && sendKeyMatches(request.headers.get("x-send-key") ?? "")) return true;
  return false;
}

export async function POST(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
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
  if (!isMailConfigured()) {
    return NextResponse.json(
      { ok: false, error: missingMailConfig() },
      { status: 503 },
    );
  }

  const { ready, unreachable } = await pendingNotices();
  const sent: number[] = [];
  const failed: { recordId: number; error: string }[] = [];

  for (const item of ready) {
    const url = fondoFormUrl(item.accessKey, item.recordId);
    if (!url) {
      failed.push({
        recordId: item.recordId,
        error:
          "APP_BASE_URL is not set, so the email would carry a broken link. Nothing was sent.",
      });
      continue;
    }

    // The rollout rail applies here too: a case whose subcontractor is not on
    // the allowlist is skipped rather than mailed.
    const check = checkRecipients([item.email]);
    if (!check.ok) {
      failed.push({
        recordId: item.recordId,
        error: check.blocked.length
          ? `${item.email} is not on the send allowlist.`
          : `${item.email} is not a valid address.`,
      });
      continue;
    }

    const mail = formRequestMail({
      caseNumber: item.caseNumber,
      subcontractor: item.subcontractor,
      awardedAmount: item.awardedAmount,
      formUrl: url,
    });

    try {
      await sendMail({
        to: [item.email],
        cc: [],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        attachments: [],
      });
    } catch (e) {
      failed.push({
        recordId: item.recordId,
        error: e instanceof Error ? e.message : "send failed",
      });
      continue;
    }

    // Stamped only after the send succeeded, so a failure is retried next run.
    try {
      await updateSubmittal({
        [QB_AWARD.insurance.recordId]: { value: item.recordId },
        [FONDO_FIELDS.formSentAt]: { value: new Date().toISOString() },
      });
      sent.push(item.recordId);
    } catch (e) {
      // The email is already gone. Say so loudly: without the stamp the next
      // run will send it again, and a duplicate is better than silence about it.
      failed.push({
        recordId: item.recordId,
        error: `The email was sent but Quickbase would not record it, so this case may be emailed again: ${
          e instanceof Error ? e.message : "update failed"
        }`,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    sent: sent.length,
    sentRecordIds: sent,
    failed,
    unreachable,
  });
}

/** Vercel Cron issues GET, so it shares the same handler. */
export const GET = POST;
