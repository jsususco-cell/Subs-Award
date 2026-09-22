import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";
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
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
