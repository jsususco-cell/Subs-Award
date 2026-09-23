import type { RegionAccess } from "@/lib/auth/roster";

/**
 * What somebody sees when the roster gives them nothing to work on.
 *
 * Three different reasons, three different answers. "Ask IT" is useless if the
 * real problem is that the record says Virginia, and "you have left" is not
 * something to send a new starter.
 */
export default function NoRegions({
  email,
  access,
}: {
  email: string;
  access: RegionAccess;
}) {
  const reason = access.inactive
    ? "Your Quickbase Internal Users record is marked inactive, so it grants no regions."
    : access.linked
      ? "Your Quickbase Internal Users record names a region this system does not award in."
      : "There is no active Quickbase Internal Users record for your address, and that record is what says which regions you work in.";

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-navy-800">
          Nothing is assigned to you here
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-navy-600/80">{reason}</p>
        <p className="mt-3 text-sm leading-relaxed text-navy-600/80">
          Ask whoever maintains Internal Users to set the Region on your record —{" "}
          <span className="font-mono text-xs">{email}</span> — to the states you
          work in. The change shows up here within five minutes.
        </p>
      </div>
    </div>
  );
}
