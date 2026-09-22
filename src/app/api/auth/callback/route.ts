import { NextResponse, type NextRequest } from "next/server";
import { ALLOWED_DOMAIN, exchangeCode, isAllowedIdentity, STATE_COOKIE } from "@/lib/auth/google";
import {
  newSession,
  sealSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/safe-next";
import { logAudit } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(request: NextRequest, reason: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", reason);
  const res = NextResponse.redirect(url);
  res.cookies.delete(STATE_COOKIE);
  return res;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  if (params.get("error")) return back(request, "cancelled");

  const raw = request.cookies.get(STATE_COOKIE)?.value;
  if (!raw) return back(request, "expired");

  let stored: { state: string; verifier: string; next: string };
  try {
    stored = JSON.parse(raw);
  } catch {
    return back(request, "expired");
  }

  const code = params.get("code");
  if (!code || params.get("state") !== stored.state) return back(request, "state");

  let identity;
  try {
    identity = await exchangeCode(code, stored.verifier);
  } catch (err) {
    console.error("[auth] code exchange failed:", (err as Error).message);
    return back(request, "exchange");
  }

  if (!isAllowedIdentity(identity)) {
    await logAudit({
      action: "auth.signin",
      actor: identity.email,
      outcome: "denied",
      details: { reason: "domain", expected: ALLOWED_DOMAIN },
    });
    return back(request, "domain");
  }

  const session = newSession({
    sub: identity.sub,
    email: identity.email,
    name: identity.name,
    picture: identity.picture,
  });

  let cookie: string;
  try {
    cookie = await sealSession(session);
  } catch (err) {
    // AUTH_SECRET missing or too short. Saying so beats a cookie nobody can
    // verify, which would look like a sign-in that silently never takes.
    console.error("[auth]", (err as Error).message);
    return back(request, "secret");
  }

  await logAudit({
    action: "auth.signin",
    actor: identity.email,
    outcome: "ok",
    details: { method: "google" },
  });

  const res = NextResponse.redirect(new URL(safeNext(stored.next), request.url));
  res.cookies.set(SESSION_COOKIE, cookie, sessionCookieOptions());
  res.cookies.delete(STATE_COOKIE);
  return res;
}
