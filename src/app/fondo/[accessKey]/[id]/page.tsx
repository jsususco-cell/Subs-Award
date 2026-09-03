import type { Metadata } from "next";
import FondoForm from "@/components/FondoForm";
import { fondoConfigured } from "@/lib/fondo";
import { caseForVendor, vendorForKey } from "@/lib/fondo-server";

export const dynamic = "force-dynamic";

/**
 * The subcontractor's Fondo poliza form.
 *
 * Reached with the vendor's AccessKey and their own case id. Anything that
 * does not resolve to both shows the same message, so the page cannot be used
 * to work out which case ids exist.
 */
export const metadata: Metadata = {
  title: "Póliza del Fondo (CFSE)",
  robots: { index: false, follow: false },
};

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-navy-800">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-navy-600/80">{body}</p>
      </div>
    </div>
  );
}

export default async function FondoPage({
  params,
}: {
  params: Promise<{ accessKey: string; id: string }>;
}) {
  const { accessKey, id } = await params;

  if (!fondoConfigured()) {
    return (
      <Notice
        title="Not ready yet"
        body="This form is not switched on yet. Nothing you do here would be saved, so please wait for Byrdson to send the link again."
      />
    );
  }

  const vendor = await vendorForKey(accessKey);
  const found = vendor ? await caseForVendor(vendor, Number(id) || 0) : null;

  if (!vendor || !found) {
    return (
      <Notice
        title="This link is not valid"
        body="It may have been mistyped, or it may belong to a different case. Ask your contact at Byrdson to send it again."
      />
    );
  }

  return <FondoForm accessKey={accessKey} initial={found} />;
}
