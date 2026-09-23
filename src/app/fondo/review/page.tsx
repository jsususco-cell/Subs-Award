import type { Metadata } from "next";
import FondoReview from "@/components/FondoReview";
import { fondoConfigured, missingFondoFields } from "@/lib/fondo";
import { reviewQueue } from "@/lib/fondo-server";
import { requireSession } from "@/lib/auth/current-user";
import { AccessUnavailableError, regionAccess } from "@/lib/auth/access";
import { allows } from "@/lib/auth/roster";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fondo polizas to review",
  robots: { index: false, follow: false },
};

/**
 * The reviewer's queue.
 *
 * Listing is open; acting is not — approve and return go through an endpoint
 * that requires the send key, so the page can render for whoever opens it
 * while decisions stay gated.
 */
export default async function ReviewPage() {
  const session = await requireSession("/fondo/review");

  /*
   * Fondo is the Puerto Rico state insurance fund, so this queue is Puerto
   * Rico work. These are other companies' insurance certificates; somebody
   * who works Florida has no reason to be reading them.
   */
  let covered: boolean;
  try {
    covered = allows(await regionAccess(session.email), "PR");
  } catch (e) {
    if (!(e instanceof AccessUnavailableError)) throw e;
    covered = false;
  }

  if (!covered) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-navy-800">
            Not your queue
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-navy-600/80">
            Fondo polizas are Puerto Rico, and your Quickbase record does not
            cover it.
          </p>
        </div>
      </div>
    );
  }

  if (!fondoConfigured()) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-navy-800">Not set up yet</h1>
          <p className="mt-2 text-sm leading-relaxed text-navy-600/80">
            The Fondo submittal fields do not exist in Quickbase yet, so there is
            nothing to review. Missing: {missingFondoFields().join(", ")}.
          </p>
        </div>
      </div>
    );
  }

  const items = await reviewQueue();
  return <FondoReview items={items} />;
}
