"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { money } from "@/lib/format";
import { FONDO_STATUS } from "@/lib/fondo";
import type { ReviewItem, SendItem } from "@/lib/fondo-server";
import { rememberKey, storedKey, subscribeToKey } from "@/lib/send-key";
import FondoReview from "./FondoReview";

/**
 * The Fondo page: the review queue, plus a way to send the form link by hand.
 *
 * The link normally goes out on its own a few minutes after the award. The
 * second tab is for every case still owed a poliza after that — so whoever is
 * chasing Fondo can send (or resend) it from here instead of digging the
 * vendor's access key out of Quickbase and building the URL.
 */

/*
 * The remembered send key, read through useSyncExternalStore rather than
 * mirrored into state by a mount effect. The server snapshot is empty, which
 * is what keeps the first paint identical on both sides.
 */
const emptyKey = () => "";

type Tab = "review" | "send";
type Filter = "all" | "awaiting" | "returned" | "never";
type Sent = { to: string; sentAt: string; stampError: string | null };

export default function FondoWorkspace({
  reviewItems,
  sendItems,
}: {
  reviewItems: ReviewItem[];
  sendItems: SendItem[];
}) {
  const [tab, setTab] = useState<Tab>("review");
  const remembered = useSyncExternalStore(subscribeToKey, storedKey, emptyKey);
  const [typedKey, setTypedKey] = useState<string | null>(null);
  const sendKey = typedKey ?? remembered;

  const awaiting = sendItems.filter((i) => i.status !== FONDO_STATUS.returned).length;
  const returned = sendItems.filter((i) => i.status === FONDO_STATUS.returned).length;
  const never = sendItems.filter((i) => !i.formSentAt).length;
  const blocked = sendItems.filter((i) => i.blocked || !i.email).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-xl font-semibold text-navy-800">Fondo polizas</h1>
      <p className="mt-1 max-w-2xl text-sm text-navy-600/80">
        Puerto Rico subcontractor workers&rsquo; compensation (CFSE). Review what
        subcontractors send in, and send the form link to the ones still owed a poliza.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label="To review" value={reviewItems.length} note="sent in, waiting for a decision" />
        <Tile label="Waiting on the sub" value={awaiting} note="no poliza sent yet" />
        <Tile label="Returned" value={returned} note="sent back for correction" />
        <Tile label="Link never sent" value={never} note="nobody has asked yet" />
        <Tile
          label="Can't be sent"
          value={blocked}
          note="no email or no access key"
          warn={blocked > 0}
        />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="fondo-key" className="mb-1 block text-xs font-medium text-navy-700">
            Send key
          </label>
          <input
            id="fondo-key"
            type="password"
            value={sendKey}
            onChange={(e) => setTypedKey(e.target.value)}
            placeholder="Needed to read documents, decide, and send links"
            className="w-full rounded-md border border-navy-200 px-2.5 py-2 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
          />
        </div>
      </div>

      <div role="tablist" className="mt-6 mb-4 flex flex-wrap gap-2 border-b border-navy-100 pb-3">
        <TabButton active={tab === "review"} onClick={() => setTab("review")}>
          To review <Count n={reviewItems.length} />
        </TabButton>
        <TabButton active={tab === "send"} onClick={() => setTab("send")}>
          Send link <Count n={sendItems.length} />
        </TabButton>
      </div>

      {tab === "review" ? (
        <div className="max-w-3xl">
          <FondoReview items={reviewItems} sendKey={sendKey} />
        </div>
      ) : (
        <SendLinks items={sendItems} sendKey={sendKey} />
      )}
    </div>
  );
}

