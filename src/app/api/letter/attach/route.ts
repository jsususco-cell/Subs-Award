import { NextResponse } from "next/server";
import {
  canRenderLetter,
  NoLetterTemplateError,
  renderLetter,
} from "@/lib/letter";
import { parseLetterInput } from "@/lib/letter-input";
import { templateFor } from "@/lib/letter-content";
import { regionFor } from "@/lib/regions";
import { refusePo, refuseRegion } from "@/lib/auth/guard";
import { htmlToPdf, pdfFileName } from "@/lib/pdf";
import { attachFile } from "@/lib/qb-attach";
import { QB_AWARD } from "@/lib/qb-award";
import { isConfigured } from "@/lib/quickbase";
import { sendKey, sendKeyMatches, sendKeyRequired } from "@/lib/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * File the award letter on the purchase order it belongs to.
 *
 * The letter is the document the subcontractor is being held to, so it should
 * be readable from the Quickbase table by anyone looking at the award — not
 * only from an inbox, and not only by re-running this app and hoping the
 * figures still render the same.
 *
 * It is built here from the same input the letter was rendered from, never
 * accepted as a file: a route that attached whatever it was handed would put
 * an unreviewed document on a contract record.
 *
 * Deliberately separate from sending. Filing the letter is about the record
 * and happens whether or not anybody emailed it.
 */
export async function POST(request: Request) {
  /*
   * Gated like the other writing routes. This puts a document on a live
   * contract record, which is not something an unauthenticated caller should
   * be able to do to an arbitrary purchase order.
   */
  if (sendKeyRequired()) {
    if (!sendKey()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Attaching is disabled on this deployment: LETTER_SEND_KEY is not set.",
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
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  const poRecordId = Number(body.poRecordId) || 0;
  if (!poRecordId) {
    return NextResponse.json(
      { ok: false, error: "A purchase order record id is required." },
      { status: 400 },
    );
  }

  // The letter is written onto this purchase order's record, so the record's
  // own region is what has to be allowed.
  const refusedPo = await refusePo(request, poRecordId);
  if (refusedPo) return refusedPo;

  const input = parseLetterInput(body.letter);
  if (!input) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Missing or malformed letter details. A valid region is required — the letter's language and conditions follow from it.",
      },
      { status: 400 },
    );
  }

  // Writes the letter onto the purchase order record in Quickbase.
  const refused = await refuseRegion(request, input.region);
  if (refused) return refused;

  if (!canRenderLetter(input.region)) {
    return NextResponse.json(
      {
        ok: false,
        noTemplate: true,
        error: new NoLetterTemplateError(regionFor(input.region).label).message,
      },
      { status: 400 },
    );
  }

  const fileName = pdfFileName(
    input.jobName,
    templateFor(regionFor(input.region))?.fileSuffix ?? ".pdf",
  );

  try {
    const pdf = await htmlToPdf(renderLetter(input));
    await attachFile({
      tableId: QB_AWARD.tables.pos,
      recordId: poRecordId,
      fieldId: QB_AWARD.pos.awardLetterDoc,
      fileName,
      bytes: pdf,
    });

    return NextResponse.json({
      ok: true,
      poRecordId,
      attachment: fileName,
      bytes: pdf.byteLength,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Attaching failed";
    console.error("[letter/attach]", message);
    return NextResponse.json(
      {
        ok: false,
        error: `The letter could not be filed on the purchase order: ${message}`,
      },
      { status: 502 },
    );
  }
}
