import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/quickbase";
import { refusePo } from "@/lib/auth/guard";
import { advanceContext, applyAdvance, planAdvanceFor } from "@/lib/advance-server";
import { currentSession } from "@/lib/auth/current-user";
import { sendKey, sendKeyMatches, sendKeyRequired } from "@/lib/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Paying part of a milestone early.
 *
 * POST works out what would change and writes nothing. PUT applies it. The
 * same split as a scope change, and for the same reason: the figures should
 * be on screen and accepted before two billing lines are rewritten.
 *
 * Addressed by the billing line, because that is the milestone the money
 * comes out of. Its purchase order is reached through its cost item, and that
 * purchase order's region decides who may do this.
 */
async function guard(request: Request, billRecordId: number) {
  const context = await advanceContext(billRecordId);
  if (!context) {
    return {
      refusal: NextResponse.json(
        { ok: false, error: "That milestone could not be found." },
        { status: 404 },
      ),
    };
  }
  const refused = await refusePo(request, context.poRecordId);
  return refused ? { refusal: refused } : { context };
}

function parseBody(body: Record<string, unknown>) {
  return {
    billRecordId: Number(body.billRecordId) || 0,
    advance: Number(body.advance),
  };
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { billRecordId, advance } = parseBody(body);
  if (!billRecordId) {
    return NextResponse.json({ ok: false, error: "A milestone is required." }, { status: 400 });
  }
  if (!isConfigured()) {
    return NextResponse.json({ ok: false, error: "Quickbase is not configured." }, { status: 503 });
  }

  const { refusal } = await guard(request, billRecordId);
  if (refusal) return refusal;

  const proposal = await planAdvanceFor(billRecordId, advance);
  if (!proposal) {
    return NextResponse.json(
      { ok: false, error: "That milestone could not be found." },
      { status: 404 },
    );
  }
  return NextResponse.json({
    ok: true,
    poNumber: proposal.context.poNumber,
    builderCost: proposal.context.builderCost,
    plan: proposal.plan,
  });
}

export async function PUT(request: Request) {
  if (sendKeyRequired()) {
    if (!sendKey()) {
      return NextResponse.json(
        {
          ok: false,
          error: "Advance payments are disabled on this deployment: LETTER_SEND_KEY is not set.",
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

  const { billRecordId, advance } = parseBody(body);
  if (!billRecordId || !Number.isFinite(advance)) {
    return NextResponse.json(
      { ok: false, error: "A milestone and an amount are required." },
      { status: 400 },
    );
  }
  if (!isConfigured()) {
    return NextResponse.json({ ok: false, error: "Quickbase is not configured." }, { status: 503 });
  }

  const { refusal } = await guard(request, billRecordId);
  if (refusal) return refusal;

  const session = await currentSession();
  try {
    const result = await applyAdvance(billRecordId, advance, session?.email ?? "advance");
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "The advance could not be applied.";
    console.error("[qb/advance] apply", message);
    return NextResponse.json(
      {
        ok: false,
        error: `Quickbase would not accept the advance. ${message} Check the milestone before trying again — the reduction may have gone through without the bill.`,
      },
      { status: 502 },
    );
  }
}
