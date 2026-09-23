import { NextResponse } from "next/server";
import { QB_CONFIG, isConfigured, queryAll } from "@/lib/quickbase";
import {
  QB_AWARD,
  breakdownTotal,
  buildBreakdownCostItems,
  categoriesTotal,
  type BreakdownRow,
  type PoCategories,
  buildBillRecords,
  buildCostItemRecord,
  buildInsuranceRecord,
  buildPoRecord,
  type AwardWriteInput,
  type QbRecord,
} from "@/lib/qb-award";
import { isContractEntry, isRegionKey, regionFor } from "@/lib/regions";
import { refuseRegion } from "@/lib/auth/guard";
import { trySubcontractorAccount } from "@/lib/qb-accounts";
import { scheduleSetFor } from "@/lib/schedule";
import { sendKey, sendKeyMatches, sendKeyRequired } from "@/lib/mail";
import { logAudit, logError } from "@/lib/log";

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

/**
 * A purchase order already raised for this job and subcontractor.
 *
 * One PO per job per subcontractor is the rule: a second award for the same
 * pair is the same contract being broken down further, not a new one. The
 * existing PO is returned so the caller can add line items to it instead.
 *
 * Deliberately not filtered by status — a released or approved PO is still the
 * one that exists, and quietly raising a second because the first moved on
 * would be the exact duplicate this prevents.
 */
async function existingPo(
  jobRecordId: number,
  subRecordId: number,
): Promise<{ recordId: number; poNumber: string; contractPrice: number } | null> {
  const f = QB_AWARD.pos;
  const rows = await queryAll({
    from: QB_AWARD.tables.pos,
    select: [f.recordId, f.poNumber, f.contractPrice],
    where: `{${f.relatedJob}.EX.${jobRecordId}}AND{${f.relatedSub}.EX.${subRecordId}}`,
    sortBy: [{ fieldId: f.recordId, order: "DESC" }],
  });
  const first = rows[0];
  if (!first) return null;
  const val = (fid: number): unknown => first[String(fid)]?.value;
  return {
    recordId: Number(val(f.recordId)) || 0,
    poNumber: String(val(f.poNumber) ?? "").trim(),
    contractPrice: Number(val(f.contractPrice)) || 0,
  };
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

/**
 * The hand-entered payment breakdown. Rows worth nothing are kept here so the
 * caller's numbering survives into any error message; they are dropped at the
 * point of writing.
 */
function parseBreakdown(raw: unknown): BreakdownRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 60).map((entry) => {
    const o = (entry ?? {}) as Record<string, unknown>;
    return {
      desc: typeof o.desc === "string" ? o.desc.slice(0, 500) : "",
      pct: num(o.pct),
      amount: num(o.amount),
    };
  });
}

