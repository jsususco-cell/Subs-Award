# Subcontractor Award System

Upload a scope of work and the award figures come out the other side. Built for
Byrdson Services.

The whole thing runs in the browser: the workbook is parsed client-side and no
file is ever uploaded to a server.

## The calculation

Given the example scope `2026.08.25 Scope of Work 03073.xls`:

| Row       | Amount       | Where it comes from                          |
| --------- | ------------ | -------------------------------------------- |
| Demo/Site | `$148,566.60`| Sum of **RCV** across the CE-DEMO and CE-SITE coverages |
| Less O&P  | `$112,550.45`| Demo/Site **÷ 1.32** — backs out 32% overhead & profit |
| 50%       | `$56,275.23` | 50% of the ex-O&P figure                     |
| 60%       | `$67,530.27` | 60% of the ex-O&P figure                     |
| 70%       | `$78,785.32` | 70% of the ex-O&P figure                     |
| HC        | `$122,000.00`| Hard-cost allowance, typed in as an absolute |
| **Award** | `$178,275.23`| **HC + the selected tier** (50% here)        |

Note that "Less O&P" *divides*, it does not deduct. The base already carries the
markup, so removing 32% means `base ÷ 1.32`, not `base × 0.68`.

Every input above is adjustable in the UI:

- **Which coverages** form the base — CE-DEMO and CE-SITE are ticked
  automatically, any coverage in the file can be added or removed.
- **The amount basis** — RCV (default), ACV, or Item Amount.
- **The O&P rate** — defaults to 32%.
- **The percentage tiers** — defaults to 50 / 60 / 70; rows can be edited, added
  or removed, and a radio picks which one feeds the award.
- **HC** — entered directly. If the file has an `HC` coverage, a one-click
  shortcut offers its total.

The basis, O&P rate and tier setup are remembered in `localStorage` between
files, since they are shop conventions. The HC and the coverage picks are not —
those belong to a single job.

## Reading the workbook

`src/lib/parse.ts` accepts `.xls` (legacy BIFF), `.xlsx`, `.xlsm`, `.xlsb` and
`.csv` via SheetJS. It scans the first 50 rows of every sheet for a header row
carrying a **Coverage** column plus at least one of RCV / ACV / Item Amount, so
files with a title block above the table still work.

**A row becomes a line item only if it has a Coverage value.** That is what keeps
the worksheet's own trailing summary block out of the totals — in the sample
export those labels sit in the Sales Tax column with their figures under RCV, so
a purely position-based read would swallow them as line items. Rows that are
skipped are counted and listed in the UI rather than silently dropped.

Number cells are coerced with `toNumber`, which handles the shapes Excel leaves
behind: `"-686.63"`, `"$1,234.50"`, `"(500.00)"`.

## Output

- **Copy summary** — the summary block as plain text.
- **Download CSV** — summary, coverage roll-up, and every line item.
- **Print** — a clean print stylesheet drops the controls and expands the tables.

## Development

```bash
npm install
npm run dev      # http://localhost:3040
npm test         # calculation, parser and export tests
npm run build
```

The tests run against a synthetic fixture (`src/lib/__fixtures__/sample.ts`) that
reproduces the real export's coverage codes and RCV figures to the cent,
including its string-typed negatives and its trailing summary block. Client scope
files are not committed.

## Stack

Next.js 16 (App Router) · React 19 · Tailwind v4 · SheetJS · deployed on Vercel.
