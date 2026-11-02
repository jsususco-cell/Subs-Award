import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/quickbase";
import { MAX_POLIZA_BYTES, canSubmit, fondoConfigured } from "@/lib/fondo";
import { caseForVendor, vendorForKey } from "@/lib/fondo-server";
import { startDirectUpload } from "@/lib/fondo-drive";
import { appBaseUrl } from "@/lib/fondo-mail";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * A one-time Google Drive upload address for a subcontractor's poliza.
 *
 * The form PUTs the file straight to Google (Fondo Poliza/<case>/), so no
 * server in between limits its size. Same gate as the submission itself: the
 * vendor's access key plus a case that belongs to that vendor. The address is
 * only issued to this app's own pages, because Google ties the upload to the
 * origin that asked for it.
 */
const ALLOWED = /\.(pdf|jpg|jpeg|png|heic|webp)$/i;

function allowedOrigin(origin: string): boolean {
  if (!origin) return false;
  try {
    const own = new URL(appBaseUrl()).origin;
    if (origin === own) return true;
  } catch {
    /* no base URL configured */
  }
  return process.env.NODE_ENV !== "production" && /^http:\/\/localhost(:\d+)?$/.test(origin);
}

export async function POST(request: Request) {
  if (!isConfigured() || !fondoConfigured()) {
    return NextResponse.json({ ok: false, error: "No disponible en este momento." }, { status: 503 });
  }
  const origin = request.headers.get("origin") ?? "";
  if (!allowedOrigin(origin)) {
    return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 200) : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType.slice(0, 100) : "";
  const size = Number(body.size) || 0;
  if (!ALLOWED.test(fileName)) {
    return NextResponse.json(
      { ok: false, error: "La póliza tiene que ser un PDF o una imagen (JPG, PNG, HEIC o WEBP)." },
      { status: 400 },
    );
  }
  if (size < 100) {
    return NextResponse.json({ ok: false, error: "Ese archivo parece vacío. Adjunte la póliza otra vez." }, { status: 400 });
  }
  if (size > MAX_POLIZA_BYTES) {
    return NextResponse.json({ ok: false, error: "Ese archivo es demasiado grande." }, { status: 400 });
  }

  const vendor = await vendorForKey(typeof body.accessKey === "string" ? body.accessKey : "");
  const found = vendor ? await caseForVendor(vendor, Number(body.recordId) || 0) : null;
  if (!vendor || !found) {
    return NextResponse.json(
      { ok: false, error: "Este enlace no es válido. Pida a Byrdson que se lo envíe otra vez." },
      { status: 404 },
    );
  }
  if (!canSubmit(found.status)) {
    return NextResponse.json(
      { ok: false, error: "La póliza de este caso ya fue aceptada. No hace falta enviar nada más." },
      { status: 409 },
    );
  }

  try {
    const { uploadUrl } = await startDirectUpload(found.recordId, { fileName, mimeType, size }, origin);
    return NextResponse.json({ ok: true, uploadUrl });
  } catch (e) {
    console.error("[fondo/upload-url]", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { ok: false, error: "No se pudo preparar el envío del archivo. Intente otra vez en un momento." },
      { status: 502 },
    );
  }
}
