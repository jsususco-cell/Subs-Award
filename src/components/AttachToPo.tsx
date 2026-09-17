"use client";

import { useRef, useState } from "react";
import {
  ATTACHMENT_CATEGORIES,
  attachmentProblem,
  humanSize,
  MAX_ATTACHMENT_BYTES,
} from "@/lib/attachments";
import type { RegionKey } from "@/lib/regions";

/**
 * Attach a document at the moment an award is created.
 *
 * The one point where the job, the purchase order and the subcontractor are
 * all known, so a file put here is findable from any of the three. The
 * Attachments route does the same job later, when an invoice turns up.
 *
 * Shares the size limit and the category list with that route rather than
 * restating them — two places disagreeing about what may be uploaded is how
 * one of them starts refusing files the other accepts.
 */
export default function AttachToPo({
  region,
  jobRecordId,
  poRecordId,
  subRecordId,
  sendKey,
}: {
  region: RegionKey;
  jobRecordId: string;
  poRecordId: number;
  subRecordId: string;
  /** The key already used to create the records, so nobody retypes it. */
  sendKey: string;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filed, setFiled] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  async function upload() {
    if (!file) return;
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
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read that file."));
        reader.onload = () => {
          const r = String(reader.result ?? "");
          resolve(r.slice(r.indexOf(",") + 1));
        };
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/qb/attachments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sendKey ? { "x-send-key": sendKey } : {}),
        },
        body: JSON.stringify({
          region,
          jobRecordId: Number(jobRecordId),
          poRecordId,
          subRecordId: Number(subRecordId) || undefined,
          category,
          description: "",
          fileName: file.name,
          data,
        }),
      });
      const body = await res.json();
      if (!body.ok) {
        setError(body.error ?? "The file could not be filed.");
        return;
      }
      setFiled((f) => [...f, body.fileName as string]);
      setFile(null);
      if (input.current) input.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "The upload failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!jobRecordId) return null;

  return (
    <div className="border-t border-navy-100 px-4 py-2.5">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-navy-200 bg-white px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50"
        >
          Attach a document
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-navy-800">
            Attach a document to this job
          </p>
          <input
            ref={input}
            type="file"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setError(null);
            }}
            className="w-full rounded-md border border-navy-200 px-2.5 py-1.5 text-xs file:mr-3 file:rounded file:border-0 file:bg-navy-700 file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-white hover:file:bg-navy-800"
          />
          <input
            list="attach-po-categories"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category — Invoice, Award Letter…"
            className="w-full rounded-md border border-navy-200 px-2.5 py-1.5 text-xs outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
          />
          <datalist id="attach-po-categories">
            {ATTACHMENT_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>

          {error && (
            <p
              role="alert"
              className="rounded border border-brand-red/30 bg-brand-red-50 px-2 py-1.5 text-[11px] text-brand-red-dark"
            >
              {error}
            </p>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void upload()}
              disabled={!file || busy}
              className="rounded-md bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-800 disabled:opacity-40"
            >
              {busy ? "Filing…" : "Attach"}
            </button>
            <span className="text-[10px] text-navy-600/70">
              Up to {humanSize(MAX_ATTACHMENT_BYTES)}. Filed against the job,
              this PO and the subcontractor.
            </span>
          </div>

          {filed.length > 0 && (
            <p className="text-[11px] text-emerald-700">
              Filed: {filed.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