function SendLinks({ items, sendKey }: { items: SendItem[]; sendKey: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [sent, setSent] = useState<Record<number, Sent>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [editing, setEditing] = useState<number | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (filter === "awaiting" && i.status === FONDO_STATUS.returned) return false;
      if (filter === "returned" && i.status !== FONDO_STATUS.returned) return false;
      if (filter === "never" && (i.formSentAt || sent[i.recordId])) return false;
      if (!q) return true;
      return [i.caseNumber, i.subcontractor, i.jobName, i.email].some((s) =>
        s.toLowerCase().includes(q),
      );
    });
  }, [items, filter, query, sent]);

  async function send(item: SendItem) {
    const to = (overrides[item.recordId] ?? "").trim();
    const where = to || item.email;
    if (!window.confirm(`Email the Fondo form link for ${item.caseNumber} to ${where}?`)) return;

    setBusy(item.recordId);
    setErrors((e) => ({ ...e, [item.recordId]: "" }));
    try {
      const res = await fetch("/api/fondo/send-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sendKey ? { "x-send-key": sendKey } : {}),
        },
        body: JSON.stringify({ recordId: item.recordId, ...(to ? { to } : {}) }),
      });
      const body = await res.json();
      if (!body.ok) {
        setErrors((e) => ({ ...e, [item.recordId]: body.error ?? "Could not send." }));
      } else {
        rememberKey(sendKey);
        setSent((s) => ({
          ...s,
          [item.recordId]: { to: body.to, sentAt: body.sentAt, stampError: body.stampError },
        }));
        setEditing(null);
      }
    } catch {
      setErrors((e) => ({
        ...e,
        [item.recordId]: "Could not reach the server. Nothing was sent.",
      }));
    }
    setBusy(null);
  }

  const filters: [Filter, string][] = [
    ["all", "All open"],
    ["awaiting", "Waiting on the sub"],
    ["returned", "Returned"],
    ["never", "Link never sent"],
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {filters.map(([key, label]) => (
          <TabButton key={key} small active={filter === key} onClick={() => setFilter(key)}>
            {label}
          </TabButton>
        ))}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search case, sub, email"
          aria-label="Search cases"
          className="ml-auto w-full rounded-md border border-navy-200 px-2.5 py-1.5 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20 sm:w-60"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-navy-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-navy-100 text-left text-[11px] font-semibold tracking-wide text-navy-600 uppercase">
              <th className="px-4 py-2.5">Case</th>
              <th className="px-4 py-2.5">Subcontractor</th>
              <th className="px-4 py-2.5 text-right">Awarded</th>
              <th className="px-4 py-2.5">State</th>
              <th className="px-4 py-2.5">Link sent</th>
              <th className="px-4 py-2.5">Goes to</th>
              <th className="px-4 py-2.5 text-right" aria-label="Action" />
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-50">
            {!shown.length && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-navy-600/70">
                  Nothing here.
                </td>
              </tr>
            )}
            {shown.map((item) => {
              const done = sent[item.recordId];
              const sentAt = done?.sentAt || item.formSentAt;
              const override = overrides[item.recordId] ?? "";
              const noEmail = !item.email && !override.trim();
              return (
                <tr key={item.recordId} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-semibold whitespace-nowrap text-navy-800">{item.caseNumber || "—"}</div>
                    {item.jobName && (
                      <div className="text-xs text-navy-600/70">{item.jobName}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-navy-800">{item.subcontractor || "—"}</td>
                  <td className="tabular px-4 py-3 text-right whitespace-nowrap text-navy-800">
                    {item.awardedAmount ? money(item.awardedAmount) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatePill status={item.status} />
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap text-navy-700">
                    {sentAt ? formatWhen(sentAt) : <span className="text-navy-600/60">never</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {editing === item.recordId ? (
                      <input
                        type="email"
                        autoFocus
                        value={override}
                        onChange={(e) =>
                          setOverrides((o) => ({ ...o, [item.recordId]: e.target.value }))
                        }
                        placeholder={item.email || "name@company.com"}
                        aria-label={`Email for ${item.caseNumber}`}
                        className="w-48 rounded-md border border-navy-200 px-2 py-1 text-xs outline-none focus:border-navy-600"
                      />
                    ) : (
                      <span className={item.email || override ? "text-navy-800" : "text-brand-red-dark"}>
                        {override || item.email || "no email on file"}
                      </span>
                    )}
                    {!item.blocked && editing !== item.recordId && (
                      <button
                        type="button"
                        onClick={() => setEditing(item.recordId)}
                        className="ml-2 text-navy-600/70 underline"
                      >
                        change
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {item.blocked ? (
                      <span className="text-xs whitespace-nowrap text-brand-red-dark">{item.blocked}</span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy === item.recordId || noEmail}
                        onClick={() => send(item)}
                        className="rounded-md bg-navy-700 px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-white hover:bg-navy-800 disabled:bg-navy-300"
                      >
                        {busy === item.recordId ? "Sending…" : sentAt ? "Send again" : "Send link"}
                      </button>
                    )}
                    {done && (
                      <p className="mt-1 text-xs text-emerald-700">
                        Sent to {done.to}.
                        {done.stampError && (
                          <span className="block text-brand-red-dark">{done.stampError}</span>
                        )}
                      </p>
                    )}
                    {errors[item.recordId] && (
                      <p role="alert" className="mt-1 max-w-[16rem] text-xs text-brand-red-dark">
                        {errors[item.recordId]}
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-navy-600/70">
        Sending stamps &ldquo;Form Sent&rdquo; on the case, so the automatic sender will not
        mail it again. A returned case gets the correction notice with the reason.
      </p>
    </div>
  );
}

function StatePill({ status }: { status: SendItem["status"] }) {
  if (status === FONDO_STATUS.returned) {
    return (
      <span className="rounded-full bg-brand-red-50 px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-brand-red-dark">
        Returned
      </span>
    );
  }
  if (status === FONDO_STATUS.awaiting) {
    return (
      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-amber-800">
        Waiting on the sub
      </span>
    );
  }
  return (
    <span className="rounded-full bg-navy-50 px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-navy-700">
      No poliza on file
    </span>
  );
}

function Tile({
  label,
  value,
  note,
  warn,
}: {
  label: string;
  value: number;
  note: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-xl border border-navy-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-[11px] font-semibold tracking-wide text-navy-600 uppercase">{label}</div>
      <div
        className={`tabular mt-1 text-2xl font-semibold ${warn ? "text-brand-red-dark" : "text-navy-800"}`}
      >
        {value}
      </div>
      <div className="text-xs text-navy-600/70">{note}</div>
    </div>
  );
}

function TabButton({
  active,
  small,
  onClick,
  children,
}: {
  active: boolean;
  small?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-md border font-semibold ${small ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm"} ${
        active
          ? "border-navy-700 bg-navy-700 text-white"
          : "border-navy-200 bg-white text-navy-700 hover:bg-navy-50"
      }`}
    >
      {children}
    </button>
  );
}

function Count({ n }: { n: number }) {
  return <span className="ml-1 opacity-70">{n}</span>;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
