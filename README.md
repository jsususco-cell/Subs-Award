# Subcontractor Award System

Upload a scope of work and the award figures come out the other side. Built for
Byrdson Services.

Serves **Puerto Rico, Florida, North Carolina, Texas and Louisiana** from one
deployment. The region is picked in the app and drives everything that differs —
see [Regions](#regions).

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
   order, with a **Totals** view that rolls them up by coverage and group.

   Every line has a tick box. Untick one to **exclude it from the calculation**:
   it stays on screen struck through so it can be put back, but it drops out of
   the coverage subtotals, the scope total, the award and the letter. The
   footer shows what was set aside and how much it came to, and **Include all**
   clears the lot. Exclusions are keyed by sheet row, so they survive a change
   to the coverage selection, and they are saved and restored with the award.
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
| Demo/Site | `$148,566.60`| Sum of **RCV** across the CE-DEMO and CE-SITE coverages, minus any lines excluded during review |
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

## Regions

One codebase, one deployment, five regions. `src/lib/regions.ts` is the single
source of truth; adding a state means adding an entry there, not editing
components.

| | Puerto Rico | Florida | North Carolina | Texas | Louisiana |
| --- | --- | --- | --- | --- | --- |
| Jobs on file | 403 | 252 | 170 | 73 | 9 |
| Award-eligible vendors | 20 | 2 | 2 | 2 | 2 |
| Award letter | Spanish | — | — | — | — |
| Payment schedule | 8 / 50-50 / 20-80 | — | — | — | — |
| Fondo (CFSE) poliza | yes | no | no | no | no |
| QB Line Item | 182 | — | — | — | — |

A region carries six things:

- **`jobRegion`** — the exact value in Jobs fid 11, which is the address
  field's State/Region child. For the mainland that is the state name.
- **`vendorRegions`** — the values of Subs/Vendors fid 206 that count as in
  region. **That field is a coarse bucket** — `Puerto Rico | Mainland | Both |
  No work on file` — so all four mainland states currently match the same
  vendors. Splitting it by state means adding those choices in Quickbase and
  re-tagging 536 records. `Both` counts for every region.
- **`letter`** — the template. `null` means **no letter can be produced at
  all**, and the buttons stay disabled. It never falls back to another region's
  wording: the Puerto Rico letter is in Spanish and its twenty conditions bind
  the subcontractor to CFSE coverage, OGPe permits and PRDOH programme rules, so
  sending it to a Florida vendor would be a contract nobody meant to offer.
- **`schedule`** — the payment milestones, which drive both the letter's
  breakdown and the Billing Line Items. `null` means no breakdown and no bills.
- **`insurance`** — `fondo` only for Puerto Rico. Mainland awards open no
  insurance submittal.
- **`qbLineItem`** — the account the cost posts to. `null` for the mainland
  because the QB Line Items table holds both #181 "Subcontractors" and #233,
  also called "Subcontractors", alongside #182 "Subcontractors - Puerto Rico".
  The award write is **blocked before the first record is created** rather than
  guessing, since Quickbase has no transactions and a wrong guess would strand a
  purchase order carrying no contract amount.

Changing region clears the job, the subcontractor and any created PO — those
records belong to the region they were picked from. The parsed scope stays, and
preferences (O&P, tiers, HC) are kept per region so a Puerto Rico hard-cost
allowance is not carried onto a Florida award.

### Adding the mainland letter

1. Add a `"us-en"` entry to `LETTER_TEMPLATES` in `src/lib/letter-content.ts`
   with its wording, conditions and labels.
2. Add its milestones to `SCHEDULE_SETS` in `src/lib/schedule.ts`.
3. Set `letter`, `schedule` and `qbLineItem` on those regions in
   `src/lib/regions.ts`.

The renderer is the skeleton, not the words — every label it prints comes from
the template. If the supplied letter turns out to have a different *structure*
rather than different words, give it its own renderer and dispatch on the key
in `letter.ts`.

### Who can be awarded work

```bash
npm run qb:vendor-regions
```

Reports, per region, how many subcontractors are both **Eligible for Award** and
in region. Today every mainland state shows the same two vendors, and both
qualify through `Region = Both` rather than being marked for the mainland —
168 vendors are marked `Mainland` but are not award-eligible. A region with
nothing matching gets an **empty list that says why**, never another region's
vendors.

## Quickbase lookups (Job name, Job address, Subcontractor)

The three letter fields are backed by Quickbase, filtered to the region picked
in the app. They remain plain text fields if the lookup is unavailable — a
Quickbase outage never blocks an award letter.

- **Jobs** — `buskqh27b`, `Job Name` = `6`, `Address` = `7` (a composite field
  that returns one formatted line), region = `11`, which is the address field's
  State/Region child, and carries the state name for mainland jobs. Filtered
  `{11.EX.'<region>'}` → Puerto Rico 403 records, 386 after dropping template and
  scratch names ("demo" is deliberately not an exclusion keyword so Demolition
  jobs survive); Florida 249, North Carolina 166. Picking a job auto-fills the
  address.
- **Subcontractors** — `buskqh272`, `Company` = `23`, `Division/Trade` = `34`,
  `Eligible for Award` = `182`, `Region` = `206`. 22 vendors are award-eligible;
  20 are in region.

  `Region` is a multiple-choice of `Puerto Rico | Mainland | Both | No work on
  file`. **`Both` counts as in-region** — a vendor working Puerto Rico *and* the
  mainland is in scope for both, and matching `Puerto Rico` alone silently drops
  two of them. The accepted set per region lives in `src/lib/regions.ts`.

Everything is measured on **RCV**. ACV and Item Amount used to be selectable;
the award is always struck from RCV, so offering the others only invited the
wrong basis. The library still supports them — the CSV carries all three
columns — but the app does not offer a choice.

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

The field ids above are the defaults, so no configuration is needed. Override
them with the `QB_*_FID` variables if the schema moves.

`QB_REGION` and `QB_VENDOR_REGIONS` are **retired** — the region is chosen in
the app, not fixed per deployment. They can be deleted from `.env.local` and
from the Vercel project.

**A region with no matching vendors shows an empty list and says why.** It used
to fall back to every award-eligible vendor, which was harmless while Puerto Rico
was the only region and would now offer Puerto Rico subcontractors for a Florida
job. An empty list that explains itself is safer than a plausible list that is
wrong. `npm run qb:vendor-regions` says which regions are in that state.

## Sending the letter

**Generate Award Letter** opens the letter to print or save; **Download PDF**
renders it server-side; **Send by email** delivers it as a PDF attachment.

The recipient prefills from the subcontractor's Quickbase record (Vendors fid
`28`, populated for all 20 in-region award-eligible vendors) and stays editable.

