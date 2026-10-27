import { NextResponse } from "next/server";
import { caseHistory } from "@/lib/fondo-history";
import { refuseRegion } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

/**
 * One Fondo case's history, newest first. Puerto Rico staff only (Fondo is
 * PR work); refuseRegion also lets a caller with no session through only with
 * the send key.
 */
export async function GET(request: Request) {
  const refused = await refuseRegion(request, "PR");
  if (refused) return refused;

  const recordId = Number(new URL(request.url).searchParams.get("recordId")) || 0;
  if (!recordId) {
    return NextResponse.json({ ok: false, error: "No case given." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, entries: await caseHistory(recordId) });
}
