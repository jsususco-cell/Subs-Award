import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/quickbase";
import {
  attachmentProblem,
  humanSize,
  MAX_ATTACHMENT_BYTES,
} from "@/lib/attachments";
import { createAttachment, fetchAttachments } from "@/lib/qb-attachments";
import { regionFor } from "@/lib/regions";
import { refuseJob, refuseRegion } from "@/lib/auth/guard";
import { sendKey, sendKeyMatches, sendKeyRequired } from "@/lib/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** What is already filed against a job. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const jobRecordId = Number(params.get("job")) || 0;

  if (!isConfigured()) {
    return NextResponse.json({ ok: true, configured: false, items: [] });
  }
  if (!jobRecordId) {
    return NextResponse.json(
      { ok: false, error: "A job record id is required." },
      { status: 400 },
    );
  }

  // Addressed by job, not by region, so the job's own state is what decides.
  const refused = await refuseJob(request, jobRecordId);
  if (refused) return refused;

  try {
    return NextResponse.json({
      ok: true,
      configured: true,
      items: await fetchAttachments(jobRecordId),
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not read the attachments";
    console.error("[qb/attachments] GET", message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

/**
 * File a document against a job.
 *
 * Gated like the other writing routes: this puts a file into the company's
 * shared document store, against a real job.
 */
export async function POST(request: Request) {
  if (sendKeyRequired()) {
    if (!sendKey()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Uploading is disabled on this deployment: LETTER_SEND_KEY is not set.",
        },
        { status: 503 },
      );
    }
    if (!sendKeyMatches(request.headers.get("x-send-key") ?? "")) {
      return NextResponse.json(
        {
          ok: false,
          keyRequired: true,
          error: "Send key missing or incorrect.",
        },
        { status: 401 },
      );
    }
  }

  if (!isConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error: "Quickbase is not configured — QB_USER_TOKEN is not set.",
      },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    /*
     * A body over the platform's limit arrives as unparseable rather than as
     * a clean error, so an oversized file looks like malformed JSON. Say what
     * it probably is instead of leaving somebody to guess.
     */
    return NextResponse.json(
      {
        ok: false,
        error:
          `Could not read the upload. If the file is larger than ` +
          `${humanSize(MAX_ATTACHMENT_BYTES)}, attach it on the Quickbase ` +
          `record instead — it is too big to go through here.`,
      },
      { status: 400 },
    );
  }

  const jobRecordId = Number(body.jobRecordId) || 0;
  const fileName = String(body.fileName ?? "").trim();
  const data = String(body.data ?? "");
  /* base64 carries 3 bytes in every 4 characters, padding aside. */
  const bytes = Math.floor((data.length * 3) / 4);

  const problem = attachmentProblem({ jobRecordId, fileName, bytes });
  if (problem) {
    return NextResponse.json({ ok: false, error: problem }, { status: 400 });
  }

  // The region now has to be one this person works in, not merely a region
  // that exists: filing a document writes into the shared Attachments table
  // against a real job.
  const refused = await refuseRegion(request, body.region);
  if (refused) return refused;
  const region = regionFor(body.region);

  try {
    const { recordId } = await createAttachment({
      jobRecordId,
      poRecordId: Number(body.poRecordId) || undefined,
      subRecordId: Number(body.subRecordId) || undefined,
      category: String(body.category ?? ""),
      description: String(body.description ?? ""),
      fileName,
      data,
    });

    return NextResponse.json({
      ok: true,
      recordId,
      fileName,
      bytes,
      region: region.key,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "The upload failed";
    console.error("[qb/attachments] POST", message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
