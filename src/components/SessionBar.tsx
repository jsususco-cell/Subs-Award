import Link from "next/link";
import { currentSession } from "@/lib/auth/current-user";
import { AccessUnavailableError, regionAccess } from "@/lib/auth/access";

/**
 * Who is signed in, and the way out.
 *
 * A plain form rather than a fetch: sign-out has to work even if the page's
 * JavaScript has failed, and POST is what stops any image tag on any site from
 * signing somebody out.
 */
export default async function SessionBar() {
  const session = await currentSession();
  if (!session) return null;

  // Best effort. The roster being unreachable must not take down the header
  // of every page; the link is a convenience, and the screen behind it checks
  // for itself anyway.
  let admin = false;
  try {
    admin = (await regionAccess(session.email)).grant === "admin";
  } catch (e) {
    if (!(e instanceof AccessUnavailableError)) throw e;
  }

  return (
    <div className="flex items-center gap-3 text-xs text-navy-200">
      {admin ? (
        <Link
          href="/admin"
          className="rounded-md border border-navy-400/60 px-2.5 py-1 font-medium text-navy-100 transition hover:bg-navy-600 hover:text-white"
        >
          Region access
        </Link>
      ) : null}
      <span className="hidden sm:inline" title={session.email}>
        {session.email}
      </span>
      <form action="/api/auth/signout" method="post">
        <button
          type="submit"
          className="rounded-md border border-navy-400/60 px-2.5 py-1 font-medium text-navy-100 transition hover:bg-navy-600 hover:text-white"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