function parseInput(raw: unknown): AwardWriteInput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const jobRecordId = num(o.jobRecordId);
  const subRecordId = num(o.subRecordId);
  if (!isRegionKey(o.region)) return null;
  const parsedRegion = regionFor(o.region);
  const contract = isContractEntry(parsedRegion);

  const categories = contract ? null : parseCategories(o.categories);
  const breakdown = contract ? parseBreakdown(o.breakdown) : [];
  const contractPrice = contract ? num(o.contractPrice) : 0;

  /*
   * Where the contract figure comes from depends on how the region enters it.
   * With categories it is their sum, because Total Amount on the PO is a
   * Quickbase formula over exactly those seven. With a contract entry it is
   * the figure typed in — NOT the breakdown's total, which is deliberately
   * allowed to be less while the contract is still being broken down.
   */
  const award = contract
    ? contractPrice
    : categories
      ? categoriesTotal(categories)
      : num(o.award);
  if (!jobRecordId || !subRecordId || !(award > 0)) return null;

  // A breakdown may under-run the contract, but never over-run it.
  if (contract && breakdownTotal(breakdown) - contractPrice > 0.005) return null;

  const region = parsedRegion;

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
    ...(contract ? { contractPrice, breakdown } : {}),
    house: str(o.house),
    // Puerto Rico only — the mainland award does not collect exclusions.
    itemsNotIncluded: contract ? "" : str(o.itemsNotIncluded),
    caseNumber: str(o.caseNumber),
    subcontractorName: str(o.subcontractorName),
    /*
     * Both are narrowed by the region rather than trusted from the browser.
     * Without a payment schedule there are no milestones to bill against, and
     * the Fondo (CFSE) poliza is a Puerto Rico obligation — opening a submittal
     * for a Florida award would put a case on the insurance page that nobody
     * can ever satisfy.
     */
    /*
     * A contract-entry award has no milestone schedule to bill against: its
     * breakdown rows are PO line items, not draws.
     */
    createBills:
      o.createBills !== false && !contract && scheduleSetFor(region) !== null,
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

  // Checked after parsing, so the refusal names a region rather than
  // complaining about a body that was in fact well formed.
  const refused = await refuseRegion(request, input.region);
  if (refused) return refused;

  /*
   * The cost account is resolved before the first write. Quickbase has no
   * transactions, so discovering at the cost-item step that there is nothing
   * to post to would leave a purchase order behind carrying no contract
   * amount.
   */
  const resolved = await trySubcontractorAccount(regionFor(input.region));
  if ("error" in resolved) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: 400 });
  }
  const account = resolved.account;

  /*
   * One purchase order per job per subcontractor. Checked here, before
   * anything is created, and reported with the PO that already exists so the
   * caller can add line items to it rather than raising a second contract for
   * the same work. `allowDuplicate` is the deliberate override.
   */
  if (!(body as Record<string, unknown>).allowDuplicate) {
    try {
      const already = await existingPo(input.jobRecordId, input.subRecordId);
      if (already) {
        return NextResponse.json(
          {
            ok: false,
            duplicate: true,
            existingPo: already,
            error:
              `${already.poNumber || "A purchase order"} already exists for this job and ` +
              `subcontractor. Add the remaining breakdown to it from "Bill an existing PO" ` +
              `rather than raising a second contract for the same work.`,
          },
          { status: 409 },
        );
      }
    } catch (e) {
      // A failed duplicate check must not become a silent second PO.
      const message = e instanceof Error ? e.message : "duplicate check failed";
      console.error("[qb/award] duplicate check", message);
      return NextResponse.json(
        {
          ok: false,
          error:
            `Could not check whether a purchase order already exists for this job ` +
            `and subcontractor, so nothing was created: ${message}`,
        },
        { status: 502 },
      );
    }
  }

  let poId: number | null = null;
  let costItemId: number | null = null;
  let costItemIds: number[] = [];
  let billsCreated = false;

  try {
    [poId] = await createRecords(
      QB_AWARD.tables.pos,
      [buildPoRecord(input)],
      [QB_AWARD.pos.recordId],
    );

    /*
     * A contract-entry award writes one line item per breakdown row; the
     * Puerto Rico flow writes a single one carrying the whole award. Total
     * Cost on the purchase order is a rollup of whichever gets written.
     */
    const costItemRecords = input.breakdown?.length
      ? buildBreakdownCostItems(input, poId, account)
      : [buildCostItemRecord(input, poId, account)];

    if (!costItemRecords.length) {
      throw new Error(
        "The breakdown has no line worth anything, so the purchase order would " +
          "carry no contract amount. Nothing further was created.",
      );
    }

    costItemIds = await createRecords(
      QB_AWARD.tables.costItems,
      costItemRecords,
      [QB_AWARD.costItems.recordId],
    );
    costItemId = costItemIds[0];

    let billIds: number[] = [];
    if (input.createBills) {
      billIds = await createRecords(
        QB_AWARD.tables.billLines,
        buildBillRecords(input, costItemId, account),
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

    /*
     * The audit entry for a contract. Quickbase records every one of these writes
     * as the shared user token, so this is the only place that says which person
     * raised the purchase order and what it was worth.
     */
    await logAudit({
      action: "award.po.created",
      actor: request.headers.get("x-actor") ?? "",
      outcome: "ok",
      target: { table: "purchaseOrders", recordId: poId },
      after: {
        poRecordId: poId,
        costItemRecordIds: costItemIds,
        billRecordIds: billIds,
        insuranceRecordId: insuranceId,
        contractPrice: input.contractPrice,
        account: account.label,
      },
      details: { region: input.region, jobRecordId: input.jobRecordId, subRecordId: input.subRecordId },
    });

    return NextResponse.json({
      ok: true,
      poRecordId: poId,
      costItemRecordId: costItemId,
      costItemRecordIds: costItemIds,
      contractPrice: input.contractPrice,
      brokenDown: input.breakdown?.length ? breakdownTotal(input.breakdown) : undefined,
      // Reported so the account actually used is visible, not assumed.
      qbLineItem: { id: account.id, label: account.label },
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

    /*
     * A half-written award is the worst outcome this route has, because Quickbase
     * has no transactions and someone has to go and clean it up by hand. What was
     * already created is the whole value of the record.
     */
    await logError(e, {
      event: "award.po.failed",
      component: "qb-award",
      entity: { type: "job", id: input.jobRecordId },
      details: {
        partialCreated: created,
        poRecordId: poId,
        costItemRecordId: costItemId,
        billsCreated,
        region: input.region,
        subRecordId: input.subRecordId,
        contractPrice: input.contractPrice,
      },
    });

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
