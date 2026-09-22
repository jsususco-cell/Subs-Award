/**
 * Where sign-in is allowed to send someone afterwards.
 *
 * Only a path on this site. `//evil.example` is a protocol-relative URL that a
 * browser will happily treat as another origin, so a bare "starts with /"
 * check is not enough and this is the classic open-redirect hole in a login
 * flow.
 */
export function safeNext(candidate: string | null | undefined, fallback = "/"): string {
  if (!candidate) return fallback;
  if (!candidate.startsWith("/")) return fallback;
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) return fallback;
  return candidate;
}
