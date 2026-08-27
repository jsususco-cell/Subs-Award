import { NextResponse } from "next/server";
import { renderLetter } from "@/lib/letter";
import { parseLetterInput } from "@/lib/letter-input";
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
      { ok: false, error: "Missing or malformed letter details" },
      { status: 400 },
    );
  }

  try {
    const pdf = await htmlToPdf(renderLetter(input));
    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${pdfFileName(input.jobName)}"`,
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
