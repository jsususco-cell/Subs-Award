import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/quickbase";
import { QB_AWARD } from "@/lib/qb-award";
import { FONDO_FIELDS, REMINDER_MAX, fondoConfigured, missingFondoFields } from "@/lib/fondo";
import { dueReminders, updateSubmittal } from "@/lib/fondo-server";
import { fondoFormUrl, reminderBcc, reminderCc, reminderMail } from "@/lib/fondo-mail";
import { recordFondo } from "@/lib/fondo-history";
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
 * Daily Fondo reminders: once a day for up to 7 days after the form link went
 * out, until the subcontractor submits. Called by n8n once a day.
 *
 * Each case is stamped (count + time) the moment its email succeeds, so a run
 * that dies half way does not re-send what already went.
 *
 *   ?dryRun=1        list what is due; send and stamp nothing
 *   ?testTo=<email>  send the first due reminder to that address only, with no
 *                    CC/BCC, and stamp nothing (to see the email)
 */
function authorised(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`) return true;
  return Boolean(sendKey() && sendKeyMatches(request.headers.get("x-send-key") ?? ""));
}

/** Per run, so one day's batch cannot run past the function's time limit. */
const PER_RUN = 30;

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
    return NextResponse.json({ ok: false, error: missingMailConfig() }, { status: 503 });
  }

  const params = new URL(request.url).searchParams;
  const dryRun = params.get("dryRun") === "1";
  const testTo = (params.get("testTo") ?? "").trim();

  const due = await dueReminders();
  const sendable = due.filter((d) => !d.blocked);
  const skipped = due.filter((d) => d.blocked).map((d) => ({ recordId: d.recordId, caseNumber: d.caseNumber, why: d.blocked }));

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      due: sendable.map((d) => ({ recordId: d.recordId, caseNumber: d.caseNumber, subcontractor: d.subcontractor, n: d.n, to: d.email })),
      skipped,
      cc: reminderCc(),
      bcc: reminderBcc(),
    });
  }

  const sent: number[] = [];
  const failed: { recordId: number; error: string }[] = [];

  for (const d of testTo ? sendable.slice(0, 1) : sendable.slice(0, PER_RUN)) {
    const formUrl = fondoFormUrl(d.accessKey, d.recordId);
    if (!formUrl) {
      failed.push({ recordId: d.recordId, error: "APP_BASE_URL is not set; the link would be broken." });
      continue;
    }
    const to = testTo ? [testTo] : [d.email];
    const cc = testTo ? [] : reminderCc().filter((a) => a !== d.email.toLowerCase());
    const bcc = testTo ? [] : reminderBcc().filter((a) => a !== d.email.toLowerCase() && !cc.includes(a));
    const check = checkRecipients([...to, ...cc]);
    if (!check.ok) {
      failed.push({
        recordId: d.recordId,
        error: check.blocked.length
          ? `Not on the send allowlist: ${check.blocked.join(", ")}`
          : `Not a valid address: ${check.invalid.join(", ")}`,
      });
      continue;
    }
    const mail = reminderMail(
      { caseNumber: d.caseNumber, subcontractor: d.subcontractor, awardedAmount: d.awardedAmount, formUrl },
      d.n,
      REMINDER_MAX,
    );
    try {
      await sendMail({
        to,
        cc,
        bcc,
        subject: testTo ? `[TEST] ${mail.subject}` : mail.subject,
        text: mail.text,
        html: mail.html,
        attachments: [],
      });
    } catch (e) {
      failed.push({ recordId: d.recordId, error: e instanceof Error ? e.message : "send failed" });
      continue;
    }
    if (testTo) {
      sent.push(d.recordId);
      continue;
    }
    try {
      await updateSubmittal({
        [QB_AWARD.insurance.recordId]: { value: d.recordId },
        [FONDO_FIELDS.reminderCount]: { value: d.n },
        [FONDO_FIELDS.lastReminderAt]: { value: new Date().toISOString() },
      });
      sent.push(d.recordId);
    } catch (e) {
      // Already sent: say so loudly, since without the stamp it goes again tomorrow early.
      failed.push({
        recordId: d.recordId,
        error: `Reminder sent, but Quickbase did not record it: ${e instanceof Error ? e.message : "update failed"}`,
      });
    }
    await recordFondo(
      "reminder.sent",
      d.recordId,
      "system",
      `Reminder ${d.n} of ${REMINDER_MAX} emailed to ${d.email}.`,
    );
  }

  return NextResponse.json({
    ok: true,
    test: Boolean(testTo),
    sent: sent.length,
    sentRecordIds: sent,
    failed,
    skipped,
    remaining: Math.max(0, sendable.length - (testTo ? 0 : PER_RUN)),
  });
}

/** Vercel Cron issues GET, so it shares the same handler. */
export const GET = POST;
