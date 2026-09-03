import Brand from "@/components/Brand";

/**
 * Chrome for the subcontractor-facing pages.
 *
 * Byrdson branding without the internal wording, and no claim about uploads:
 * the poliza sent from here IS stored, so the award app's footer would be a
 * false statement to the person uploading it.
 */
export default function FondoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b-4 border-brand-red bg-navy-700">
        <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-4 px-4 py-3.5">
          <Brand />
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-navy-100 py-4">
        <p className="mx-auto w-full max-w-xl px-4 text-xs text-navy-600/60">
          Byrdson Services. La póliza que envíe se guarda en los expedientes de
          Byrdson para este caso.
        </p>
      </footer>
    </>
  );
}
