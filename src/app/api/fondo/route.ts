import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/quickbase";
import {
  buildSubmissionRecord,
  canSubmit,
  fondoConfigured,
  missingFondoFields,
  rejectSubmission,
  type FondoSubmission,
} from "@/lib/fondo";
import { caseForVendor, updateSubmittal, vendorForKey } from "@/lib/fondo-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A subcontractor sending in their Fondo (CFSE) poliza.
 *
 * Authentication is the vendor's AccessKey plus a case that belongs to them;
 * there is no send key here, because the caller is the subcontractor rather
 * than Byrdson staff. Everything written lands in staging fields — a
 * submission is not insurance until it has been reviewed.
 */
export async function POST(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Quickbase is not configured." },
      { status: 503 },
    );
  }
  if (!fondoConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: `The Fondo submittal fields are not set up in Quickbase yet (${missingFondoFields().join(", ")}). Nothing has been saved — tell Byrdson.`,
      },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const accessKey = typeof body.accessKey === "string" ? body.accessKey : "";
  const recordId = Number(body.recordId) || 0;

  const vendor = await vendorForKey(accessKey);
  if (!vendor) {
    return NextResponse.json(
      { ok: false, error: "This link is not valid. Ask Byrdson to send it again." },
      { status: 404 },
    );
  }

  const found = await caseForVendor(vendor, recordId);
  if (!found) {
    return NextResponse.json(
      { ok: false, error: "This link is not valid. Ask Byrdson to send it again." },
      { status: 404 },
    );
  }

  if (!canSubmit(found.status)) {
    return NextResponse.json(
      {
        ok: false,
        error: "This poliza has already been approved. There is nothing more to send.",
      },
      { status: 409 },
    );
  }

  const rawFile = body.file as { fileName?: unknown; data?: unknown } | null | undefined;
  const file =
    rawFile && typeof rawFile.fileName === "string" && typeof rawFile.data === "string"
      ? { fileName: rawFile.fileName.slice(0, 200), data: rawFile.data }
      : null;

  const submission: FondoSubmission = {
    insuranceAmount: Number(body.insuranceAmount) || 0,
    policyNumber:
      typeof body.policyNumber === "string" ? body.policyNumber.slice(0, 200) : "",
    file,
    submittedBy:
      typeof body.submittedBy === "string" ? body.submittedBy.slice(0, 200) : "",
  };

  const problem = rejectSubmission(submission, Boolean(found.submittedFileName));
  if (problem) {
    return NextResponse.json({ ok: false, error: problem }, { status: 400 });
  }

  try {
    await updateSubmittal(buildSubmissionRecord(found.recordId, submission));
  } catch (e) {
    console.error("[fondo] submit", e instanceof Error ? e.message : e);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Quickbase would not accept the submission, so nothing was saved. Try again, and tell Byrdson if it keeps failing.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, recordId: found.recordId });
}
