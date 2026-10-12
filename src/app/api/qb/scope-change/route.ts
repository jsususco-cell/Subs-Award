import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/quickbase";
import { refuseJob, refusePo } from "@/lib/auth/guard";
import {
  applyScopeChange,
  awardSchedule,
  existingAward,
  planScopeChange,
} from "@/lib/scope-change-server";
import { currentSession } from "@/lib/auth/current-user";
import { sendKey, sendKeyMatches, sendKeyRequired } from "@/lib/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * What a case is awarded today, and what a revised scope would do to it.
 *
 * Both verbs read. Nothing here writes: the comparison has to be on screen
 * and accepted before any milestone moves, so working out the change and
 * applying it are deliberately separate requests.
 *
 * GET  ?po=14107        -> the award as it stands
 * POST { poRecordId, revisedTotal } -> what would change, line by line
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  /*
   * Asked by case and subcontractor, which is what the upload step knows
   * before anything has been parsed: has this case been awarded to this
   * subcontractor already, and when. A null answer is the answer — it means
   * this is a first award, not a revision — so it comes back ok with
   * `award: null` rather than as a 404.
   */
  const jobRecordId = Number(params.get("job")) || 0;
  const subRecordId = Number(params.get("sub")) || 0;
  if (jobRecordId && subRecordId) {
    const refusedJob = await refuseJob(request, jobRecordId);
    if (refusedJob) return refusedJob;
    if (!isConfigured()) {
      return NextResponse.json({ ok: false, error: "Quickbase is not configured." }, { status: 503 });
    }
    return NextResponse.json({
      ok: true,
      award: await existingAward(jobRecordId, subRecordId),
    });
  }

  const poRecordId = Number(params.get("po")) || 0;
  if (!poRecordId) {
    return NextResponse.json(
      { ok: false, error: "A purchase order is required." },
      { status: 400 },
    );
  }

  // Addressed by purchase order, so the purchase order's own region decides.
  const refused = await refusePo(request, poRecordId);
  if (refused) return refused;

  if (!isConfigured()) {
    return NextResponse.json({ ok: false, error: "Quickbase is not configured." }, { status: 503 });
  }

  const schedule = await awardSchedule(poRecordId);
  if (!schedule) {
    return NextResponse.json(
      { ok: false, error: "That purchase order has no cost item, so there is no schedule to change." },
      { status: 404 },
    );
  }

  const billed = Math.round(schedule.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const paid = Math.round(
    schedule.lines.filter((l) => l.locked).reduce((s, l) => s + l.amount, 0) * 100,
  ) / 100;

  return NextResponse.json({
    ok: true,
    schedule: {
      ...schedule,
      billed,
      paid,
      unbilled: Math.round((schedule.contract - billed) * 100) / 100,
      openCount: schedule.lines.filter((l) => !l.locked).length,
    },
  });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const poRecordId = Number(body.poRecordId) || 0;
  const revisedTotal = Number(body.revisedTotal);

  if (!poRecordId) {
    return NextResponse.json(
      { ok: false, error: "A purchase order is required." },
      { status: 400 },
    );
  }
  if (!Number.isFinite(revisedTotal) || revisedTotal < 0) {
    return NextResponse.json(
      { ok: false, error: "The revised contract total must be a number of zero or more." },
      { status: 400 },
    );
  }

  const refused = await refusePo(request, poRecordId);
  if (refused) return refused;

  if (!isConfigured()) {
    return NextResponse.json({ ok: false, error: "Quickbase is not configured." }, { status: 503 });
  }

  const plan = await planScopeChange(poRecordId, revisedTotal);
  if (!plan) {
    return NextResponse.json(
      { ok: false, error: "That purchase order has no cost item, so there is no schedule to change." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, plan });
}

/**
 * Apply the change: the award's Unit Cost, then the milestones under it.
 *
 * Separate from working it out, and a different verb, so a review that has
 * been read is what precedes a write rather than the same request doing both.
 * Gated by the send key like every other route that writes to Quickbase.
 */
export async function PUT(request: Request) {
  if (sendKeyRequired()) {
    if (!sendKey()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Applying a scope change is disabled on this deployment: LETTER_SEND_KEY is not set.",
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const poRecordId = Number(body.poRecordId) || 0;
  const revisedTotal = Number(body.revisedTotal);
  if (!poRecordId || !Number.isFinite(revisedTotal) || revisedTotal < 0) {
    return NextResponse.json(
      { ok: false, error: "A purchase order and a revised total are required." },
      { status: 400 },
    );
  }

  const refused = await refusePo(request, poRecordId);
  if (refused) return refused;

  if (!isConfigured()) {
    return NextResponse.json({ ok: false, error: "Quickbase is not configured." }, { status: 503 });
  }

  const session = await currentSession();
  try {
    const result = await applyScopeChange(
      poRecordId,
      revisedTotal,
      session?.email ?? "scope-change",
    );
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "The change could not be applied.";
    console.error("[qb/scope-change] apply", message);
    return NextResponse.json(
      {
        ok: false,
        error: `Quickbase would not accept the change. ${message}`,
      },
      { status: 502 },
    );
  }
}
