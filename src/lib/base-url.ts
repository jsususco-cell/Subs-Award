/**
 * Where the app is reachable from.
 *
 * Two callers with different tolerances for not knowing:
 *
 * `appBaseUrl` refuses to guess, because its answer goes into an email and a
 * relative link is useless in an inbox — the sender reports the missing
 * configuration rather than mailing something broken.
 *
 * `authBaseUrl` falls back to the dev port, because its answer is the OAuth
 * redirect URI and sign-in has to work on a laptop with no APP_BASE_URL set.
 * The value still has to match what is registered in Google exactly, so on a
 * deployment it comes from the same configuration as everything else.
 */
export function appBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;
  return "";
}

export function authBaseUrl(): string {
  return appBaseUrl() || "http://localhost:3040";
}
