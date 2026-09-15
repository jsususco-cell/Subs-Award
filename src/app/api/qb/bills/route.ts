import { NextResponse } from "next/server";
import { QB_CONFIG, isConfigured, queryAll } from "@/lib/quickbase";
import { QB_AWARD, awardBlockers } from "@/lib/qb-award";
import {
  backChargeProblem,
  billRows,
  buildBackChargeUpdate,
  buildBillRecord,
  type ExistingBill,
  type PoOption,
} from "@/lib/bills";
import { isRegionKey, regionFor } from "@/lib/regions";
import { sendKey, sendKeyMatches, sendKeyRequired } from "@/lib/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Reading and writing the bills drawn against an existing purchase order.
 *
 * GET is read-only. POST writes Billing Line Items and is gated by the same
 * key as awarding and sending, because it moves money against a live contract.
 */

/** PO statuses that can still be billed, matching the code page's picker. */
const BILLABLE_STATUSES = ["Unreleased", "Released", "Approved"];

type Raw = Record<string, { value: unknown }>;

const num = (r: Raw, fid: number): number => {
  const v = r[String(fid)]?.value;
  return typeof v === "number" ? v : Number(v) || 0;
};
const str = (r: Raw, fid: number): string => {
  const v = r[String(fid)]?.value;
  return v === null || v === undefined ? "" : String(v).trim();
};

