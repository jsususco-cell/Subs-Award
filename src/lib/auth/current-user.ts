import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, openSession, type Session } from "./session";

/**
 * How server components and route handlers ask who is calling.
 *
 * `proxy.ts` already turns anonymous requests away, but it runs before
 * rendering and Next explicitly warns against relying on it as the only gate.
 * Pages re-check here — the proxy is a redirect for convenience, this is the
 * authorisation.
 */
export async function currentSession(): Promise<Session | null> {
  const jar = await cookies();
  return openSession(jar.get(SESSION_COOKIE)?.value);
}

export async function requireSession(next = "/"): Promise<Session> {
  const session = await currentSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(next)}`);
  return session;
}
