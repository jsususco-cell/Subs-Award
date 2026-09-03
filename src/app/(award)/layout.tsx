import Brand from "@/components/Brand";

/**
 * Chrome for the internal award app.
 *
 * It lives here rather than in the root layout because the subcontractor's
 * Fondo form shares that root: the footer's promise that nothing is uploaded
 * is true of scope files parsed in the browser, and false of a poliza being
 * sent to Quickbase. Keeping it out of the root stops that claim appearing
 * over a page that does upload.
 */
export default function AwardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="no-print border-b-4 border-brand-red bg-navy-700">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <Brand />
          <div className="text-right">
            <h1 className="text-sm leading-tight font-semibold text-white">
              Subcontractor Award System
            </h1>
            <p className="text-xs text-navy-200">Scope extraction &amp; award</p>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="no-print border-t border-navy-100 py-4">
        <p className="mx-auto w-full max-w-7xl px-4 text-xs text-navy-600/60 sm:px-6">
          Scope files are parsed in your browser. Nothing is uploaded or stored on a
          server.
        </p>
      </footer>
    </>
  );
}
