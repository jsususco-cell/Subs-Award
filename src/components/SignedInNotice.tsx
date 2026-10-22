"use client";

import { useEffect } from "react";

/** The message the framed sign-in page listens for. */
export const SIGNED_IN_MESSAGE = "subs-signed-in";

/**
 * Tells the Quickbase frame that opened this window that sign-in is done, then
 * closes the window. If the browser will not let it close (or the link back to
 * the frame was cut along the way), the text says what to do instead; the
 * frame is polling the session as well, so it carries on either way.
 */
export default function SignedInNotice() {
  useEffect(() => {
    try {
      window.opener?.postMessage(SIGNED_IN_MESSAGE, location.origin);
    } catch {
      // The opener may be gone or on another origin by now.
    }
    const t = window.setTimeout(() => window.close(), 600);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <p className="mt-1 text-sm leading-relaxed text-navy-600/80">
      You are signed in. Close this window and go back to Quickbase.
    </p>
  );
}
