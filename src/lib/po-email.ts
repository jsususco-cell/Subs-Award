import { money } from "./format";
import type { PoDocument } from "./po-doc";

/**
 * The covering note for a purchase order.
 *
 * English only, and that is not an oversight: the regions that send a purchase
 * order document are the mainland states. Puerto Rico awards go out under the
 * Spanish award letter, and if that ever changes this needs a Spanish twin
 * rather than a translation bolted on here.
 */

export function poSubject(doc: PoDocument): string {
  const number = doc.poNumber.trim() || "Purchase Order";
  const job = doc.jobName.trim();
  return job ? `${number} — ${job}` : number;
}

export function poBody(doc: PoDocument): string {
  const sub = doc.subVendor.trim() || "Subcontractor";
  const number = doc.poNumber.trim() || "the attached purchase order";
  const job = doc.jobName.trim() || "the project";

  return [
    `Dear ${sub},`,
    "",
    `Attached is ${number} for ${job}.`,
    "",
    `Total Price: ${money(doc.totalPrice)}`,
    doc.title.trim() ? `Scope: ${doc.title.trim()}` : "",
    "",
    "A signature of Approval or Electronic Acceptance is required before this purchase order is effective. Once accepted, it becomes part of the existing contract and is binding.",
    "",
    "Please review the line items and return a signed copy. If anything does not match what was agreed, tell us before signing rather than after.",
    "",
    "Regards,",
    "Byrdson Services, LLC",
  ]
    .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
    .join("\n");
}
