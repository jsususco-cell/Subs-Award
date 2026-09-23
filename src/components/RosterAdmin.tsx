"use client";

import { useMemo, useState } from "react";
import type { RosterRow } from "@/lib/auth/admin";
import { REGIONS, REGION_KEYS, type RegionKey } from "@/lib/regions";
import { preservedCodes } from "@/lib/auth/roster";

/**
 * Who sees which region, and the two fields that decide it.
 *
 * Deliberately shows both the raw Region value and what it resolves to. The
 * confusion this screen exists to end was somebody carrying "PR" and an Admin
 * Access tick at the same time, with nobody able to say which one won.
 */

function describe(row: RosterRow): string {
  if (!row.active) return "Nothing — inactive";
  switch (row.access.grant) {
    case "admin":
      return "Every region — Admin Access";
    case "head-office":
      return "Every region — head office";
    case "states":
      return row.access.regions.map((k) => REGIONS[k].label).join(", ");
    default:
      return "Nothing";
  }
}

type Draft = { headOffice: boolean; regions: RegionKey[]; adminAccess: boolean };

function draftOf(row: RosterRow): Draft {
  return {
    headOffice: row.access.grant === "head-office",
    regions: row.access.grant === "states" ? [...row.access.regions] : [],
    adminAccess: row.adminAccess,
  };
}

function same(a: Draft, b: Draft): boolean {
  return (
    a.headOffice === b.headOffice &&
    a.adminAccess === b.adminAccess &&
    a.regions.length === b.regions.length &&
    a.regions.every((r) => b.regions.includes(r))
  );
}

