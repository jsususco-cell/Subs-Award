/**
 * Whether a billing line has been paid — which Quickbase answers twice.
 *
 * There are two independent markers and they do not agree. "Status" (14) is a
 * stored multiple-choice carrying Paid or Unpaid; "Mark as Paid" (97) is a
 * checkbox, and "Status Formula" (186) is computed from it. Across 2,159 live
 * bills, 1,783 say Paid by the first and 1,834 by the second, and 269 records
 * disagree outright — PO-15489's milestones have the checkbox ticked, money
 * against them and a Date Paid, with the stored Status left blank.
 *
 * Reading only the stored Status showed those as "No Payment" beside their
 * own Date Paid. So either marker counts, and so does the money: a line with
 * Amount Paid covering its Bill Amount has been paid whatever the fields say.
 *
 * Pure. Used for display, and for deciding what a scope change or an advance
 * is allowed to move — a line someone has marked paid must not be rewritten
 * because a different field happens to be empty.
 */

export interface BillPayment {
  /** Field 14, the stored multiple-choice. */
  status: string;
  /** Field 186, computed from the Mark as Paid checkbox. */
  statusFormula: string;
  /** Field 49. */
  amount: number;
  /** Field 143. */
  amountPaid: number;
}

const says = (v: string, word: string): boolean => v.trim().toLowerCase() === word;

/** Paid in full, by any of the ways Quickbase records it. */
export function isPaid(b: BillPayment): boolean {
  if (says(b.status, "paid") || says(b.statusFormula, "paid")) return true;
  // Money covering the line is its own answer, whatever the fields hold.
  return b.amount > 0 && b.amountPaid >= b.amount - 0.005;
}

/**
 * Settled enough that it must not be moved.
 *
 * Wider than isPaid on purpose: part-payment means money has gone out against
 * this line, and restating it would leave what was paid disagreeing with what
 * the line says it is worth.
 */
export function isSettled(b: BillPayment): boolean {
  return isPaid(b) || b.amountPaid > 0;
}

/** What to show on the line, preferring what Quickbase says over a guess. */
export function paymentLabel(b: BillPayment): string {
  if (isPaid(b)) return "Paid";
  if (b.amountPaid > 0) return "Partially Paid";
  // Nothing has been paid, so whatever either field says is the whole story.
  const stated = b.status.trim() || b.statusFormula.trim();
  return stated || "No Payment";
}
