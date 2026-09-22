import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Brand from "@/components/Brand";
import SignInButton from "@/components/SignInButton";
import { currentSession } from "@/lib/auth/current-user";
import { safeNext } from "@/lib/auth/safe-next";
import { ALLOWED_DOMAIN, googleConfigured } from "@/lib/auth/google";
import { authSecret } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in · Subcontractor Award System",
  robots: { index: false, follow: false },
};

const MESSAGES: Record<string, string> = {
  domain: `That account is not on ${ALLOWED_DOMAIN}. Sign in with your Byrdson Workspace account.`,
  state: "That sign-in link did not match the one this browser started. Try again.",
  expired: "The sign-in attempt timed out. Try again.",
  exchange:
    "Google could not complete the sign-in. If this keeps happening, the OAuth credentials need checking.",
  cancelled: "Sign-in was cancelled.",
  unconfigured: "Google sign-in is not configured on this deployment yet.",
  secret: "The session key is missing on this deployment, so the sign-in could not be saved.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  if (await currentSession()) redirect(safeNext(next));

  const target = `/api/auth/start?next=${encodeURIComponent(safeNext(next))}`;
  const ready = googleConfigured() && authSecret().length >= 32;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b-4 border-brand-red bg-navy-700">
        <div className="mx-auto flex w-full max-w-md items-center px-4 py-3.5">
          <Brand />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm rounded-xl border border-navy-100 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-navy-800">Sign in</h1>
          <p className="mt-1 text-sm leading-relaxed text-navy-600/80">
            Use your Byrdson Workspace account. Access is limited to {ALLOWED_DOMAIN}.
          </p>

          {error ? (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-brand-red/30 bg-brand-red-50 px-3 py-2 text-sm text-brand-red-dark"
            >
              {MESSAGES[error] ?? "Sign-in failed. Try again."}
            </p>
          ) : null}

          {ready ? (
            <SignInButton href={target} label="Continue with Google" />
          ) : (
            <p className="mt-6 rounded-lg border border-navy-100 bg-navy-50 px-3 py-3 text-sm leading-relaxed text-navy-600/80">
              Sign-in is not configured on this deployment yet. It needs{" "}
              <code className="font-mono text-xs">GOOGLE_CLIENT_ID</code>,{" "}
              <code className="font-mono text-xs">GOOGLE_CLIENT_SECRET</code> and{" "}
              <code className="font-mono text-xs">AUTH_SECRET</code>; the README has the
              steps.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
