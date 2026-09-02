import { NextResponse } from "next/server";
import { QB_CONFIG, isConfigured } from "@/lib/quickbase";
import {
  QB_AWARD,
  buildBillRecords,
  buildCostItemRecord,
  buildPoRecord,
  type AwardWriteInput,
  type QbRecord,
} from "@/lib/qb-award";
import { sendKey, sendKeyMatches, sendKeyRequired } from "@/lib/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Create the purchase order, its cost item and the billing lines in Quickbase.
 *
 * This writes financial records to a live system, so it is gated by the same
 * key as sending and refuses rather than guesses. Quickbase has no
 * transactions: the three writes happen in order and a failure part-way
 * reports exactly what was already created, with record ids, rather than
 * pretending nothing happened or silently deleting it.
 */
async function createRecords(
  tableId: string,
  data: QbRecord[],
  fieldsToReturn: number[],
): Promise<number[]> {
  const res = await fetch("https://api.quickbase.com/v1/records", {
    method: "POST",
    headers: {
      "QB-Realm-Hostname": QB_CONFIG.realm,
      Authorization: `QB-USER-TOKEN ${QB_CONFIG.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to: tableId, data, fieldsToReturn }),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Quickbase ${res.status} writing ${tableId}: ${text.slice(0, 300)}`);
  }

  const body = JSON.parse(text) as {
    metadata?: { createdRecordIds?: number[]; lineErrors?: unknown };
  };
  const ids = body.metadata?.createdRecordIds ?? [];
  if (!ids.length) {
    throw new Error(
      `Quickbase accepted the request but created nothing in ${tableId}: ${JSON.stringify(
        body.metadata?.lineErrors ?? body.metadata ?? {},
      ).slice(0, 300)}`,
    );
  }
  return ids;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.slice(0, 2000) : "";
}

function parseInput(raw: unknown): AwardWriteInput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const jobRecordId = num(o.jobRecordId);
  const subRecordId = num(o.subRecordId);
  const award = num(o.award);
  if (!jobRecordId || !subRecordId || !(award > 0)) return null;

  return {
    jobRecordId,
    subRecordId,
    title: str(o.title),
    scope: str(o.scope),
    poStatus: str(o.poStatus) || "Unreleased",
    expenseClass: str(o.expenseClass) || "PO",
    lienWaiver: o.lienWaiver === true,
    dueDate: str(o.dueDate),
    jobType: str(o.jobType),
    award,
    demoTotal: num(o.demoTotal),
    siteTotal: num(o.siteTotal),
    createBills: o.createBills !== false,
  };
}

export async function POST(request: Request) {
  if (sendKeyRequired()) {
    if (!sendKey()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Creating purchase orders is disabled on this deployment: LETTER_SEND_KEY is not set. A hosted deployment must require a key, otherwise anyone who finds the URL could write purchase orders into Quickbase.",
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

  if (!isConfigured()) {
    return NextResponse.json({
      ok: false,
      configured: false,
      error: "Quickbase is not configured — QB_USER_TOKEN is not set.",
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const input = parseInput(body);
  if (!input) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Missing or malformed award details. A job, a subcontractor and an award above zero are all required.",
      },
      { status: 400 },
    );
  }

  let poId: number | null = null;
  let costItemId: number | null = null;

  try {
    [poId] = await createRecords(
      QB_AWARD.tables.pos,
      [buildPoRecord(input)],
      [QB_AWARD.pos.recordId],
    );

    [costItemId] = await createRecords(
      QB_AWARD.tables.costItems,
      [buildCostItemRecord(input, poId)],
      [QB_AWARD.costItems.recordId],
    );

    let billIds: number[] = [];
    if (input.createBills) {
      billIds = await createRecords(
        QB_AWARD.tables.billLines,
        buildBillRecords(input, costItemId),
        [QB_AWARD.billLines.recordId],
      );
    }

    return NextResponse.json({
      ok: true,
      poRecordId: poId,
      costItemRecordId: costItemId,
      billRecordIds: billIds,
      billCount: billIds.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Quickbase write failed";
    console.error("[qb/award]", message);

    // Say precisely how far it got. A PO with no cost item carries no contract
    // amount, and leaving it unmentioned would strand it silently.
    const created: string[] = [];
    if (poId) created.push(`PO record ${poId}`);
    if (costItemId) created.push(`Cost Item record ${costItemId}`);

    return NextResponse.json(
      {
        ok: false,
        poRecordId: poId,
        costItemRecordId: costItemId,
        error: message,
        partial: created.length
          ? `Already created in Quickbase: ${created.join(" and ")}. ${
              costItemId
                ? "The bills did not get created — generate them from the Quickbase award page, or delete the PO and start again."
                : "That PO has no cost item, so it carries no contract amount — delete it in Quickbase before retrying, or this award will exist twice."
            }`
          : null,
      },
      { status: 502 },
    );
  }
}
