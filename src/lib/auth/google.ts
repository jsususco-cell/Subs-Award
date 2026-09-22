import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { authBaseUrl } from "@/lib/base-url";

/**
 * Google Workspace sign-in, hand-rolled against the OIDC endpoints and taken
 * from the ERP unchanged apart from the cookie name.
 *
 * Deliberately not a framework auth library: this app pins an unusual Next
 * version, the flow is a hundred lines, and an authentication dependency that
 * breaks on a minor upgrade is worse than one we can read in full.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export const STATE_COOKIE = "subs_award_oauth";

/** The Workspace domain allowed to sign in. */
export const ALLOWED_DOMAIN = (
  process.env.AUTH_ALLOWED_DOMAIN?.trim() || "byrdsonservices.com"
).toLowerCase();

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is not set. See .env.example for what it is and where to get it.`);
  return v;
}

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export function redirectUri(): string {
  return `${authBaseUrl()}/api/auth/callback`;
}

export type GoogleIdentity = {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  hd?: string;
  emailVerified: boolean;
};

/** Random URL-safe string for the state and PKCE verifier. */
export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  let bin = "";
  for (const b of new Uint8Array(digest)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function authorizeUrl(opts: { state: string; codeChallenge: string }): string {
  const params = new URLSearchParams({
    client_id: required("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
    // Ask Google to show only Workspace accounts on this domain. It is a hint
    // to the account chooser, not a security control — the callback still
    // checks the domain.
    hd: ALLOWED_DOMAIN,
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export async function exchangeCode(code: string, codeVerifier: string): Promise<GoogleIdentity> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: required("GOOGLE_CLIENT_ID"),
      client_secret: required("GOOGLE_CLIENT_SECRET"),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Google rejected the sign-in code exchange: ${detail.slice(0, 300)}`);
  }

  const body = (await res.json()) as { id_token?: string };
  if (!body.id_token) throw new Error("Google returned no id_token, so there is no identity to trust.");

  const { payload } = await jwtVerify(body.id_token, JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: required("GOOGLE_CLIENT_ID"),
  });

  const email = String(payload.email ?? "").toLowerCase();
  if (!email) throw new Error("Google returned an identity with no email address.");

  return {
    sub: String(payload.sub),
    email,
    name: String(payload.name ?? email),
    picture: payload.picture ? String(payload.picture) : undefined,
    hd: payload.hd ? String(payload.hd).toLowerCase() : undefined,
    emailVerified: payload.email_verified === true,
  };
}

/**
 * The domain gate. Google's `hd` parameter only filters the account chooser,
 * so this is where a personal account that knows the callback URL is actually
 * turned away.
 */
export function isAllowedIdentity(identity: GoogleIdentity): boolean {
  if (!identity.emailVerified) return false;
  const domain = identity.hd ?? identity.email.split("@")[1] ?? "";
  return domain === ALLOWED_DOMAIN;
}
