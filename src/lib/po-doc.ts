import { money, num } from "./format";

/**
 * The purchase order as the subcontractor sees it.
 *
 * This mirrors the document Byrdson already sends out of Quickbase — the same
 * sections, in the same order, carrying the same figures — so a subcontractor
 * who has had one before recognises this one. What it does not copy is
 * Quickbase's own chrome: it is set in the house style the award letter uses,
 * because both documents go out under the same name on the same day.
 *
 * Deliberately a pure function over a plain object. Every figure on it is read
 * back from Quickbase rather than carried over from the browser, so what the
 * subcontractor receives is what the record says — see qb-po-doc.ts.
 */

/** One row of the PO Cost Line Items table. */
export interface PoDocLine {
  title: string;
  costType: string;
  quantity: number;
  unitCost: number;
  /** Quantity × unit cost, as Quickbase computes it (Cost Items fid 11). */
  builderCost: number;
}

export interface PoDocument {
  /** "PO-14625". Quickbase derives it, so it exists only after the write. */
  poNumber: string;
  jobAddress: string;
  /** ISO timestamps or dates; blank where Quickbase holds nothing. */
  dateCreated: string;
  dateReleased: string;
  scheduledCompletion: string;
  subVendor: string;
  jobName: string;
  title: string;
  status: string;
  totalPrice: number;
  scopeOfWork: string;
  projectSpecifics: string;
  lines: PoDocLine[];
}

/**
 * The acceptance wording from the document Byrdson sends today. It is what
 * makes the page an offer rather than a statement, so it is not paraphrased.
 */
export const PO_ACCEPTANCE =
  "A signature of Approval or Electronic Acceptance is required before " +
  "purchase order is effective. This purchase order then becomes part of the " +
  "existing contract and is binding.";

const DASH = "&mdash;";

function esc(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function orDash(value: string): string {
  const s = esc(String(value ?? "").trim());
  return s.length ? s : DASH;
}

/**
 * mm-dd-yyyy, matching the award letter and the Quickbase print.
 *
 * Takes the date part of a timestamp before splitting rather than going
 * through Date, so a PO created late in the evening UTC does not print as the
 * day before in a browser running behind it.
 */
function formatDate(value: string): string {
  const iso = String(value ?? "").trim();
  if (!iso) return DASH;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return esc(iso);
  return `${m[2]}-${m[3]}-${m[1]}`;
}

/** Multi-line text, kept as paragraphs rather than collapsed into one. */
function paragraphs(value: string): string {
  const text = String(value ?? "").trim();
  if (!text) return `<p class="muted">${DASH}</p>`;
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n  ");
}

export function renderPoDocument(doc: PoDocument): string {
  const lines = doc.lines.filter((l) => l.builderCost !== 0 || l.title.trim());
  const lineTotal = lines.reduce((s, l) => s + l.builderCost, 0);

  const rows = lines.length
    ? lines
        .map(
          (l) =>
            `<tr><td>${orDash(l.title)}</td><td>${orDash(l.costType)}</td>` +
            `<td class="num">${num(l.quantity)}</td>` +
            `<td class="num">${money(l.unitCost)}</td>` +
            `<td class="num">${money(l.builderCost)}</td></tr>`,
        )
        .join("\n      ")
    : `<tr><td colspan="5" class="muted">No line items on this purchase order yet.</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(doc.poNumber || "Purchase Order")}</title>
<style>
  @page { size: letter; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, "Times New Roman", serif; font-size: 10.5pt;
         line-height: 1.45; color: #101d35; margin: 0; padding: 24px; }
  .sheet { max-width: 800px; margin: 0 auto; }
  header.brand { text-align: center; border-bottom: 3px solid #c8102e; padding-bottom: 10px; }
  header.brand .name { font-size: 15pt; font-weight: bold; color: #1f3864; letter-spacing: .5px; }
  header.brand .line { font-size: 9pt; color: #2b4b85; }
  h1 { font-size: 12.5pt; color: #1f3864; text-align: center; margin: 18px 0 4px; }
  h1 + .site { text-align: center; font-size: 9.5pt; color: #2b4b85; margin-bottom: 18px; }
  h2 { font-size: 11pt; color: #1f3864; border-bottom: 1px solid #1f3864;
       padding-bottom: 3px; margin: 22px 0 8px; }
  p { margin: 0 0 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  th, td { border: 1px solid #1f3864; padding: 5px 8px; font-size: 10pt; vertical-align: top; }
  th { background: #e7ecf5; color: #1f3864; text-align: left; font-weight: bold; }
  td.label { width: 28%; background: #f7f9fc; font-weight: bold; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  tr.total td { background: #e7ecf5; font-weight: bold; }
  .muted { color: #5a6b8c; font-style: italic; }
  .accept { margin-top: 10px; font-size: 10pt; }
  .sign { margin-top: 18px; page-break-inside: avoid; }
  .sign td.label { width: 22%; }
  .sign td { height: 30px; }
  @media print { body { padding: 0; } .sheet { max-width: none; } }
</style>
</head>
<body>
<div class="sheet">

  <header class="brand">
    <div class="name">BYRDSON SERVICES, LLC</div>
    <div class="line">1245 W Cardinal Drive, Beaumont, TX 77705</div>
  </header>

  <h1>Purchase Order ${orDash(doc.poNumber)}</h1>
  <div class="site">${orDash(doc.jobAddress)}</div>

  <h2>Purchase Order</h2>
  <table>
    <tbody>
      <tr><td class="label">Date Created</td><td>${formatDate(doc.dateCreated)}</td></tr>
      <tr><td class="label">Date Released</td><td>${formatDate(doc.dateReleased)}</td></tr>
      <tr><td class="label">Purchase Order #</td><td>${orDash(doc.poNumber)}</td></tr>
      <tr><td class="label">Sub/Vendor</td><td>${orDash(doc.subVendor)}</td></tr>
      <tr><td class="label">Job</td><td>${orDash(doc.jobName)}</td></tr>
      <tr><td class="label">PO Title</td><td>${orDash(doc.title)}</td></tr>
      <tr><td class="label">Scheduled Completion</td><td>${formatDate(doc.scheduledCompletion)}</td></tr>
      <tr><td class="label">Status</td><td>${orDash(doc.status)}</td></tr>
      <tr class="total"><td class="label">Total Price</td><td class="num">${money(doc.totalPrice)}</td></tr>
    </tbody>
  </table>

  <h2>Scope of Work</h2>
  ${paragraphs(doc.scopeOfWork)}

  <h2>PO Cost Line Items</h2>
  <table>
    <thead>
      <tr>
        <th>Title</th><th>Cost Type</th>
        <th class="num" style="width:12%">Quantity</th>
        <th class="num" style="width:18%">Unit Cost</th>
        <th class="num" style="width:18%">Builder Cost</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>${
      lines.length
        ? `
    <tfoot>
      <tr class="total"><td colspan="4">Total</td><td class="num">${money(lineTotal)}</td></tr>
    </tfoot>`
        : ""
    }
  </table>${
    doc.projectSpecifics.trim()
      ? `

  <h2>Project Specifics</h2>
  ${paragraphs(doc.projectSpecifics)}`
      : ""
  }

  <h2>Acceptance</h2>
  <p class="accept">${esc(PO_ACCEPTANCE)}</p>
  <table class="sign">
    <tbody>
      <tr><td class="label">Comments</td><td></td></tr>
      <tr><td class="label">Signature</td><td></td></tr>
      <tr><td class="label">Date</td><td></td></tr>
      <tr><td class="label">Approved by</td><td></td></tr>
    </tbody>
  </table>

</div>
</body>
</html>`;
}
