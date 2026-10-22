"use client";

/**
 * Sign out. Still a plain POST form, so it works if the page's JavaScript has
 * failed. But inside the Quickbase dashboard the frame is sandboxed without
 * allow-forms, so a submit never fires there; a click still does. The click
 * handler sends the same POST itself and then goes to the login page.
 */
export default function SignOutButton({ className }: { className: string }) {
  return (
    <form action="/api/auth/signout" method="post">
      <button
        type="submit"
        className={className}
        onClick={(e) => {
          e.preventDefault();
          fetch("/api/auth/signout", { method: "POST", credentials: "same-origin", redirect: "manual" })
            .catch(() => undefined)
            // A full load, not router.push: the signed-in header is server-rendered.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            .finally(() => window.location.assign("/login"));
        }}
      >
        Sign out
      </button>
    </form>
  );
}
