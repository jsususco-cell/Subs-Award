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
