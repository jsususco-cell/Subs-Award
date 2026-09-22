import { currentSession } from "@/lib/auth/current-user";

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

  return (
    <div className="flex items-center gap-3 text-xs text-navy-200">
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
