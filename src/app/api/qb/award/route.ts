import { NextResponse } from "next/server";
import { QB_CONFIG, isConfigured } from "@/lib/quickbase";
import {
  QB_AWARD,
  awardBlockers,
  categoriesTotal,
  type PoCategories,
  buildBillRecords,
  buildCostItemRecord,
  buildInsuranceRecord,
  buildPoRecord,
  type AwardWriteInput,
  type QbRecord,
} from "@/lib/qb-award";
import { isRegionKey, regionFor } from "@/lib/regions";
import { scheduleSetFor } from "@/lib/schedule";
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

/**
 * Is there already a Fondo submittal for this job and subcontractor?
 *
 * A job can have several subcontractors, each owing their own poliza, so the
 * pair is the key rather than the case number alone. Re-running an award must
 * not leave two submittals for one obligation.
 */
async function existingSubmittal(
  jobRecordId: number,
  subRecordId: number,
): Promise<number | null> {
  const res = await fetch("https://api.quickbase.com/v1/records/query", {
    method: "POST",
    headers: {
      "QB-Realm-Hostname": QB_CONFIG.realm,
      Authorization: `QB-USER-TOKEN ${QB_CONFIG.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: QB_AWARD.tables.insurance,
      select: [QB_AWARD.insurance.recordId],
      where: `{${QB_AWARD.insurance.relatedJob}.EX.${jobRecordId}}AND{${QB_AWARD.insurance.relatedSub}.EX.${subRecordId}}`,
    }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { data?: Record<string, { value: unknown }>[] };
  const first = body.data?.[0];
  const id = first?.[String(QB_AWARD.insurance.recordId)]?.value;
  return typeof id === "number" ? id : null;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.slice(0, 2000) : "";
}

/**
 * The Award Breakdown, when the caller entered it directly.
 *
 * Returns null when there is no breakdown, so the scope-derived path is left
 * alone. A negative category is rejected rather than clamped — it would make
 * Quickbase's Total Amount disagree with the contract for no good reason.
 */
function parseCategories(raw: unknown): PoCategories | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const c: PoCategories = {
    demolition: num(o.demolition),
    site: num(o.site),
    septic: num(o.septic),
    home: num(o.home),
    ada: num(o.ada),
    changeOrder: num(o.changeOrder),
    revisedTotal: num(o.revisedTotal),
  };
  if (Object.values(c).some((v) => v < 0)) return null;
  return c;
}

function parseInput(raw: unknown): AwardWriteInput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const jobRecordId = num(o.jobRecordId);
  const subRecordId = num(o.subRecordId);
  const categories = parseCategories(o.categories);
  /*
   * With a breakdown, the contract amount is computed from it rather than
   * taken from the caller as well. Total Amount on the purchase order is a
   * Quickbase formula over exactly those seven categories, so accepting a
   * separate figure would let the PO and the bills drawn against it disagree.
   */
  const award = categories ? categoriesTotal(categories) : num(o.award);
  if (!jobRecordId || !subRecordId || !(award > 0)) return null;

  /*
   * The region decides which account the cost posts to and which milestones
   * get billed, so it is required rather than defaulted. A financial write
   * that has to guess its own region should not happen at all.
   */
  if (!isRegionKey(o.region)) return null;
  const region = regionFor(o.region);

  return {
    region: region.key,
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
    ada: categories ? categories.ada : num(o.ada),
    ...(categories ? { categories } : {}),
    house: str(o.house),
    itemsNotIncluded: str(o.itemsNotIncluded),
    caseNumber: str(o.caseNumber),
    subcontractorName: str(o.subcontractorName),
    /*
     * Both are narrowed by the region rather than trusted from the browser.
     * Without a payment schedule there are no milestones to bill against, and
     * the Fondo (CFSE) poliza is a Puerto Rico obligation — opening a submittal
     * for a Florida award would put a case on the insurance page that nobody
     * can ever satisfy.
     */
    createBills: o.createBills !== false && scheduleSetFor(region) !== null,
    createInsurance: o.createInsurance !== false && region.insurance === "fondo",
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
          "Missing or malformed award details. A region, a job, a subcontractor and an award above zero are all required.",
      },
      { status: 400 },
    );
  }

  /*
   * Checked before the first write. Quickbase has no transactions, so a
   * blocker discovered at the cost-item step would leave a purchase order
   * behind that carries no contract amount.
   */
  const blockers = awardBlockers(regionFor(input.region));
  if (blockers.length) {
    return NextResponse.json(
      { ok: false, error: blockers.join(" "), blockers },
      { status: 400 },
    );
  }

  let poId: number | null = null;
  let costItemId: number | null = null;
  let billsCreated = false;

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
      billsCreated = billIds.length > 0;
    }

    // The Fondo submittal is the continuation of awarding: the subcontractor
    // now owes a poliza covering the award. Opening it here is what puts the
    // case on the insurance page as outstanding.
    let insuranceId: number | null = null;
    let insuranceExisting = false;
    if (input.createInsurance) {
      const already = await existingSubmittal(input.jobRecordId, input.subRecordId);
      if (already) {
        insuranceId = already;
        insuranceExisting = true;
      } else {
        [insuranceId] = await createRecords(
          QB_AWARD.tables.insurance,
          [buildInsuranceRecord(input, poId)],
          [QB_AWARD.insurance.recordId],
        );
      }
    }

    return NextResponse.json({
      ok: true,
      poRecordId: poId,
      costItemRecordId: costItemId,
      billRecordIds: billIds,
      billCount: billIds.length,
      insuranceRecordId: insuranceId,
      insuranceExisting,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Quickbase write failed";
    console.error("[qb/award]", message);

    // Say precisely how far it got. A PO with no cost item carries no contract
    // amount, and leaving it unmentioned would strand it silently.
    const created: string[] = [];
    if (poId) created.push(`PO record ${poId}`);
    if (costItemId) created.push(`Cost Item record ${costItemId}`);
    if (billsCreated) created.push("the billing lines");

    return NextResponse.json(
      {
        ok: false,
        poRecordId: poId,
        costItemRecordId: costItemId,
        error: message,
        partial: created.length
          ? `Already created in Quickbase: ${created.join(", ")}. ${
              !costItemId
                ? "That PO has no cost item, so it carries no contract amount — delete it in Quickbase before retrying, or this award will exist twice."
                : billsCreated
                  ? "The Fondo poliza submittal was not opened, so this case will not show as outstanding on the insurance page — add it there, or delete the PO and start again."
                  : "The bills did not get created — generate them from the Quickbase award page, or delete the PO and start again."
            }`
          : null,
      },
      { status: 502 },
    );
  }
}
