import { NextResponse } from "next/server";
import { fetchJobs, fetchSubs, isConfigured } from "@/lib/quickbase";
import { regionFor } from "@/lib/regions";

export const dynamic = "force-dynamic";

/**
 * A read-only proxy so the Quickbase token stays on the server.
 *
 * This endpoint is only as private as the deployment. On a public Vercel
 * project it exposes the job and vendor lists to anyone with the URL, so turn
 * on Vercel Deployment Protection before setting QB_USER_TOKEN in production.
 */

interface Cached {
  at: number;
  payload: unknown;
}

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, Cached>();

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const resource = params.get("resource");
  /*
   * An unknown region resolves to the default rather than erroring: the region
   * only ever narrows a query, so the worst case is the wrong list, and the
   * response says which region it answered for so the caller can tell.
   */
  const region = regionFor(params.get("region"));

  if (resource !== "jobs" && resource !== "subs") {
    return NextResponse.json(
      { ok: false, error: "resource must be 'jobs' or 'subs'" },
      { status: 400 },
    );
  }

  // Without a token the app falls back to typing the details by hand, so this
  // is a normal state rather than an error.
  if (!isConfigured()) {
    return NextResponse.json({ ok: true, configured: false, items: [] });
  }

  // Cached per region: the Florida job list is not the Puerto Rico one.
  const cacheKey = `${resource}:${region.key}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json(hit.payload);
  }

  try {
    const { items, warning } =
      resource === "jobs" ? await fetchJobs(region) : await fetchSubs(region);

    const payload = {
      ok: true,
      configured: true,
      region: region.key,
      regionLabel: region.label,
      items,
      ...(warning ? { warning } : {}),
    };
    cache.set(cacheKey, { at: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Quickbase request failed";
    console.error("[qb]", message);
    return NextResponse.json(
      { ok: false, configured: true, error: message, items: [] },
      { status: 502 },
    );
  }
}
