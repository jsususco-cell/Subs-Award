"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SIGNED_IN_MESSAGE } from "./SignedInNotice";

/**
 * The "Continue with Google" button, which has to behave differently inside
 * the Quickbase dashboard.
 *
 * Google sets X-Frame-Options on its consent screen, so sending a framed
 * window to accounts.google.com produces a blank panel and no explanation.
 * When this page is running in a frame the button opens a small window
 * instead. That window signs in, lands on /signed-in, tells this frame it is
 * done and closes. The session cookie is SameSite=None, so the frame holds the
 * session too and carries on to where it was going — still inside Quickbase,
 * with no reload by hand.
 *
 * The window's link back to this frame can be cut by Google's pages, so the
 * frame also polls /api/auth/session rather than relying on the message alone.
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

/** The sign-in window always ends on /signed-in, whatever the frame wanted. */
const POPUP_START = "/api/auth/start?next=%2Fsigned-in";
const POLL_MS = 1500;
const POLL_FOR_MS = 10 * 60 * 1000;

const BUTTON =
  "mt-6 flex w-full items-center justify-center rounded-lg bg-navy-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700";

export default function SignInButton({
  href,
  label,
  next,
}: {
  href: string;
  label: string;
  /** Where the frame goes once the session exists. Already sanitised. */
  next: string;
}) {
  const framed = useSyncExternalStore(noop, framedNow, () => false);
  const [waiting, setWaiting] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const done = useRef(false);

  useEffect(() => () => window.clearInterval(timer.current), []);

  useEffect(() => {
    if (!framed) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin === location.origin && e.data === SIGNED_IN_MESSAGE) carryOn();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // carryOn only reads refs and `next`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framed, next]);

  if (!framed) {
    return (
      <a href={href} className={BUTTON}>
        {label}
      </a>
    );
  }

  return (
    <>
      <button type="button" onClick={openWindow} className={BUTTON}>
        {label}
      </button>
      <p className="mt-3 text-xs leading-relaxed text-navy-600/70">
        {waiting
          ? "Finish signing in in the small window. This panel carries on by itself when you are done."
          : "Google will not open inside the Quickbase dashboard, so sign-in opens in a small window, then you come back here."}
      </p>
      {blocked ? (
        <p role="alert" className="mt-2 text-xs leading-relaxed text-brand-red-dark">
          The browser blocked the sign-in window. Allow pop-ups for this page, or{" "}
          <a
            href={POPUP_START}
            target="_blank"
            rel="noopener"
            onClick={() => {
              setBlocked(false);
              watch();
            }}
            className="font-semibold underline"
          >
            open sign-in in a tab
          </a>
          .
        </p>
      ) : null}
    </>
  );

  function openWindow() {
    const w = window.open(POPUP_START, "subs-signin", "popup,width=520,height=680");
    if (!w) {
      setBlocked(true);
      return;
    }
    setBlocked(false);
    watch();
  }

  function watch() {
    setWaiting(true);
    const started = Date.now();
    window.clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      if (Date.now() - started > POLL_FOR_MS) {
        window.clearInterval(timer.current);
        setWaiting(false);
        return;
      }
      fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
        .then((r) => r.json())
        .then((j: { authed?: boolean }) => {
          if (j.authed) carryOn();
        })
        .catch(() => undefined);
    }, POLL_MS);
  }

  function carryOn() {
    if (done.current) return;
    done.current = true;
    window.clearInterval(timer.current);
    window.location.assign(next);
  }
}
