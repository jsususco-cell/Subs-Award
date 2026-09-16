import "server-only";
import { QB_AWARD } from "./qb-award";
import { QB_CONFIG, queryAll } from "./quickbase";
import type { PoDocument, PoDocLine } from "./po-doc";
import type { RegionConfig } from "./regions";

/**
 * Build the subcontractor's copy of a purchase order from Quickbase.
 *
 * Read back rather than carried over from the browser, deliberately. The
 * document that goes to a subcontractor is an offer, and it has to say what
 * the record says — a PO whose cost items were edited in Quickbase after the
 * award would otherwise be mailed out at the figure the browser remembered.
 */

type Raw = Record<string, { value: unknown } | undefined>;

const str = (row: Raw, fid: number): string => {
  const v = row[String(fid)]?.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    // Quickbase address and multi-choice fields arrive as objects.
    const o = v as Record<string, unknown>;
    if (Array.isArray(v)) return v.map(String).join(", ");
    return String(o.label ?? o.value ?? "");
  }
  return String(v);
};

const numOf = (row: Raw, fid: number): number => {
  const n = Number(row[String(fid)]?.value);
  return Number.isFinite(n) ? n : 0;
};

/** Thrown when the purchase order is not in this region. */
export class PoNotInRegionError extends Error {
  constructor(poNumber: string, found: string, expected: string) {
    super(
      `${poNumber || "That purchase order"} belongs to ${found || "no region"}, ` +
        `not ${expected}. Nothing was sent.`,
    );
    this.name = "PoNotInRegionError";
  }
}

/** Thrown when there is no such purchase order. */
export class PoNotFoundError extends Error {
  constructor(poRecordId: number) {
    super(`There is no purchase order with record id ${poRecordId}.`);
    this.name = "PoNotFoundError";
  }
}

/**
 * Thrown when the purchase order has not been released.
 *
 * The rule lives here rather than in the caller so that every route to sending
 * obeys it — the create screen, a Quickbase automation, anything added later.
 * An unreleased purchase order is still being worked on, and mailing one to a
 * subcontractor puts figures in front of them that nobody has stood behind.
 */
export class PoNotReleasedError extends Error {
  constructor(poNumber: string, status: string) {
    super(
      `${poNumber || "That purchase order"} is ${status.trim() || "not released"}, ` +
        `not Released, so it was not sent. A purchase order goes to the ` +
        `subcontractor when it is released.`,
    );
    this.name = "PoNotReleasedError";
  }
}

/** Quickbase fields the document needs that the write path never touches. */
const DOC_FIELDS = {
  dateCreated: 1,
  dateReleased: 72,
  scheduledCompletion: 74,
  jobAddress: 73,
  projectSpecifics: 75,
} as const;

/** Cost Items: Builder Cost is a Quickbase formula over quantity × unit cost. */
const BUILDER_COST = 11;
const COST_TYPE = 7;

export async function fetchPoDocument(
  region: RegionConfig,
  poRecordId: number,
): Promise<PoDocument> {
  const p = QB_AWARD.pos;
  const c = QB_AWARD.costItems;

  const [pos, items] = await Promise.all([
    queryAll({
      from: QB_AWARD.tables.pos,
      select: [
        p.recordId,
        p.poNumber,
        p.relatedSub,
        p.jobName,
        p.jobState,
        p.title,
        p.scope,
        p.poStatus,
        p.totalCost,
        p.contractPrice,
        p.sentToSubAt,
        ...Object.values(DOC_FIELDS),
      ],
      where: `{${p.recordId}.EX.${poRecordId}}`,
    }),
    queryAll({
      from: QB_AWARD.tables.costItems,
      select: [c.recordId, c.title, COST_TYPE, c.qty, c.unitCost, BUILDER_COST],
      where: `{${c.relatedPO}.EX.${poRecordId}}`,
      sortBy: [{ fieldId: c.recordId, order: "ASC" }],
    }),
  ]);

  const po = pos[0] as Raw | undefined;
  if (!po) throw new PoNotFoundError(poRecordId);

  const poNumber = str(po, p.poNumber);

  /*
   * The region is checked against the record, not trusted from the caller.
   * Without this, a Florida screen could mail out a Puerto Rico purchase
   * order simply by being handed its id.
   */
  const state = str(po, p.jobState);
  if (state && state !== region.jobRegion) {
    throw new PoNotInRegionError(poNumber, state, region.label);
  }

  const lines: PoDocLine[] = (items as Raw[]).map((r) => {
    const qty = numOf(r, c.qty) || 1;
    const unitCost = numOf(r, c.unitCost);
    // Prefer Quickbase's own Builder Cost; fall back where it is not set.
    const builder = numOf(r, BUILDER_COST);
    return {
      title: str(r, c.title),
      costType: str(r, COST_TYPE),
      quantity: qty,
      unitCost,
      builderCost: builder || qty * unitCost,
    };
  });

  /*
   * Total Price is the contract, not the rollup of what has been broken down
   * so far. On a mainland award those differ whenever the breakdown is still
   * partial, and the subcontractor is being offered the contract.
   */
  const contract = numOf(po, p.contractPrice);
  const totalPrice = contract || numOf(po, p.totalCost);

  return {
    poNumber,
    jobAddress: str(po, DOC_FIELDS.jobAddress),
    dateCreated: str(po, DOC_FIELDS.dateCreated),
    dateReleased: str(po, DOC_FIELDS.dateReleased),
    scheduledCompletion: str(po, DOC_FIELDS.scheduledCompletion),
    subVendor: await vendorName(numOf(po, p.relatedSub)),
    jobName: str(po, p.jobName),
    title: str(po, p.title),
    status: str(po, p.poStatus),
    totalPrice,
    scopeOfWork: str(po, p.scope),
    projectSpecifics: str(po, DOC_FIELDS.projectSpecifics),
    sentToSubAt: str(po, p.sentToSubAt),
    lines,
  };
}

/**
 * Record that the purchase order document went out.
 *
 * Written after the mail is away, never before. A marker set first would turn
 * a failed send into a purchase order that can never be sent again, which is
 * the worse of the two failures; writing it after means a crash in between can
 * send twice. Rare, visible, and recoverable — the right way round.
 */
export async function markPoSent(
  poRecordId: number,
  when: Date = new Date(),
): Promise<void> {
  const res = await fetch("https://api.quickbase.com/v1/records", {
    method: "POST",
    headers: {
      "QB-Realm-Hostname": QB_CONFIG.realm,
      Authorization: `QB-USER-TOKEN ${QB_CONFIG.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: QB_AWARD.tables.pos,
      data: [
        {
          [QB_AWARD.pos.recordId]: { value: poRecordId },
          [QB_AWARD.pos.sentToSubAt]: { value: when.toISOString() },
        },
      ],
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `Quickbase ${res.status} recording the send on PO ${poRecordId}: ` +
        `${(await res.text()).slice(0, 200)}`,
    );
  }
}

/**
 * The subcontractor's company name.
 *
 * The purchase order carries the vendor's record id, not their name — the
 * Quickbase form resolves it through the relationship — so the name comes from
 * the Vendors table. A missing one is left blank rather than guessed: the
 * document says who it is addressed to, and a wrong name there is worse than
 * none.
 */
async function vendorName(subRecordId: number): Promise<string> {
  if (!subRecordId) return "";
  const f = QB_CONFIG.fields.vendors;
  const rows = await queryAll({
    from: QB_CONFIG.tables.vendors,
    select: [f.recordId, f.company],
    where: `{${f.recordId}.EX.${subRecordId}}`,
  });
  return str(rows[0] as Raw, f.company);
}
