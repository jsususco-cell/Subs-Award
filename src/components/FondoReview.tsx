"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { money } from "@/lib/format";
import { coverageOf } from "@/lib/fondo";
import type { ReviewItem } from "@/lib/fondo-server";

/**
 * Isaac's queue.
 *
 * Each row shows the one comparison the decision turns on — what the poliza is
 * for against what was awarded — and the document itself, rendered in place.
 * Approving insurance without reading it is not a review, so the reading has to
 * cost nothing: no download, no second tab, no Quickbase login.
 *
 * The document is fetched with the send key and shown from a blob, because an
 * iframe cannot carry an auth header and the endpoint must stay closed. These
 * are other companies' insurance certificates.
 */

const KEY_STORE = "subs-award:send-key";

/**
 * The remembered send key, read through useSyncExternalStore rather than
 * mirrored into state by a mount effect. Snapshots must be referentially
 * stable, so the value is cached after the first read; the server snapshot is
 * empty, which is what keeps the first paint identical on both sides.
 */
let keyCache: string | null = null;

function storedKey(): string {
  if (keyCache === null) {
    try {
      keyCache = localStorage.getItem(KEY_STORE) ?? "";
    } catch {
      keyCache = "";
    }
  }
  return keyCache;
}

function rememberKey(key: string): void {
  keyCache = key;
  try {
    localStorage.setItem(KEY_STORE, key);
  } catch {
    /* private mode — it just will not be remembered */
  }
}

const noSubscribe = () => () => {};
const emptyKey = () => "";

type Outcome = { action: "approve" | "return"; notified: boolean; notifyError: string | null };
type Preview = { url: string; kind: "pdf" | "image" } | { error: string };

