# Subcontractor Award System

Upload a scope of work and the award figures come out the other side. Built for
Byrdson Services.

The whole thing runs in the browser: the workbook is parsed client-side and no
file is ever uploaded to a server.

## The flow

**Upload → Extract → Preview → Award → Award Letter.**

1. **Upload** a raw scope export straight out of the estimating system.
2. **Extract** is a free coverage picker. Every coverage in the file is listed
   with its line count, share of the file and total; tick any combination and
   that becomes the base. `CE-DEMO` + `CE-SITE` are ticked for you as a starting
   point, and quick-pick chips offer **All**, **None** and the **Demo/Site**
   preset. Labels throughout follow the selection — pick `ECR` and the award row
   reads "ECR", not "Demo/Site".
3. **Preview** shows the extracted lines in the structured template's column
   order, with a **Totals** view that rolls them up by coverage and group and
   ends in the Demo/Site total.
4. **Award** applies the calculation below.
5. **Award Letter** collects the job details and previews the merge fields.
   *The letter template itself is still to come — the generate button is
   deliberately disabled until it lands.*

**Save award** stores the whole job in the history rail on the left: the letter
details, every setting, the computed figures and the parsed line items. Click a
saved award to restore it and carry on revising — because the raw lines travel
with it, you can change the coverage selection on a restored award, not just the
percentages. Saving again updates that entry in place rather than duplicating it.

A raw file that contains no CE-DEMO lines extracts cleanly to whatever it does
have and says so, rather than failing — a repair job legitimately has none, and
its scope may sit under an entirely different coverage code.

## The calculation

Given the structured scope `scope of work- template.xls`:

| Row       | Amount       | Where it comes from                          |
| --------- | ------------ | -------------------------------------------- |
| Demo/Site | `$148,566.60`| Sum of **RCV** across the CE-DEMO and CE-SITE coverages |
| Less O&P  | `$112,550.45`| Demo/Site **÷ 1.32** — backs out 32% overhead & profit |
| 50%       | `$56,275.23` | **Less O&P × 50%**                           |
| 55%       | `$61,902.75` | **Less O&P × 55%**                           |
| 60%       | `$67,530.27` | **Less O&P × 60%**                           |
| HC        | `$122,000.00`| Hard-cost allowance, prefilled and editable  |
| **Award** | `$178,275.23`| **HC + the subs amount** ($122,000 + $56,275.23) |

Two things about that chain are easy to get wrong:

- **"Less O&P" divides, it does not deduct.** The base already carries the
  markup, so removing 32% means `base ÷ 1.32`, not `base × 0.68`.
- **The subs percentage multiplies Less O&P, never the Demo/Site base.**
  `Subs amount = Less O&P × %`. At 50% that is $56,275.23, not $74,283.30.
  If Less O&P has been overridden by hand, the percentage applies to the
  overridden figure.
- **The award adds only the selected tier.** `Award = HC + subs amount` — the
  other tiers are shown for comparison and contribute nothing. The award footer
  spells the sum out so it can be checked at a glance.

Every input above is adjustable in the UI:

- **Which coverages** form the base — any combination. CE-DEMO and CE-SITE are
  the default pick, not a constraint.
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

## Quickbase lookups (Job name, Job address, Subcontractor)

The three letter fields can be backed by Quickbase, filtered to one region
(`QB_REGION`, default `Puerto Rico`). They remain plain text fields if the
lookup is unavailable — a Quickbase outage never blocks an award letter.

- **Jobs** — `buskqh27b`, `Job Name` = `6`, `Address` = `7` (a composite field
  that returns one formatted line), region = `11`, which is the address field's
  State/Region child. Filtered `{11.EX.'Puerto Rico'}` → 403 records, 386 after
  dropping template and scratch names ("demo" is deliberately not an exclusion
  keyword so Demolition jobs survive). Picking a job auto-fills the address.
- **Subcontractors** — `buskqh272`, `Company` = `23`, `Division/Trade` = `34`,
  `Eligible for Award` = `182`, `Region` = `206`. 22 vendors are award-eligible;
  20 are in region.

  `Region` is a multiple-choice of `Puerto Rico | Mainland | Both | No work on
  file`. **`Both` counts as in-region** — a vendor working Puerto Rico *and* the
  mainland is still a Puerto Rico vendor, and matching `Puerto Rico` alone
  silently drops two of them. `QB_VENDOR_REGIONS` controls the accepted set.

Sorting happens after the values are read, not in the query: Quickbase orders by
the raw stored value, and at least one vendor name carries zero-width characters
that would otherwise sort it to the top.

The token stays server-side in `/api/qb`; the browser never sees it.

### Setup

> **Order matters.** `/api/qb` is only as private as the deployment. Turn on
> Vercel Deployment Protection *before* setting `QB_USER_TOKEN` in Production,
> or the job and vendor lists are readable by anyone with the URL.

```bash
cp .env.example .env.local     # put your QB user token in .env.local
npm run qb:introspect          # read-only field dump, if ids ever change
```

**Put credentials in `.env.local`, never in `.env.example`.** `.env.example` is
the one env file git tracks, so a token pasted there would be committed.
`npm test` fails if that happens.

The field ids above are the defaults, so no configuration is needed for the
Puerto Rico setup. Override them with the `QB_*_FID` variables if the schema
moves.

**A Region field with nothing in it would match no vendors.** Rather than
showing an empty dropdown, the app falls back to all award-eligible vendors and
says on screen that the list is not region-filtered.

## Desglose de Pagos (payment breakdown)

The award letter carries the payment schedule from the Quickbase Puerto Rico
award code page, so this letter and the Billing Line Items that page creates
against the PO stay in step. **Changing one without the other puts them out of
sync.**

The schedule follows the job's **Job Type** (Jobs fid `34`), which arrives with
the job lookup and can be overridden:

| Job Type | Schedule |
| --- | --- |
| Reconstruction, New Construction | 8 milestones — Movilización 10, Demolición 15, Fundación 10, Paredes 10, Techo 10, Empañetado 20, Terminaciones 15, Inspección Final 10 |
| Repair, Renovation | 50 / 50 — Pago Inicial, Pago Final |
| Relocation, Demolition, Acquisition & Demolition | 20 / 80 — Pago Inicial, Pago Final |

Amounts are a percentage of the **award total**. Each line is rounded to the
cent and the drift lands on the last line, so the rows always add back to the
total exactly — the same approach the code page uses.

Job Types with no mapping (Rehabilitation, MHU, Home Elevation, Modular Home)
fall back to the 8-milestone schedule, and the UI says it is a fallback rather
than presenting it as settled.

**The mobilisation cap is reported, not enforced.** The letter states
mobilisation is limited to $10,000, but the 8-milestone schedule pays 10% of the
award and Quickbase does not apply the cap when it creates bills. Rather than
silently changing the maths, a breach is flagged so the right figure can be
chosen before sending.

## History

History lives in `localStorage` under `subs-award:history:v1`, read through
`useSyncExternalStore` so the server render stays empty and no effect is needed.

**It is per-browser.** Saved awards are not shared between machines, browsers or
teammates, and clearing site data removes them. Making history shared would mean
adding a backend, which the app deliberately does not have today.

The store keeps the 25 most recent awards. Because each one carries its line
items it can be sizeable, so a write that trips the browser's quota sheds the
oldest records and retries rather than losing the save — the UI reports how many
were dropped.

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
