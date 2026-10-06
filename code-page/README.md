# Quickbase code pages

Copies of the live Quickbase pages this repo edits, kept so a change can be
reviewed and diffed. **They are not the source of truth** — always pull the live
page before editing, because these drift:

    a=API_GetDBPage&pageID=<id>

| page id | file | app |
|---------|------|-----|
| 43 | `master_dashboard.html` | Construction Management_V2 (`buskqh26r`) |

## master_dashboard.html

Adds a **Subcontractor Award System** section with two tiles: the award app
itself and the Fondo review queue.

Two things worth knowing before editing it again:

- **Tile keys must be unique.** `openDash` resolves with
  `DASHBOARDS.find(x => x.key === key)`, so a duplicate key silently opens the
  wrong dashboard. `subsaward` was already taken by "Contractor Award — Start
  Here"; this section uses `subsawardapp`.
- **The app shell sandboxes this page without `allow-downloads`,** so a
  download started inside the embedded frame does nothing at all — no error, no
  file. That is why the frame view carries an "Open in a new tab" link: the
  award app's Download PDF, Download CSV and Print only work outside the frame.

## The role picker, and how a tile goes missing

Since the 2026-09-10 rebuild this page shows **one start page and a short `also`
list per job**, not every section. Everything else is reachable only through the
search box and the "Browse Quickbase work pages" list at the bottom.

So a tile can be present, correct and working, and still invisible to the people
who need it: being in `DASHBOARDS` is not enough, it has to be named in a role's
`also` array in `ROLES`.

That is exactly what happened to the award app. The 2026-09-26 backup had
`subsawardapp` on the Finance list; the 2026-09-29 rewrite replaced that list
wholesale — `start` moved from `oikanban` to `subpay` and all seven entries
changed — and the award app was not carried across. Restored on 2026-10-07 by
`scripts/dashboard-restore-subs-award.py`, together with `fondoreview`.

**Pull the live page before editing.** The copy in this folder is a snapshot, and
this page is edited by other people often — two backup pages inside Quickbase in
four days. Deploying a stale copy would delete their work.