export default function FondoReview({ items }: { items: ReviewItem[] }) {
  const [done, setDone] = useState<Record<number, Outcome>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [returning, setReturning] = useState<number | null>(null);
  const [reviewer, setReviewer] = useState("");
  const [previews, setPreviews] = useState<Record<number, Preview>>({});

  // The typed value wins once there is one; until then the remembered key
  // shows, so a returning reviewer does not have to enter it again.
  const remembered = useSyncExternalStore(noSubscribe, storedKey, emptyKey);
  const [typedKey, setTypedKey] = useState<string | null>(null);
  const sendKey = typedKey ?? remembered;

  useEffect(() => {
    if (!sendKey) return;
    let cancelled = false;
    const created: string[] = [];

    (async () => {
      for (const item of items) {
        if (!item.polizaName) continue;
        try {
          const res = await fetch(`/api/fondo/poliza?recordId=${item.recordId}`, {
            headers: { "x-send-key": sendKey },
          });
          if (cancelled) return;
          if (!res.ok) {
            const why =
              res.status === 401
                ? "The send key is not right, so the document cannot be shown."
                : "The document could not be loaded.";
            setPreviews((p) => ({ ...p, [item.recordId]: { error: why } }));
            continue;
          }
          const blob = await res.blob();
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          created.push(url);
          setPreviews((p) => ({
            ...p,
            [item.recordId]: {
              url,
              kind: blob.type.startsWith("image/") ? "image" : "pdf",
            },
          }));
        } catch {
          if (!cancelled) {
            setPreviews((p) => ({
              ...p,
              [item.recordId]: { error: "The document could not be loaded." },
            }));
          }
        }
      }
    })();

    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [items, sendKey]);

  async function act(item: ReviewItem, action: "approve" | "return") {
    setBusy(item.recordId);
    setErrors((e) => ({ ...e, [item.recordId]: "" }));
    try {
      const res = await fetch("/api/fondo/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sendKey ? { "x-send-key": sendKey } : {}),
        },
        body: JSON.stringify({
          recordId: item.recordId,
          action,
          notes: notes[item.recordId] ?? "",
          reviewer,
        }),
      });
      const body = await res.json();
      if (!body.ok) {
        setErrors((e) => ({ ...e, [item.recordId]: body.error ?? "Could not save." }));
        setBusy(null);
        return;
      }
      rememberKey(sendKey);
      setDone((d) => ({
        ...d,
        [item.recordId]: {
          action,
          notified: Boolean(body.notified),
          notifyError: body.notifyError ?? null,
        },
      }));
      setReturning(null);
    } catch {
      setErrors((e) => ({
        ...e,
        [item.recordId]: "Could not reach the server. Nothing was recorded.",
      }));
    }
    setBusy(null);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-semibold text-navy-800">Fondo polizas to review</h1>
      <p className="mt-1 mb-5 text-sm text-navy-600/80">
        Approving copies the poliza onto the case, which is what makes it count as
        covered on the insurance page.
      </p>

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="reviewer" className="mb-1 block text-xs font-medium text-navy-700">
            Your name
          </label>
          <input
            id="reviewer"
            value={reviewer}
            onChange={(e) => setReviewer(e.target.value)}
            placeholder="Recorded against the decision"
            className="w-full rounded-md border border-navy-200 px-2.5 py-2 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
          />
        </div>
        <div>
          <label htmlFor="review-key" className="mb-1 block text-xs font-medium text-navy-700">
            Send key
          </label>
          <input
            id="review-key"
            type="password"
            value={sendKey}
            onChange={(e) => setTypedKey(e.target.value)}
            placeholder="Needed to read documents and decide"
            className="w-full rounded-md border border-navy-200 px-2.5 py-2 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
          />
        </div>
      </div>

      {!items.length && (
        <div className="rounded-xl border border-navy-200 bg-white p-6 text-sm text-navy-600/80 shadow-sm">
          Nothing waiting. Polizas appear here as subcontractors send them in.
        </div>
      )}

      {items.map((item) => {
        const outcome = done[item.recordId];
        const cover = coverageOf(item.submittedAmount, item.awardedAmount);
        const preview = previews[item.recordId];
        return (
          <section
            key={item.recordId}
            className="mb-4 overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm"
          >
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-navy-100 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-navy-800">
                  {item.caseNumber || "—"}
                </h2>
                <p className="text-xs text-navy-600/70">{item.subcontractor}</p>
              </div>
              {cover.covers ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  covers the award
                </span>
              ) : (
                <span className="rounded-full bg-brand-red-50 px-2.5 py-1 text-xs font-semibold text-brand-red-dark">
                  short {money(cover.shortfall)}
                </span>
              )}
            </header>

            <dl className="divide-y divide-navy-50 text-sm">
              <Row k="Awarded" v={money(item.awardedAmount)} />
              <Row k="Poliza is for" v={money(item.submittedAmount)} />
              {item.submittedPolicyNumber && (
                <Row k="Policy number" v={item.submittedPolicyNumber} />
              )}
              {item.submittedBy && <Row k="Sent by" v={item.submittedBy} />}
              {item.submittedAt && <Row k="Sent" v={item.submittedAt} />}
            </dl>

            <div className="border-t border-navy-100">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span className="text-xs font-medium text-navy-700">
                  {item.polizaName || "No document attached"}
                </span>
                {item.polizaUrl && (
                  <a
                    href={item.polizaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-navy-600/70 underline"
                  >
                    open in Quickbase
                  </a>
                )}
              </div>

              {item.polizaName &&
                (!sendKey ? (
                  <p className="px-4 pb-3 text-xs text-navy-600/70">
                    Enter the send key above to read the document here.
                  </p>
                ) : !preview ? (
                  <p className="px-4 pb-3 text-xs text-navy-600/70">Loading the document…</p>
                ) : "error" in preview ? (
                  <p className="px-4 pb-3 text-xs text-brand-red-dark">{preview.error}</p>
                ) : preview.kind === "image" ? (
                  <div className="max-h-[560px] overflow-auto bg-navy-50 px-4 pb-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={preview.url}
                      alt={`Poliza for ${item.caseNumber}`}
                      className="mx-auto w-full max-w-full rounded border border-navy-200 bg-white"
                    />
                  </div>
                ) : (
                  <div className="px-4 pb-4">
                    <iframe
                      src={preview.url}
                      title={`Poliza for ${item.caseNumber}`}
                      className="h-[560px] w-full rounded border border-navy-200 bg-white"
                    />
                  </div>
                ))}
            </div>

            {outcome ? (
              <div className="border-t border-navy-100 bg-navy-50 px-4 py-3 text-sm">
                <p className="font-semibold text-navy-800">
                  {outcome.action === "approve" ? "Approved." : "Sent back for correction."}
                </p>
                <p className="mt-0.5 text-xs text-navy-600/80">
                  {outcome.notified
                    ? "The subcontractor has been emailed."
                    : (outcome.notifyError ?? "The subcontractor was not emailed.")}
                </p>
              </div>
            ) : (
              <div className="border-t-2 border-navy-200 bg-navy-50 p-4">
                {errors[item.recordId] && (
                  <p
                    role="alert"
                    className="mb-3 rounded-md border border-brand-red/30 bg-brand-red-50 px-3 py-2 text-xs text-brand-red-dark"
                  >
                    {errors[item.recordId]}
                  </p>
                )}

                {returning === item.recordId ? (
                  <>
                    <label
                      htmlFor={`notes-${item.recordId}`}
                      className="mb-1 block text-xs font-medium text-navy-700"
                    >
                      What needs correcting? The subcontractor sees this.
                    </label>
                    <textarea
                      id={`notes-${item.recordId}`}
                      rows={3}
                      value={notes[item.recordId] ?? ""}
                      onChange={(e) =>
                        setNotes((n) => ({ ...n, [item.recordId]: e.target.value }))
                      }
                      className="w-full rounded-md border border-navy-200 px-2.5 py-2 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
                    />
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={busy === item.recordId}
                        onClick={() => act(item, "return")}
                        className="rounded-md bg-brand-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-red-dark disabled:bg-navy-300"
                      >
                        {busy === item.recordId ? "Sending…" : "Send it back"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setReturning(null)}
                        className="rounded-md border border-navy-200 bg-white px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy === item.recordId}
                      onClick={() => act(item, "approve")}
                      className="rounded-md bg-navy-700 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800 disabled:bg-navy-300"
                    >
                      {busy === item.recordId ? "Saving…" : "Approve"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setReturning(item.recordId)}
                      className="rounded-md border border-navy-200 bg-white px-4 py-2 text-sm font-semibold text-navy-700 hover:bg-navy-50"
                    >
                      Return for correction
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2">
      <dt className="text-navy-600">{k}</dt>
      <dd className="tabular font-semibold text-navy-800">{v}</dd>
    </div>
  );
}
