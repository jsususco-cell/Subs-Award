import Link from "next/link";

/**
 * The way back from a side screen.
 *
 * Its own component because the roster screen has four different endings —
 * the table, "not yours to change", "Quickbase did not answer", and the
 * unconfigured panel — and the one that strands somebody is always the one
 * you forgot to put it on.
 */
export default function BackToApp({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-1.5 text-xs font-medium text-navy-600 transition hover:text-navy-800 ${className}`}
    >
      <span aria-hidden>&larr;</span> Back to the award app
    </Link>
  );
}
