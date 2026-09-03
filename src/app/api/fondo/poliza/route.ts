import { isConfigured } from "@/lib/quickbase";
import { fondoConfigured } from "@/lib/fondo";
import { polizaFile } from "@/lib/fondo-server";
import { sendKey, sendKeyMatches, sendKeyRequired } from "@/lib/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Stream a submitted poliza to the reviewer.
 *
 * Gated by the send key like every other privileged route. These are other
 * companies' insurance certificates; an open endpoint here would let anyone
 * who guessed a record id read them, which is worse than the inconvenience of
 * a key.
 *
 * Served inline rather than as an attachment, because the whole point is that
 * the reviewer sees it without downloading anything.
 */
export async function GET(request: Request) {
  if (
    sendKeyRequired() &&
    !(sendKey() && sendKeyMatches(request.headers.get("x-send-key") ?? ""))
  ) {
    return Response.json(
      { ok: false, keyRequired: true, error: "Send key missing or incorrect." },
      { status: 401 },
    );
  }
  if (!isConfigured() || !fondoConfigured()) {
    return Response.json({ ok: false, error: "Not configured." }, { status: 503 });
  }

  const recordId = Number(new URL(request.url).searchParams.get("recordId")) || 0;
  if (!recordId) {
    return Response.json({ ok: false, error: "No case given." }, { status: 400 });
  }

  const file = await polizaFile(recordId);
  if (!file) {
    return Response.json(
      { ok: false, error: "There is no document on that case." },
      { status: 404 },
    );
  }

  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `inline; filename="${file.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
