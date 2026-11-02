import "server-only";
import { MAIL_CONFIG, sendKey } from "./mail";
import { QB_AWARD } from "./qb-award";
import { updateSubmittal } from "./fondo-server";
import { queryAll } from "./quickbase";
import { FONDO_FIELDS, currentFile } from "./fondo";

/**
 * Fondo polizas in Google Drive (user decision, 3 Nov 2026):
 *
 *   Fondo Poliza / <case number> / "<PO> - <subcontractor> - <STATUS> - <date>.pdf"
 *
 * Every upload is filed as SUBMITTED; approving or returning renames it, so the
 * folder always says where each document stands. The work is done by the n8n
 * workflow "Subs Award — Fondo poliza to Drive" (scripts/setup-n8n-fondo-drive.mjs),
 * which holds the Drive credential; the app only sends the bytes.
 *
 * The record keeps the link in the table's Drive fields (34-37), the same ones
 * the older Smartsheet mirror used. Drive never decides anything: a failed copy
 * is logged on the record as MIRROR FAILED and never fails the upload or the
 * decision it belongs to.
 */

export const DRIVE_FIELDS = { folderId: 34, status: 35, mirroredOn: 36, fileId: 37 } as const;

export type DriveStatus = "SUBMITTED" | "APPROVED" | "RETURNED" | "ON FILE";

function webhook(): string {
  try {
    return MAIL_CONFIG.webhookUrl ? `${new URL(MAIL_CONFIG.webhookUrl).origin}/webhook/fondo-poliza-drive` : "";
  } catch {
    return "";
  }
}

function clean(s: string): string {
  return String(s ?? "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
}

/** "PO-8280 - Encon Company Inc - APPROVED - 2026-11-03.pdf" */
export function driveFileName(
  poNumber: string,
  subcontractor: string,
  status: DriveStatus,
  originalName: string,
  when = new Date(),
): string {
  const ext = /\.([a-z0-9]{2,5})$/i.exec(originalName)?.[1]?.toLowerCase() ?? "pdf";
  return `${clean(poNumber) || "sin PO"} - ${clean(subcontractor) || "Subcontratista"} - ${status} - ${when
    .toISOString()
    .slice(0, 10)}.${ext}`;
}

function mimeOf(name: string): string {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  return ext === "jpg" || ext === "jpeg"
    ? "image/jpeg"
    : ext === "png"
      ? "image/png"
      : ext === "webp"
        ? "image/webp"
        : ext === "heic"
          ? "image/heic"
          : "application/pdf";
}

async function call(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = webhook();
  if (!url || !sendKey()) throw new Error("Drive filing is not configured (no n8n URL or send key).");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-send-key": sendKey() },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  if (!res.ok || parsed.ok !== true) throw new Error(`Drive ${res.status}: ${text.slice(0, 200)}`);
  return parsed;
}

/** What naming and filing need from the record: case, sub, PO, and any filed copy. */
async function driveInfo(recordId: number): Promise<{
  caseNumber: string;
  subcontractor: string;
  poNumber: string;
  fileId: string;
  folderId: string;
  fileName: string;
} | null> {
  const ins = QB_AWARD.insurance;
  const rows = await queryAll({
    from: QB_AWARD.tables.insurance,
    select: [ins.recordId, ins.caseNumber, ins.subcontractorName, FONDO_FIELDS.poNumber, FONDO_FIELDS.submittedPoliza, ins.poliza, DRIVE_FIELDS.fileId, DRIVE_FIELDS.folderId],
    where: `{${ins.recordId}.EX.${recordId}}`,
  });
  const r = rows[0];
  if (!r) return null;
  const v = (f: number) => String(r[String(f)]?.value ?? "").trim();
  return {
    caseNumber: v(ins.caseNumber),
    subcontractor: v(ins.subcontractorName),
    poNumber: v(FONDO_FIELDS.poNumber),
    fileId: v(DRIVE_FIELDS.fileId),
    folderId: v(DRIVE_FIELDS.folderId),
    fileName:
      currentFile(r[String(FONDO_FIELDS.submittedPoliza)]?.value).name ||
      currentFile(r[String(ins.poliza)]?.value).name ||
      "poliza.pdf",
  };
}

/**
 * File one record's poliza in Fondo Poliza/<case>/ and record where on the case.
 * Never throws: returns the Drive file id, or "" when it could not be filed.
 */
export async function fileInDrive(
  recordId: number,
  status: DriveStatus,
  file: { fileName: string; data: string },
): Promise<string> {
  const ins = QB_AWARD.insurance;
  try {
    const info = await driveInfo(recordId);
    if (!info) return "";
    const out = await call({
      action: "upload",
      caseNumber: info.caseNumber,
      fileName: driveFileName(info.poNumber, info.subcontractor, status, file.fileName),
      mimeType: mimeOf(file.fileName),
      data: file.data,
    });
    await updateSubmittal({
      [ins.recordId]: { value: recordId },
      [DRIVE_FIELDS.fileId]: { value: String(out.fileId ?? "") },
      [DRIVE_FIELDS.folderId]: { value: String(out.folderId ?? "") },
      [DRIVE_FIELDS.status]: { value: "MIRRORED" },
      // A date field, not a timestamp: a full ISO time is rejected.
      [DRIVE_FIELDS.mirroredOn]: { value: new Date().toISOString().slice(0, 10) },
    });
    return String(out.fileId ?? "");
  } catch (e) {
    console.error("[fondo-drive] upload", recordId, e instanceof Error ? e.message : e);
    await updateSubmittal({
      [ins.recordId]: { value: recordId },
      [DRIVE_FIELDS.status]: { value: "MIRROR FAILED" },
    }).catch(() => undefined);
    return "";
  }
}

/**
 * The record's status changed: rename its copy in Fondo Poliza if it was filed
 * there, otherwise file it now (when the bytes are at hand). Never throws.
 */
export async function markInDrive(
  recordId: number,
  status: DriveStatus,
  file: { fileName: string; data: string } | null,
): Promise<void> {
  try {
    const info = await driveInfo(recordId);
    if (!info) return;
    // A copy the old Smartsheet mirror put in a job folder is not in Fondo
    // Poliza: file a fresh one there rather than renaming the old one.
    if (info.fileId && info.folderId && (await isInFondoFolder(info.folderId))) {
      await renameInDrive(info.fileId, driveFileName(info.poNumber, info.subcontractor, status, info.fileName));
      return;
    }
    if (file) await fileInDrive(recordId, status, file);
  } catch (e) {
    console.error("[fondo-drive] mark", recordId, e instanceof Error ? e.message : e);
  }
}

/** Case folders this app made live directly under Fondo Poliza. */
const FONDO_ROOT = "13hReruRL566lvBqzUUW3rSs3n2-0xzrf";
const knownCaseFolders = new Set<string>();
async function isInFondoFolder(folderId: string): Promise<boolean> {
  if (knownCaseFolders.has(folderId)) return true;
  try {
    const out = await call({ action: "parent", fileId: folderId });
    const ok = out.parentId === FONDO_ROOT;
    if (ok) knownCaseFolders.add(folderId);
    return ok;
  } catch {
    return false;
  }
}

/** Rename an already-filed poliza when its status changes. Never throws. */
export async function renameInDrive(fileId: string, name: string): Promise<boolean> {
  if (!fileId) return false;
  try {
    await call({ action: "rename", fileId, name });
    return true;
  } catch (e) {
    console.error("[fondo-drive] rename", fileId, e instanceof Error ? e.message : e);
    return false;
  }
}
