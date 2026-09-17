"use client";

import { useRef, useState } from "react";
import LookupField from "./LookupField";
import { loadJobs } from "@/lib/qb-client";
import {
  ATTACHMENT_CATEGORIES,
  attachmentProblem,
  humanSize,
  MAX_ATTACHMENT_BYTES,
  type AttachmentRow,
} from "@/lib/attachments";
import { money } from "@/lib/format";
import type { PoOption } from "@/lib/bills";
import { regionFor, type RegionKey } from "@/lib/regions";

/**
 * Documents filed against a job.
 *
 * Invoices turn up weeks after the award and award letters get re-issued, so
 * this is a place to come back to rather than a step in the award. It writes
 * to the same Attachments table the rest of Quickbase uses, which is why a
 * file put here is one anybody looking at the job will find.
 */
export default function AttachmentsPanel({ region }: { region: RegionKey }) {
  const cfg = regionFor(region);

  const [job, setJob] = useState("");
  const [jobRecordId, setJobRecordId] = useState("");
  const [items, setItems] = useState<AttachmentRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  /*
   * Purchase orders on this job. A document is usually about one of them —
   * an invoice is billed against a PO — and linking it there is what makes it
   * findable from the purchase order as well as from the job.
   */
  const [pos, setPos] = useState<PoOption[]>([]);
  const [poRecordId, setPoRecordId] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<string>("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [keyNeeded, setKeyNeeded] = useState(false);
  const [sendKey, setSendKey] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  /**
   * Load what is filed against a job.
   *
   * `refresh` is the same load after an upload rather than a change of job,
   * and it must not clear the notices — doing that wiped the "filed" message
   * the moment it was set, so a successful upload said nothing at all.
   */
  async function pickJob(recordId: string, refresh = false) {
    setJobRecordId(recordId);
    setItems(null);
    if (!refresh) {
      // A purchase order belongs to one job; carrying the choice across would
      // file the next document against the previous job's PO.
      setPos([]);
      setPoRecordId("");
      setError(null);
      setDone(null);
    }
    if (!recordId) return;

    setLoading(true);
    try {
      /*
       * Both lists at once. The purchase orders are only for the picker, so a
       * failure to load them must not stop the attachments being shown — a
       * document can always be filed against the job alone.
       */
      const [attached, purchaseOrders] = await Promise.all([
        fetch(`/api/qb/attachments?job=${encodeURIComponent(recordId)}`).then(
          (r) => r.json(),
        ),
        fetch(
          `/api/qb/bills?resource=pos&region=${region}&job=${encodeURIComponent(recordId)}`,
        )
          .then((r) => r.json())
          .catch(() => ({ ok: false })),
      ]);

      if (!attached.ok) {
        setError(attached.error ?? "Could not load the attachments.");
        return;
      }
      setItems(attached.items ?? []);
      setPos(purchaseOrders.ok ? (purchaseOrders.items ?? []) : []);
    } catch {
      setError("Could not reach the server to load the attachments.");
    } finally {
      setLoading(false);
    }
  }

  /** Read the file as base64 without the data: prefix the API does not want. */
  function readBase64(f: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read that file."));
      reader.onload = () => {
        const result = String(reader.result ?? "");
        resolve(result.slice(result.indexOf(",") + 1));
      };
      reader.readAsDataURL(f);
    });
  }

  async function upload() {
    if (!file) return;
    /*
     * Checked here as well as on the server. A file over the limit would
     * otherwise be read, encoded and sent only to bounce off the platform's
     * body limit as unparseable JSON — slow, and the error would not say why.
     */
    const problem = attachmentProblem({
      jobRecordId: Number(jobRecordId) || 0,
      fileName: file.name,
      bytes: file.size,
    });
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const data = await readBase64(file);
      const res = await fetch("/api/qb/attachments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sendKey ? { "x-send-key": sendKey } : {}),
        },
        body: JSON.stringify({
          region,
          jobRecordId: Number(jobRecordId),
          poRecordId: Number(poRecordId) || undefined,
          // Taken from the chosen purchase order rather than asked for: the
          // PO already knows whose it is, and a picker for it could disagree.
          subRecordId:
            pos.find((p) => String(p.recordId) === poRecordId)?.subRecordId ||
            undefined,
          category,
          description,
          fileName: file.name,
          data,
        }),
      });
      const body = await res.json();
      if (!body.ok) {
        if (body.keyRequired) setKeyNeeded(true);
        setError(body.error ?? "The file could not be filed.");
        return;
      }
      setFile(null);
      setDescription("");
      if (fileInput.current) fileInput.current.value = "";
      await pickJob(jobRecordId, true);
      setDone(`${body.fileName} filed against this job.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-navy-200 bg-white shadow-sm">
        <header className="border-b border-navy-100 px-4 py-3">
          <h2 className="text-sm font-semibold tracking-wide text-navy-800 uppercase">
            Attachments
          </h2>
          <p className="mt-0.5 text-xs text-navy-600/70">
            Documents filed against a {cfg.label} job — invoices, award letters,
            permits. They go to the same Quickbase table the rest of the company
            uses, so anybody looking at the job will find them.
          </p>
        </header>
        <div className="p-4 sm:max-w-md">
          <LookupField
            region={region}
            label="Job name"
            value={job}
            placeholder="Search by job name"
            onChange={(v, extra) => {
              setJob(v);
              void pickJob(extra?.recordId ?? "");
            }}
            loadChoices={async () => {
              const r = await loadJobs(region);
              return {
                configured: r.configured,
                warning: r.warning,
                error: r.error,
                choices: r.items.map((j) => ({
                  id: j.id,
                  label: j.name,
                  hint: [j.address, j.jobType].filter(Boolean).join("  ·  "),
                  extra: { recordId: j.id },
                })),
              };
            }}
          />
        </div>
      </section>

      {jobRecordId && (
        <section className="rounded-xl border border-navy-200 bg-white shadow-sm">
          <header className="border-b border-navy-100 px-4 py-3">
            <h2 className="text-sm font-semibold tracking-wide text-navy-800 uppercase">
              Add a document
            </h2>
          </header>
          <div className="space-y-3 p-4">
            <div>
              <label
                htmlFor="attach-file"
                className="mb-1 block text-xs font-medium text-navy-700"
              >
                File
              </label>
              <input
                ref={fileInput}
                id="attach-file"
                type="file"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setError(null);
                  setDone(null);
                }}
                className="w-full rounded-md border border-navy-200 px-2.5 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-navy-700 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-navy-800"
              />
              <p className="mt-1 text-[10px] text-navy-600/70">
                {file
                  ? `${file.name} — ${humanSize(file.size)}`
                  : `Up to ${humanSize(MAX_ATTACHMENT_BYTES)}. Anything larger goes on the Quickbase record directly.`}
              </p>
            </div>

            <div>
              <label
                htmlFor="attach-po"
                className="mb-1 block text-xs font-medium text-navy-700"
              >
                Purchase order{" "}
                <span className="text-navy-600/60">optional</span>
              </label>
              <select
                id="attach-po"
                value={poRecordId}
                onChange={(e) => setPoRecordId(e.target.value)}
                disabled={pos.length === 0}
                className="w-full rounded-md border border-navy-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20 disabled:bg-navy-50 disabled:text-navy-600/60"
              >
                <option value="">
                  {pos.length
                    ? "Not tied to a purchase order"
                    : "No purchase orders on this job"}
                </option>
                {pos.map((p) => (
                  <option key={p.recordId} value={p.recordId}>
                    {[
                      p.poNumber || `#${p.recordId}`,
                      p.title,
                      money(p.contractPrice || p.totalCost),
                      p.status,
                    ]
                      .filter(Boolean)
                      .join("  ·  ")}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-navy-600/70">
                {poRecordId
                  ? "Filed against the job, this purchase order and its subcontractor."
                  : "Filed against the job. Pick a purchase order if the document belongs to one — an invoice usually does."}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="attach-category"
                  className="mb-1 block text-xs font-medium text-navy-700"
                >
                  Category
                </label>
                <input
                  id="attach-category"
                  list="attach-categories"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Invoice, Award Letter…"
                  className="w-full rounded-md border border-navy-200 px-2.5 py-2 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
                />
                {/*
                 * A datalist, not a select: these are the values already on the
                 * table, but the field is free text in Quickbase and refusing
                 * a new one here would be this app inventing a rule the table
                 * does not have.
                 */}
                <datalist id="attach-categories">
                  {ATTACHMENT_CATEGORIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <label
                  htmlFor="attach-desc"
                  className="mb-1 block text-xs font-medium text-navy-700"
                >
                  Description <span className="text-navy-600/60">optional</span>
                </label>
                <input
                  id="attach-desc"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this is"
                  className="w-full rounded-md border border-navy-200 px-2.5 py-2 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
                />
              </div>
            </div>

            {keyNeeded && (
              <div>
                <label
                  htmlFor="attach-key"
                  className="mb-1 block text-xs font-medium text-navy-700"
                >
                  Send key
                </label>
                <input
                  id="attach-key"
                  type="password"
                  value={sendKey}
                  onChange={(e) => setSendKey(e.target.value)}
                  className="w-full rounded-md border border-navy-200 px-2.5 py-2 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
                />
              </div>
            )}

            {error && (
              <p
                role="alert"
                className="rounded-md border border-brand-red/30 bg-brand-red-50 px-3 py-2 text-xs text-brand-red-dark"
              >
                {error}
              </p>
            )}
            {done && (
              <p className="rounded-md border border-emerald-600/30 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                {done}
              </p>
            )}

            <button
              type="button"
              onClick={() => void upload()}
              disabled={!file || busy}
              className="rounded-md bg-brand-red px-3 py-2 text-xs font-semibold text-white hover:bg-brand-red-dark disabled:opacity-40"
            >
              {busy ? "Filing…" : "Attach to this job"}
            </button>
          </div>
        </section>
      )}

      {loading && (
        <p className="rounded-xl border border-navy-200 bg-white px-4 py-3 text-sm text-navy-600/70">
          Loading attachments…
        </p>
      )}

      {items && !loading && (
        <section className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
          <header className="border-b-2 border-brand-red bg-navy-700 px-4 py-3">
            <h2 className="text-sm font-semibold tracking-wide text-white uppercase">
              {items.length} document{items.length === 1 ? "" : "s"} on this job
            </h2>
          </header>
          {items.length === 0 ? (
            <p className="px-4 py-4 text-sm text-navy-700">
              Nothing filed against this job yet.
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="border-b border-navy-100 bg-navy-100/90 text-xs tracking-wide text-navy-700 uppercase">
                    <th
                      scope="col"
                      className="px-4 py-2 text-left font-semibold"
                    >
                      File
                    </th>
                    <th scope="col" className="py-2 text-left font-semibold">
                      Category
                    </th>
                    <th scope="col" className="py-2 text-left font-semibold">
                      PO
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2 text-left font-semibold"
                    >
                      Added
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a) => (
                    <tr
                      key={a.recordId}
                      className="border-b border-navy-50 last:border-0"
                    >
                      <td className="px-4 py-2 text-navy-800">
                        <span className="font-medium">{a.fileName || "—"}</span>
                        {a.description && (
                          <span className="block text-xs text-navy-600/70">
                            {a.description}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-navy-700">
                        {a.category || "—"}
                      </td>
                      <td className="tabular py-2 text-navy-700">
                        {/*
                         * The attachment carries the PO's record id, not its
                         * number. Resolve it from the list already loaded for
                         * the picker, and fall back to the id for a PO that
                         * list does not cover — a cancelled one, say.
                         */}
                        {a.poRecordId
                          ? (pos.find((p) => p.recordId === a.poRecordId)
                              ?.poNumber ?? `#${a.poRecordId}`)
                          : "—"}
                      </td>
                      <td className="px-4 py-2 text-navy-600/80">
                        {a.uploaded ? a.uploaded.slice(0, 10) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="border-t border-navy-100 px-4 py-2 text-xs text-navy-600/70">
            Open the job in Quickbase to download a file — attachments are
            listed here, not served from here.
          </p>
        </section>
      )}
    </div>
  );
}
