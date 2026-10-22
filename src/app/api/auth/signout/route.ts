import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { currentSession } from "@/lib/auth/current-user";
import { logAudit } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST only: a GET sign-out can be triggered by any image tag on any page. */
export async function POST(request: NextRequest) {
  const session = await currentSession();
  if (session) {
    await logAudit({ action: "auth.signout", actor: session.email, outcome: "ok" });
  }
  const res = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  // Cleared with the attributes it was set with. A bare delete is SameSite=Lax,
  // which the browser ignores inside the Quickbase frame (a cross-site context),
  // so the person stayed signed in there.
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
