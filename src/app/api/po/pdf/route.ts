import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/quickbase";
import { htmlToPdf, pdfFileName } from "@/lib/pdf";
import { renderPoDocument } from "@/lib/po-doc";
import {
  fetchPoDocument,
  PoNotFoundError,
  PoNotInRegionError,
} from "@/lib/qb-po-doc";
import { regionFor } from "@/lib/regions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Render a purchase order to PDF, for reading before it is sent.
 *
 * Takes a record id, never a document: the figures are read from Quickbase so
 * a preview cannot show something the record does not say.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  const region = regionFor(body.region);
  const poRecordId = Number(body.poRecordId) || 0;

  if (!region.poDocument) {
    return NextResponse.json(
      {
        ok: false,
        error: `${region.label} does not send a purchase order document to subcontractors.`,
      },
      { status: 400 },
    );
  }
  if (!poRecordId) {
    return NextResponse.json(
      { ok: false, error: "A purchase order record id is required." },
      { status: 400 },
    );
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

  try {
    const doc = await fetchPoDocument(region, poRecordId);
    const pdf = await htmlToPdf(renderPoDocument(doc));
    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${pdfFileName(doc.poNumber || `PO-${poRecordId}`, ".pdf")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof PoNotFoundError || e instanceof PoNotInRegionError) {
      return NextResponse.json(
        { ok: false, error: e.message },
        { status: 400 },
      );
    }
    const message = e instanceof Error ? e.message : "PDF rendering failed";
    console.error("[po/pdf]", message);
    return NextResponse.json(
      { ok: false, error: `Could not render the purchase order: ${message}` },
      { status: 500 },
    );
  }
}
