import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, openSession } from "@/lib/auth/session";

/**
 * Next 16 renamed `middleware.ts` to `proxy.ts`. Same execution point: runs
 * before a route renders.
 *
 * This is a convenience redirect, not the authorisation boundary. Next
 * documents that proxy may be deployed to the CDN and should not be relied on
 * for shared state, so the privileged routes keep checking the send key
 * themselves. Keeping the check here as well means an anonymous visitor gets
 * the sign-in page instead of a flash of empty shell — and it is what finally
 * closes /api/qb, which until now served the job and vendor lists to anyone
 * with the URL.
 *
 * The session is verified rather than merely sniffed, using Web Crypto so it
 * works on the edge runtime too.
 */

/** Open to the world, each for a reason. */
function isPublic(pathname: string): boolean {
  // Signing in cannot itself require being signed in.
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) return true;

  // The subcontractor's Fondo form. They have no Workspace account; their
  // gate is the access key in the URL, checked by the page and the route.
  // /fondo/review is the internal queue and is deliberately not covered.
  if (pathname.startsWith("/fondo/") && !pathname.startsWith("/fondo/review")) return true;
  if (pathname === "/api/fondo") return true;

  // The scheduled notifier, called by n8n with CRON_SECRET or the send key.
  // The route authorises itself; a sign-in page would just confuse a robot.
  if (pathname === "/api/fondo/notify") return true;

  return false;
}

/** Constant-time-ish comparison, duplicated from mail.ts because that module
 * pulls in nodemailer and cannot be loaded on the edge. */
function sendKeyMatches(provided: string): boolean {
  const expected = process.env.LETTER_SEND_KEY ?? "";
  if (!expected || !provided) return false;
  const enc = new TextEncoder();
  const a = enc.encode(expected);
  const b = enc.encode(provided);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * The price of a SameSite=None session cookie: it is sent on cross-site
 * requests, so another site's form could ride on it. Every state-changing
 * request therefore has to come from this origin. Browsers always send Origin
 * on those; a machine caller sends none and is authorised by its key instead.
 */
function crossSite(request: NextRequest): boolean {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") {
    return false;
  }
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== (request.headers.get("host") ?? request.nextUrl.host);
  } catch {
    return true;
  }
}

/**
 * Nothing this proxy sees may be held in a shared cache.
 *
 * Every page behind it renders for one person — their email in the header,
 * the regions they hold, the queue they may act on — and a subcontractor's
 * Fondo form renders one case's details. A CDN holding any of that and
 * handing it to the next caller is the failure mode, and it is not
 * hypothetical: this app spent a while serving a prerendered copy of the
 * signed-out home page to everyone, made before sign-in existed, because the
 * edge had cached it and nothing since had said not to.
 *
 * `force-dynamic` tells Next how to render. It does not tell the CDN what it
 * may keep. This does.
 */
function uncached(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return res;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const keyed = sendKeyMatches(request.headers.get("x-send-key") ?? "");

  if (crossSite(request) && !keyed) {
    return uncached(
      NextResponse.json(
        { ok: false, error: "Cross-site request refused." },
        { status: 403 },
      ),
    );
  }

  if (isPublic(pathname)) return uncached(NextResponse.next());

  // A key is how the scripts and n8n reach the privileged routes. It was the
  // only credential this app had until now, and breaking it would break the
  // scheduled work the moment sign-in shipped.
  if (keyed) return uncached(NextResponse.next());

  const session = await openSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return uncached(NextResponse.next());

  // An expired API call should get a status code, not an HTML sign-in page — a
  // fetch that silently receives a login form is the hardest kind of bug to read.
  if (pathname.startsWith("/api/")) {
    return uncached(
      NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 }),
    );
  }

  const login = new URL("/login", request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return uncached(NextResponse.redirect(login));
}

export const config = {
  // Everything except Next's own assets and the favicon.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
