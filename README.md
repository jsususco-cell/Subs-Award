# Subcontractor Award System

Upload a scope of work and the award figures come out the other side. Built for
Byrdson Services.

The whole thing runs in the browser: the workbook is parsed client-side and no
file is ever uploaded to a server.

## The flow

**Upload → Extract → Preview → Award → Award Letter.**

1. **Upload** a raw scope export straight out of the estimating system.
2. **Extract** filters it down to the Demo/Site coverages (`CE-DEMO` + `CE-SITE`)
   and drops everything else. Any coverage in the file can be ticked instead.
3. **Preview** shows the extracted lines in the structured template's column
   order, with a **Totals** view that rolls them up by coverage and group and
   ends in the Demo/Site total.
4. **Award** applies the calculation below.
5. **Award Letter** collects the job details and previews the merge fields.
   *The letter template itself is still to come — the generate button is
   deliberately disabled until it lands.*

A raw file that contains no CE-DEMO lines extracts cleanly to whatever it does
have and says so, rather than failing — a repair job legitimately has none.

## The calculation

Given the structured scope `scope of work- template.xls`:

| Row       | Amount       | Where it comes from                          |
| --------- | ------------ | -------------------------------------------- |
| Demo/Site | `$148,566.60`| Sum of **RCV** across the CE-DEMO and CE-SITE coverages |
| Less O&P  | `$112,550.45`| Demo/Site **÷ 1.32** — backs out 32% overhead & profit |
| 50%       | `$56,275.23` | 50% of the ex-O&P figure                     |
| 55%       | `$61,902.75` | 55% of the ex-O&P figure                     |
| 60%       | `$67,530.27` | 60% of the ex-O&P figure                     |
| HC        | `$122,000.00`| Hard-cost allowance, prefilled and editable  |
| **Award** | `$178,275.23`| **HC + the selected subs %** (50% here)      |

Note that "Less O&P" *divides*, it does not deduct. The base already carries the
markup, so removing 32% means `base ÷ 1.32`, not `base × 0.68`.

Every input above is adjustable in the UI:

- **Which coverages** form the base — CE-DEMO and CE-SITE are ticked
  automatically, any coverage in the file can be added or removed.
- **The amount basis** — RCV (default), ACV, or Item Amount.
- **The O&P rate** — defaults to 32%.
- **The subs percentages** — prefilled at 50 / 55 / 60; rows can be edited,
  added or removed, and a radio picks which one feeds the award.
- **Less O&P** — derived from the formula, and editable. Typing over it marks
  the row as manual and offers a one-click reset back to the derived figure.
- **HC** — prefilled at $122,000 and editable.

The basis, O&P rate, subs percentages and HC are remembered in `localStorage`
between files, since they are shop conventions. The coverage picks are not —
they are re-derived from each file. The storage key is versioned (`:v2`), so a
change to the stored shape retires the old entry instead of masking new defaults.

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
