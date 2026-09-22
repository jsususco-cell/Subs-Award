import { NextResponse, type NextRequest } from "next/server";
import { authorizeUrl, pkceChallenge, randomToken, STATE_COOKIE } from "@/lib/auth/google";
import { safeNext } from "@/lib/auth/safe-next";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Begins Google sign-in. */
export async function GET(request: NextRequest) {
  const next = safeNext(request.nextUrl.searchParams.get("next"));

  const state = randomToken();
  const verifier = randomToken(48);

  let url: string;
  try {
    url = authorizeUrl({ state, codeChallenge: await pkceChallenge(verifier) });
  } catch (err) {
    console.error("[auth] cannot start sign-in:", (err as Error).message);
    const back = new URL("/login", request.url);
    back.searchParams.set("error", "unconfigured");
    return NextResponse.redirect(back);
  }

  const res = NextResponse.redirect(url);

  // State and verifier ride back in an HttpOnly cookie and are compared
  // against the query parameter at the callback — a request that did not start
  // here cannot match.
  res.cookies.set(STATE_COOKIE, JSON.stringify({ state, verifier, next }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
