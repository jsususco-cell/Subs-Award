"use client";

import { useSyncExternalStore } from "react";

/**
 * The "Continue with Google" button, which has to behave differently inside
 * the Quickbase dashboard.
 *
 * Google sets X-Frame-Options on its consent screen, so sending a framed
 * window to accounts.google.com produces a blank panel and no explanation.
 * When this page is running in a frame the button opens a real tab instead,
 * and says why. The session cookie is SameSite=None, so once that tab has
 * signed in the embed picks it up on the next load.
 *
 * Whether we are framed cannot be known while rendering on the server and
 * never changes afterwards, so it is read through useSyncExternalStore: that
 * is what keeps the first client render matching the server's instead of
 * setting state from an effect and rendering twice.
 */
const noop = () => () => {};

function framedNow(): boolean {
  // Reading window.top across origins can throw, which is itself the answer.
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export default function SignInButton({ href, label }: { href: string; label: string }) {
  const framed = useSyncExternalStore(noop, framedNow, () => false);

  return (
    <>
      <a
        href={href}
        target={framed ? "_blank" : undefined}
        rel={framed ? "noopener" : undefined}
        className="mt-6 flex w-full items-center justify-center rounded-lg bg-navy-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700"
      >
        {label}
      </a>
      {framed ? (
        <p className="mt-3 text-xs leading-relaxed text-navy-600/70">
          Google will not open inside the Quickbase dashboard, so this opens a new
          tab. Sign in there, then reload this panel.
        </p>
      ) : null}
    </>
  );
}
