"use client";

import { useState } from "react";

const LOGO =
  "https://byrdsonservices.com/wp-content/uploads/2013/10/cropped-cropped-cropped-cropped-ByrdsonServicesLogoHort2.png";

/**
 * The Byrdson wordmark. The hosted logo is the same asset the award letter
 * template uses; if it fails to load we fall back to a typographic lockup so
 * the header never collapses.
 */
export default function Brand() {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className="flex items-center gap-2.5">
        <span aria-hidden className="h-7 w-1 rounded-full bg-brand-red" />
        <span className="text-base font-bold tracking-tight text-white">
          BYRDSON <span className="font-light text-navy-200">SERVICES</span>
        </span>
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external brand asset, no loader needed
    <img
      src={LOGO}
      alt="Byrdson Services"
      width={180}
      height={34}
      onError={() => setFailed(true)}
      className="h-8 w-auto brightness-0 invert"
    />
  );
}