export default function RosterAdmin({
  initial,
  me,
}: {
  initial: RosterRow[];
  me: string;
}) {
  const [rows, setRows] = useState(initial);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState<{ id: number; text: string; bad: boolean } | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showInactive && !r.active) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.email.includes(q) ||
        r.designation.toLowerCase().includes(q) ||
        r.region.toLowerCase().includes(q)
      );
    });
  }, [rows, query, showInactive]);

  const inactiveCount = rows.filter((r) => !r.active).length;

  function draft(row: RosterRow): Draft {
    return drafts[row.recordId] ?? draftOf(row);
  }

  function edit(row: RosterRow, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [row.recordId]: { ...draft(row), ...patch } }));
    setNote(null);
  }

  async function save(row: RosterRow) {
    const next = draft(row);
    setBusy(row.recordId);
    setNote(null);
    try {
      const res = await fetch("/api/admin/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId: row.recordId, ...next }),
      });
      const body = (await res.json()) as
        | { ok: true; user: RosterRow }
        | { ok: false; error: string };
      if (!body.ok) {
        setNote({ id: row.recordId, text: body.error, bad: true });
        return;
      }
      setRows((all) =>
        all.map((r) => (r.recordId === body.user.recordId ? body.user : r)),
      );
      setDrafts((d) => {
        const copy = { ...d };
        delete copy[row.recordId];
        return copy;
      });
      setNote({
        id: row.recordId,
        text: `Saved. ${body.user.name || body.user.email} now has: ${describe(
          body.user,
        )}. It reaches them within five minutes.`,
        bad: false,
      });
    } catch {
      setNote({
        id: row.recordId,
        text: "The change could not be sent. Check the connection and try again.",
        bad: true,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-lg font-semibold text-navy-800">Who sees which region</h1>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-navy-600/80">
          This edits the Region field and the Admin Access tick on each
          person&rsquo;s Quickbase Internal Users record — the same record the org
          chart uses. A change reaches them within five minutes; they do not need to
          sign out.
        </p>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-navy-600/70">
          Whether somebody still works here is not edited from here. Untick Active in
          Quickbase for that — it removes their access to everything, which is a
          bigger decision than this screen should carry.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email, job title or region"
          className="w-full max-w-sm rounded-md border border-navy-200 bg-white px-3 py-1.5 text-sm text-navy-800 focus:border-navy-500 focus:outline-none"
        />
        <label className="flex items-center gap-2 text-xs text-navy-600/80">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show {inactiveCount} inactive
        </label>
        <span className="ml-auto text-xs text-navy-600/60">{shown.length} shown</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-navy-200 bg-white shadow-sm">
        <table className="w-full min-w-[56rem] text-sm">
          <thead>
            <tr className="border-b border-navy-100 text-left text-xs font-semibold tracking-wide text-navy-700 uppercase">
              <th className="px-4 py-2.5">Person</th>
              <th className="px-4 py-2.5">Regions</th>
              <th className="px-4 py-2.5">Admin</th>
              <th className="px-4 py-2.5">Gets</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const d = draft(row);
              const dirty = !same(d, draftOf(row));
              const carried = preservedCodes(row.region);
              const locked = d.headOffice || d.adminAccess;
              return (
                <tr
                  key={row.recordId}
                  className={`border-b border-navy-50 align-top ${
                    row.active ? "" : "opacity-60"
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-navy-800">
                      {row.name || row.email}
                    </div>
                    <div className="font-mono text-xs text-navy-600/70">{row.email}</div>
                    {row.designation ? (
                      <div className="text-xs text-navy-600/60">{row.designation}</div>
                    ) : null}
                    {!row.active ? (
                      <div className="mt-1 text-xs font-medium text-brand-red">
                        Inactive
                      </div>
                    ) : null}
                  </td>

                  <td className="px-4 py-3">
                    <label className="mb-1.5 flex items-center gap-2 text-xs text-navy-700">
                      <input
                        type="checkbox"
                        checked={d.headOffice}
                        disabled={d.adminAccess}
                        onChange={(e) =>
                          edit(row, { headOffice: e.target.checked, regions: [] })
                        }
                      />
                      Head office — every region
                    </label>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {REGION_KEYS.map((key) => (
                        <label
                          key={key}
                          className={`flex items-center gap-1.5 text-xs ${
                            locked ? "text-navy-600/40" : "text-navy-700"
                          }`}
                        >
                          <input
                            type="checkbox"
                            disabled={locked}
                            checked={locked || d.regions.includes(key)}
                            onChange={(e) =>
                              edit(row, {
                                regions: e.target.checked
                                  ? [...d.regions, key]
                                  : d.regions.filter((k) => k !== key),
                              })
                            }
                          />
                          {REGIONS[key].label}
                        </label>
                      ))}
                    </div>
                    {carried.length ? (
                      <p className="mt-1.5 text-xs text-navy-600/60">
                        Also carries {carried.join(", ")}, which this system does not
                        award in. It is left exactly as it is.
                      </p>
                    ) : null}
                    <p className="mt-1 font-mono text-xs text-navy-600/40">
                      Quickbase: {row.region || "(blank)"}
                    </p>
                  </td>

                  <td className="px-4 py-3">
                    <label className="flex items-center gap-2 text-xs text-navy-700">
                      <input
                        type="checkbox"
                        checked={d.adminAccess}
                        onChange={(e) => edit(row, { adminAccess: e.target.checked })}
                      />
                      Admin Access
                    </label>
                    {d.adminAccess ? (
                      <p className="mt-1 text-xs text-navy-600/60">
                        Every region, and can change this screen.
                      </p>
                    ) : null}
                    {row.email === me ? (
                      <p className="mt-1 text-xs text-navy-600/60">This is you.</p>
                    ) : null}
                  </td>

                  <td className="px-4 py-3 text-xs text-navy-700">{describe(row)}</td>

                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={!dirty || busy === row.recordId}
                      onClick={() => save(row)}
                      className="rounded-md bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-navy-800 disabled:cursor-not-allowed disabled:bg-navy-200 disabled:text-navy-600/60"
                    >
                      {busy === row.recordId ? "Saving…" : "Save"}
                    </button>
                    {note && note.id === row.recordId ? (
                      <p
                        role="status"
                        className={`mt-2 max-w-xs text-left text-xs leading-relaxed ${
                          note.bad ? "text-brand-red" : "text-navy-600/80"
                        }`}
                      >
                        {note.text}
                      </p>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {shown.length === 0 ? (
        <p className="mt-4 text-sm text-navy-600/70">Nobody matches that search.</p>
      ) : null}
    </div>
  );
}
