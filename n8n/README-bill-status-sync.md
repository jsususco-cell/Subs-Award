# QBO Bill Status Sync — Stage 2 (n8n `NPt1efRbP74FT5yw`)

Writes **Status (14)** and **Amount Paid (143)** on Billing Line Item
(`bum6mrfti`) from QuickBooks. Its sibling, `ZtMnLQS3Qbl4d4Th`, writes
**Date Paid (12)** and is the one that has been running all along.

Repaired 2026-10-08 by `scripts/fix-bill-status-sync.mjs`.
`bill-status-sync.BEFORE-2026-10-08.json` is the pristine definition — PUT it
back to revert.

## It had never run, and could not have

- Both Quickbase nodes carried `QB-USER-TOKEN YOUR_QUICKBASE_USER_TOKEN`.
- The realm was `YOUR_QBO_REALM_ID`.
- Nothing checked the bill it found was the same bill: DocNumber alone, `bills[0]`.

Now: both Quickbase nodes use the stored `Quickbase` credential (a pasted token
would live in the workflow JSON and every export of it), the realm is the US
company, and a match is refused unless QuickBooks' `TotalAmt` equals the
Quickbase Bill Amount to the cent.

## Both QuickBooks companies, since 2026-10-08

A QBO OAuth credential belongs to one company, so one HTTP node can only ever
see one. The reference is now looked up in **both** and the answers compared:

    Normalize -> Query QBO Bill — US -> Query QBO Bill — PR -> Compute

- exactly one company has that DocNumber **at the matching amount** -> use it,
  and record which company it came from
- both do -> ambiguous, skipped and reported, never guessed
- neither -> no match

Both lookups continue on error, so one company being unreachable still leaves
the other able to match.

`Query QBO Linked BillPayments` and `Assemble Comparison Output` were removed
with this. They existed to derive Date Paid, which this workflow has never
written and which the Payment Sync already writes correctly across both
companies. Status and Amount Paid both come from the Bill itself (TotalAmt,
Balance), so nothing was lost — and keeping them would have meant a second pair
of per-realm nodes for a field somebody else owns.

## What it still will not do

**The backlog.** Its row filter is `{154.EX.'Linked'}AND{123.XEX.''}`, and
*Linked to Quickbooks* (154) is blank on 1,336 of the 1,417 bills showing the
reported problem. Until something fills 154, this sync cannot see them.

**More than five rows.** `BATCH_LIMIT = 5, SKIP = 0`, so every run re-processes
the same five. That is the author's controlled first write; raising it is a
decision about blast radius, not a repair.

## Left alone on purpose

A partly paid bill is written as Status **"Paid"** with the correct part-amount,
because field 14 has no "Partly paid" (field 244 does). Deliberate, and worth a
second opinion from Finance.
