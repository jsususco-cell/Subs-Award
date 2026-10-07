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

## What it still will not do

**Puerto Rico.** A QuickBooks OAuth credential belongs to one company, so one
HTTP node cannot reach both. Only the US credential is wired, so PR bills do not
match — skipped, not mis-written, which is what the amount guard buys. Covering
PR needs a second node pair with `PR - Production` / realm `9341456981104069`,
as the Payment Sync has.

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