This puts a contract in front of a real subcontractor, so:

- **Sending is always two steps.** The first click shows the recipient, subject
  and attachment and says the send cannot be recalled; nothing leaves until the
  confirmation is clicked.
- **`LETTER_SEND_KEY` gates the endpoint.** The browser must present it as an
  `x-send-key` header; the app asks for it once and remembers it. **On Vercel a
  key is mandatory** — a hosted deployment is reachable by anyone, so without
  one the route refuses every send rather than acting as an open relay that
  mails award letters as the company. Local development does not need one.
- **`LETTER_SEND_ALLOWLIST` is a rollout rail.** While it is set, only those
  addresses can be mailed — `to` *and* `cc` — and anything else is refused with
  a message naming what was blocked. Leave it unset in normal operation.
- Missing recipients, malformed addresses and unconfigured credentials all fail
  loudly rather than half-sending.

### Transports

Three ways to send, checked in this order:

1. **n8n webhook** (preferred). Set `N8N_SEND_WEBHOOK_URL`. No mail credential
   lives in this app at all — n8n already holds one, and its execution log
   becomes the send audit trail. Import `n8n/send-award-letter.json`.
   **Set `N8N_WEBHOOK_TOKEN` and the matching header auth on the webhook node**:
   that URL can send mail as the company to anyone who finds it.
2. **Google service account** with domain-wide delegation. No human credential
   and revocable on its own, but a Workspace super-admin has to authorise its
   client ID — and SMTP will only accept the **full-mailbox** `https://mail.google.com/`
   scope, not a send-only one. Sending with a narrower scope means using the
   Gmail API rather than SMTP.
3. **Google App Password**. Simplest, but it belongs to one person's account and
   dies when that password changes. It must be an App Password, which requires
   2FA — a normal account password is rejected with `535-5.7.8`.

Each failure mode gets its own hint: a wrong webhook token, an inactive
workflow, an unauthorised service account, and the `535` App Password case are
all named specifically rather than surfaced as a bare SMTP error.

PDFs are rendered with headless Chromium: the bundled Linux build on Vercel, and
whatever Chrome is installed locally (`CHROME_PATH` overrides). The API renders
the letter from structured values rather than accepting HTML, so a caller cannot
have the server render arbitrary markup.

## Desglose de Pagos (payment breakdown)

**Puerto Rico only.** The mainland states have no schedule, so their awards get
no payment breakdown and no billing lines, and the UI says so rather than
showing Puerto Rico's milestones.

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

Each award records the region it was struck in, and reopening one restores that
region so its letter, schedule and account are the ones it was saved with.
Records written before the app served more than one region carry no region and
are read as Puerto Rico, which is what they are.

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
