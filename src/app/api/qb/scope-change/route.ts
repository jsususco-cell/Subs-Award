import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/quickbase";
import { refusePo } from "@/lib/auth/guard";
import { awardSchedule, planScopeChange } from "@/lib/scope-change-server";

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
  const poRecordId = Number(new URL(request.url).searchParams.get("po")) || 0;
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
