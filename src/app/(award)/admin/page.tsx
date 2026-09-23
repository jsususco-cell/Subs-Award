import type { Metadata } from "next";
import BackToApp from "@/components/BackToApp";
import RosterAdmin from "@/components/RosterAdmin";
import { requireSession } from "@/lib/auth/current-user";
import { AccessUnavailableError, regionAccess } from "@/lib/auth/access";
import { listRoster } from "@/lib/auth/admin";
import { isConfigured } from "@/lib/quickbase";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Region access · Subcontractor Award System",
  robots: { index: false, follow: false },
};

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-navy-800">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-navy-600/80">{children}</p>
        <BackToApp className="mt-4" />
      </div>
    </div>
  );
}

/**
 * The roster screen.
 *
 * Gated on Admin Access, the tick that already grants every region, so the
 * people who can see everything are the people who can hand it out. The page
 * checks as well as the route behind it — this one renders a list of every
 * colleague and what they can reach, which is worth not leaking on its own.
 */
export default async function AdminPage() {
  const session = await requireSession("/admin");

  let grant;
  try {
    grant = (await regionAccess(session.email)).grant;
  } catch (e) {
    if (!(e instanceof AccessUnavailableError)) throw e;
    return (
      <Panel title="Quickbase did not answer">
        The roster could not be read just now, so nothing is shown rather than a
        stale picture of who can reach what. Reload in a moment.
      </Panel>
    );
  }

  if (grant !== "admin") {
    return (
      <Panel title="Not yours to change">
        Changing who sees which region needs Admin Access ticked on your own
        Internal Users record. Ask someone who has it, or set it in Quickbase.
      </Panel>
    );
  }

  if (!isConfigured()) {
    return (
      <Panel title="Quickbase is not configured">
        Without <code className="font-mono text-xs">QB_USER_TOKEN</code> there is no
        roster to read or write.
      </Panel>
    );
  }

  return <RosterAdmin initial={await listRoster()} me={session.email} />;
}
