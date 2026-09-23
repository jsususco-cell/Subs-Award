import AwardApp from "@/components/AwardApp";
import NoRegions from "@/components/NoRegions";
import { requireSession } from "@/lib/auth/current-user";
import { AccessUnavailableError, regionAccess } from "@/lib/auth/access";
import { NO_ACCESS, type RegionAccess } from "@/lib/auth/roster";

export const dynamic = "force-dynamic";

/**
 * The region scope is resolved here, on the server, and handed to the client
 * as the list it may choose from.
 *
 * Sending the whole list and hiding some of it would be theatre — the routes
 * enforce this independently — but it is also the difference between a picker
 * that reflects somebody's job and one that offers four states they will be
 * refused on.
 */
export default async function Home() {
  const session = await requireSession();

  let access: RegionAccess;
  let unavailable = false;
  try {
    access = await regionAccess(session.email);
  } catch (e) {
    if (!(e instanceof AccessUnavailableError)) throw e;
    access = NO_ACCESS;
    unavailable = true;
  }

  if (unavailable) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-navy-800">
            Your regions could not be checked
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-navy-600/80">
            Quickbase did not answer, so nothing is shown rather than the wrong
            thing. Reload in a moment.
          </p>
        </div>
      </div>
    );
  }

  if (access.regions.length === 0) {
    return <NoRegions email={session.email} access={access} />;
  }

  return <AwardApp allowed={access.regions} unscoped={access.unscoped} />;
}
