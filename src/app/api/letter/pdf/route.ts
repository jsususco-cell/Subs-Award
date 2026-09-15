import { NextResponse } from "next/server";
import { canRenderLetter, NoLetterTemplateError, renderLetter } from "@/lib/letter";
import { parseLetterInput } from "@/lib/letter-input";
import { templateFor } from "@/lib/letter-content";
import { regionFor } from "@/lib/regions";
import { htmlToPdf, pdfFileName } from "@/lib/pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Render the award letter to PDF. The HTML is built here, never accepted. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const input = parseLetterInput(body);
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

  // A region with no template is a 400, not a 500: the request is well formed,
  // there is simply no letter to render for it.
  if (!canRenderLetter(input.region)) {
    return NextResponse.json(
      { ok: false, error: new NoLetterTemplateError(regionFor(input.region).label).message },
      { status: 400 },
    );
  }

  const suffix = templateFor(regionFor(input.region))?.fileSuffix ?? ".pdf";

  try {
    const pdf = await htmlToPdf(renderLetter(input));
    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${pdfFileName(input.jobName, suffix)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "PDF rendering failed";
    console.error("[letter/pdf]", message);
    return NextResponse.json(
      { ok: false, error: `Could not render the PDF: ${message}` },
      { status: 500 },
    );
  }
}
