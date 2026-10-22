import type { Metadata } from "next";
import Brand from "@/components/Brand";
import SignedInNotice from "@/components/SignedInNotice";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Signed in · Subcontractor Award System",
  robots: { index: false, follow: false },
};

/**
 * Where the small sign-in window lands when sign-in was started from inside
 * the Quickbase frame. Public on purpose (see proxy.ts): it shows nothing
 * about anyone, and it has to render even if the cookie has not taken.
 */
export default function SignedInPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b-4 border-brand-red bg-navy-700">
        <div className="mx-auto flex w-full max-w-md items-center px-4 py-3.5">
          <Brand />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm rounded-xl border border-navy-100 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-navy-800">You are signed in</h1>
          <SignedInNotice />
        </div>
      </main>
    </div>
  );
}