async function write(tableId: string, data: Raw[]): Promise<number[]> {
  const res = await fetch("https://api.quickbase.com/v1/records", {
    method: "POST",
    headers: {
      "QB-Realm-Hostname": QB_CONFIG.realm,
      Authorization: `QB-USER-TOKEN ${QB_CONFIG.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to: tableId, data, fieldsToReturn: [3] }),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Quickbase ${res.status} writing ${tableId}: ${text.slice(0, 300)}`);
  }
  const body = JSON.parse(text) as {
    metadata?: { createdRecordIds?: number[]; updatedRecordIds?: number[]; lineErrors?: unknown };
  };
  const ids = [
    ...(body.metadata?.createdRecordIds ?? []),
    ...(body.metadata?.updatedRecordIds ?? []),
  ];
  if (!ids.length) {
    throw new Error(
      `Quickbase accepted the request but changed nothing in ${tableId}: ${JSON.stringify(
        body.metadata?.lineErrors ?? body.metadata ?? {},
      ).slice(0, 300)}`,
    );
  }
  return ids;
}

/** The cost item a PO's bills hang off, and what it is worth. */
async function costItemFor(
  poRecordId: number,
): Promise<{ recordId: number; unitCost: number } | null> {
  const f = QB_AWARD.costItems;
  const rows = await queryAll({
    from: QB_AWARD.tables.costItems,
    select: [f.recordId, f.unitCost, f.qty],
    where: `{${f.relatedPO}.EX.${poRecordId}}`,
    sortBy: [{ fieldId: f.recordId, order: "ASC" }],
  });
  const first = rows[0] as Raw | undefined;
  if (!first) return null;
  return {
    recordId: num(first, f.recordId),
    unitCost: num(first, f.unitCost) * (num(first, f.qty) || 1),
  };
}

async function billsFor(costItemRecordId: number): Promise<ExistingBill[]> {
  const f = QB_AWARD.billLines;
  const rows = await queryAll({
    from: QB_AWARD.tables.billLines,
    select: [f.recordId, f.title, f.billAmount, f.backCharge, f.backChargeDesc],
    where: `{${f.relatedItem}.EX.${costItemRecordId}}`,
  });
  return (rows as Raw[]).map((r) => ({
    recordId: num(r, f.recordId),
    title: str(r, f.title),
    amount: num(r, f.billAmount),
    backCharge: num(r, f.backCharge),
    backChargeDesc: str(r, f.backChargeDesc),
  }));
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const region = regionFor(params.get("region"));
  const resource = params.get("resource");

  if (!isConfigured()) {
    return NextResponse.json({ ok: true, configured: false, items: [] });
  }

  try {
    if (resource === "pos") {
      const subRecordId = Number(params.get("sub")) || 0;
      if (!subRecordId) {
        return NextResponse.json(
          { ok: false, error: "A subcontractor is required." },
          { status: 400 },
        );
      }

      const f = QB_AWARD.pos;
      const statuses = BILLABLE_STATUSES.map((s) => `{${f.poStatus}.EX.'${s}'}`).join("OR");
      const rows = await queryAll({
        from: QB_AWARD.tables.pos,
        select: [
          f.recordId,
          f.poNumber,
          f.jobName,
          f.jobType,
          f.title,
          f.poStatus,
          f.totalCost,
          f.relatedJob,
          f.jobState,
        ],
        // Region-filtered on the PO's own "Job - State" lookup, so a Florida
        // vendor is never offered a Puerto Rico purchase order.
        where: `{${f.relatedSub}.EX.${subRecordId}}AND{${f.jobState}.EX.'${region.jobRegion.replace(/'/g, "")}'}AND(${statuses})`,
        sortBy: [{ fieldId: f.recordId, order: "DESC" }],
      });

      const items: PoOption[] = (rows as Raw[]).map((r) => ({
        recordId: num(r, f.recordId),
        poNumber: str(r, f.poNumber),
        jobName: str(r, f.jobName),
        jobType: str(r, f.jobType),
        title: str(r, f.title),
        status: str(r, f.poStatus),
        totalCost: num(r, f.totalCost),
        jobRecordId: num(r, f.relatedJob),
      }));

      return NextResponse.json({ ok: true, configured: true, items });
    }

    if (resource === "bills") {
      const poRecordId = Number(params.get("po")) || 0;
      if (!poRecordId) {
        return NextResponse.json(
          { ok: false, error: "A purchase order is required." },
          { status: 400 },
        );
      }

      const costItem = await costItemFor(poRecordId);
      if (!costItem) {
        return NextResponse.json({
          ok: true,
          configured: true,
          costItemRecordId: null,
          error:
            "This purchase order has no cost item, so it carries no contract amount and there is nothing to bill against. Add one in Quickbase first.",
        });
      }

      return NextResponse.json({
        ok: true,
        configured: true,
        costItemRecordId: costItem.recordId,
        unitCost: costItem.unitCost,
        bills: await billsFor(costItem.recordId),
      });
    }

    return NextResponse.json(
      { ok: false, error: "resource must be 'pos' or 'bills'" },
      { status: 400 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Quickbase request failed";
    console.error("[qb/bills]", message);
    return NextResponse.json(
      { ok: false, configured: true, error: message, items: [] },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  if (sendKeyRequired()) {
    if (!sendKey()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Creating bills is disabled on this deployment: LETTER_SEND_KEY is not set. A hosted deployment must require a key, otherwise anyone who finds the URL could write bills into Quickbase.",
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!isRegionKey(body.region)) {
    return NextResponse.json(
      { ok: false, error: "A valid region is required." },
      { status: 400 },
    );
  }
  const region = regionFor(body.region);

  const blockers = awardBlockers(region);
  if (blockers.length) {
    return NextResponse.json(
      { ok: false, error: blockers.join(" "), blockers },
      { status: 400 },
    );
  }

  const poRecordId = Number(body.poRecordId) || 0;
  const jobType = typeof body.jobType === "string" ? body.jobType : "";
  if (!poRecordId) {
    return NextResponse.json(
      { ok: false, error: "A purchase order is required." },
      { status: 400 },
    );
  }

  type Change = { n?: number; recordId?: number; backCharge: number; backChargeDesc: string };
  const asChanges = (v: unknown): Change[] =>
    Array.isArray(v)
      ? v.slice(0, 40).map((raw) => {
          const o = (raw ?? {}) as Record<string, unknown>;
          return {
            n: Number(o.n) || undefined,
            recordId: Number(o.recordId) || undefined,
            backCharge: Number(o.backCharge) || 0,
            backChargeDesc:
              typeof o.backChargeDesc === "string" ? o.backChargeDesc.slice(0, 2000) : "",
          };
        })
      : [];

  const create = asChanges(body.create);
  const update = asChanges(body.update);
  if (!create.length && !update.length) {
    return NextResponse.json(
      { ok: false, error: "Nothing to do — no bills selected and no back charges changed." },
      { status: 400 },
    );
  }

  try {
    const costItem = await costItemFor(poRecordId);
    if (!costItem) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "This purchase order has no cost item, so there is nothing to bill against.",
        },
        { status: 400 },
      );
    }

    /*
     * The rows are recomputed here from the PO's own contract amount rather
     * than taken from the browser. The caller says which milestones to bill;
     * what they are worth is not up to it.
     */
    const existing = await billsFor(costItem.recordId);
    const contract = costItem.unitCost || Number(body.totalCost) || 0;
    const rows = billRows(region.key, jobType, contract, existing);
    if (!rows.length) {
      return NextResponse.json(
        {
          ok: false,
          error: `There is no payment schedule for ${region.label}, so there are no milestones to bill.`,
        },
        { status: 400 },
      );
    }

    const problems: string[] = [];
    const newRecords: Raw[] = [];
    for (const change of create) {
      const row = rows.find((r) => r.n === change.n);
      if (!row) {
        problems.push(`Milestone ${change.n} is not on this schedule.`);
        continue;
      }
      if (row.existing) {
        problems.push(`${row.desc} is already billed.`);
        continue;
      }
      const problem = backChargeProblem(
        change.backCharge,
        change.backChargeDesc,
        row.amount,
      );
      if (problem) {
        problems.push(`Back charge on ${row.desc}: ${problem}.`);
        continue;
      }
      newRecords.push(
        buildBillRecord({
          costItemRecordId: costItem.recordId,
          jobRecordId: Number(body.jobRecordId) || 0,
          qbLineItemLabel: region.qbLineItem!.label,
          row,
          backCharge: change.backCharge,
          backChargeDesc: change.backChargeDesc,
        }) as Raw,
      );
    }

    const updates: Raw[] = [];
    for (const change of update) {
      const row = rows.find((r) => r.existing?.recordId === change.recordId);
      if (!row || !row.existing) {
        problems.push(`Bill ${change.recordId} is not on this purchase order.`);
        continue;
      }
      const problem = backChargeProblem(
        change.backCharge,
        change.backChargeDesc,
        row.existing.amount || row.amount,
      );
      if (problem) {
        problems.push(`Back charge on ${row.desc}: ${problem}.`);
        continue;
      }
      updates.push(
        buildBackChargeUpdate(
          change.recordId!,
          change.backCharge,
          change.backChargeDesc,
        ) as Raw,
      );
    }

    // Nothing is written if any line is bad, so a half-applied save cannot
    // leave some milestones billed and others silently skipped.
    if (problems.length) {
      return NextResponse.json({ ok: false, error: problems.join(" "), problems }, { status: 400 });
    }

    const createdIds = newRecords.length
      ? await write(QB_AWARD.tables.billLines, newRecords)
      : [];
    const updatedIds = updates.length
      ? await write(QB_AWARD.tables.billLines, updates)
      : [];

    return NextResponse.json({
      ok: true,
      createdRecordIds: createdIds,
      updatedRecordIds: updatedIds,
      created: createdIds.length,
      updated: updatedIds.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Quickbase write failed";
    console.error("[qb/bills]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
