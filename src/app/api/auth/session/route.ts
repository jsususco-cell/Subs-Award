import { NextResponse } from "next/server";
import { currentSession } from "@/lib/auth/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Whether this browser has a session, and nothing else.
 *
 * The framed sign-in page polls this while the person signs in in a small
 * window. It sits under /api/auth/ so the proxy lets it through without a
 * session — an anonymous caller has to get `false`, not a 401 or a redirect —
 * and it says no more than yes or no, so being public costs nothing.
 */
export async function GET() {
  const session = await currentSession();
  return NextResponse.json(
    { authed: Boolean(session) },
    { headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } },
  );
}
