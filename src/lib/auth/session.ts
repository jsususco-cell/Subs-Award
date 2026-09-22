/**
 * The signed session cookie.
 *
 * Ported from the ERP, and written with Web Crypto only — no `node:crypto` —
 * because the same verification runs in `proxy.ts`, which Next may execute on
 * the edge runtime where node builtins are unavailable.
 *
 * The cookie says who is signed in and nothing more. This app has no role
 * model: the Workspace domain is the gate for getting in, and the send key is
 * still the gate on everything that writes to Quickbase or sends mail. Adding
 * roles here would mean inventing a permission scheme nobody has asked for,
 * and a half-invented one reads as protection without being any.
 */

export const SESSION_COOKIE = "subs_award_session";
export const SESSION_TTL_HOURS = 12;

export type Session = {
  /** Google subject id — stable even if the person changes their name. */
  sub: string;
  email: string;
  name: string;
  picture?: string;
  /** Seconds since epoch. */
  iat: number;
  exp: number;
};

const encoder = new TextEncoder();

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export function authSecret(): string {
  return process.env.AUTH_SECRET?.trim() ?? "";
}

function secret(): string {
  const s = authSecret();
  if (s.length < 32) {
    throw new Error(
      "AUTH_SECRET is missing or shorter than 32 characters. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\"",
    );
  }
  return s;
}

/** Constant-time comparison — a fast `!==` on a MAC leaks it a byte at a time. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function sealSession(session: Session): Promise<string> {
  const payload = b64urlEncode(encoder.encode(JSON.stringify(session)));
  const mac = await crypto.subtle.sign("HMAC", await key(secret()), encoder.encode(payload));
  return `${payload}.${b64urlEncode(new Uint8Array(mac))}`;
}

/** Returns the session, or null for anything malformed, tampered with or expired. */
export async function openSession(cookie: string | undefined): Promise<Session | null> {
  if (!cookie || authSecret().length < 32) return null;
  const [payload, mac] = cookie.split(".");
  if (!payload || !mac) return null;

  // A hand-typed or truncated cookie is not base64 at all, and atob throws on
  // it. Anything unparseable is simply "not signed in", never an error page.
  let expected: Uint8Array;
  let presented: Uint8Array;
  try {
    expected = new Uint8Array(
      await crypto.subtle.sign("HMAC", await key(secret()), encoder.encode(payload)),
    );
    presented = b64urlDecode(mac);
  } catch {
    return null;
  }
  if (!sameBytes(expected, presented)) return null;

  try {
    const session = JSON.parse(new TextDecoder().decode(b64urlDecode(payload))) as Session;
    if (!session.exp || session.exp * 1000 < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function newSession(input: Omit<Session, "iat" | "exp">): Session {
  const now = Math.floor(Date.now() / 1000);
  return { ...input, iat: now, exp: now + SESSION_TTL_HOURS * 3600 };
}

/**
 * How the session cookie is scoped.
 *
 * SameSite=None is not an oversight. This app is embedded in an iframe on the
 * Quickbase dashboard, which is a different site, and a Lax cookie is simply
 * not sent there — the embed would show the sign-in page forever. The cost of
 * None is that the cookie rides along on cross-site POSTs, so `proxy.ts`
 * checks the Origin header on every state-changing request instead.
 *
 * Locally it falls back to Lax: None requires Secure, and dev is plain http,
 * so a browser would drop the cookie entirely.
 */
export function sessionCookieOptions(): {
  httpOnly: true;
  sameSite: "none" | "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  const secure = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    sameSite: secure ? "none" : "lax",
    secure,
    path: "/",
    maxAge: SESSION_TTL_HOURS * 3600,
  };
}
