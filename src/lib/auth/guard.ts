import "server-only";
import { NextResponse } from "next/server";
import { sendKey, sendKeyMatches } from "@/lib/mail";
import { jobRegionKey, poRegionKey } from "@/lib/quickbase";
import { isRegionKey, regionFor, type RegionKey } from "@/lib/regions";
import { currentSession } from "./current-user";
import { AccessUnavailableError, regionAccess } from "./access";
import { allows } from "./roster";

/**
 * The region check the API routes share.
 *
 * `proxy.ts` decides whether a request gets in at all. This decides whether
 * the person it let in may act on the region they named — the part the browser
 * cannot be trusted with, because a region arrives in a query string or a JSON
 * body and is trivially changed.
 *
 * The session wins wherever there is one, and the send key does not override
 * it. That distinction matters: most of these routes already require the key
 * and the *browser* sends it, typed by the person using the app, so treating a
 * valid key as permission would quietly void this whole check. The key is a
 * second lock on the door, not a second identity.
 *
 * Only a caller with no session at all is treated as a machine — n8n and the
 * scripts — and it has no regions because there is nobody whose regions it
 * could mean. It still had to present the key to get past the proxy.
 */
export async function refuseRegion(
  request: Request,
  candidate: unknown,
): Promise<NextResponse | null> {
  const session = await currentSession();

  if (!session) {
    return sendKey() && sendKeyMatches(request.headers.get("x-send-key") ?? "")
      ? null
      : NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  if (!isRegionKey(candidate)) {
    return NextResponse.json(
      { ok: false, error: "A valid region is required." },
      { status: 400 },
    );
  }
  const region = candidate as RegionKey;

  let access;
  try {
    access = await regionAccess(session.email);
  } catch (e) {
    if (e instanceof AccessUnavailableError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 503 });
    }
    throw e;
  }

  if (!allows(access, region)) {
    return NextResponse.json(
      {
        ok: false,
        error: access.regions.length
          ? `Your Quickbase record does not cover ${regionFor(region).label}. You work in ${access.regions
              .map((k) => regionFor(k).label)
              .join(", ")}.`
          : "Your Quickbase record lists no region this system awards in, so there is nothing you can act on here.",
      },
      { status: 403 },
    );
  }
  return null;
}

/**
 * The same check for a route addressed by a record rather than by a region.
 *
 * The attachment list takes a job record id; the line items and bills take a
 * purchase order id. Without this a coordinator scoped to Florida could read
 * what belongs to a Puerto Rico case by changing a number in the URL — the
 * region they send alongside is never used to find those records.
 *
 * A record whose state is not one this system awards in is refused rather
 * than allowed: it is outside every region, so it is inside nobody's.
 */
async function refuseByRecord(
  request: Request,
  recordId: number,
  lookup: (id: number) => Promise<RegionKey | null>,
  noun: string,
): Promise<NextResponse | null> {
  const session = await currentSession();
  if (!session) {
    return sendKey() && sendKeyMatches(request.headers.get("x-send-key") ?? "")
      ? null
      : NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  let region: RegionKey | null;
  try {
    region = await lookup(recordId);
  } catch (e) {
    console.error("[guard] region lookup failed:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { ok: false, error: `That ${noun}'s region could not be checked just now.` },
      { status: 502 },
    );
  }

  if (!region) {
    return NextResponse.json(
      { ok: false, error: `That ${noun} is not in a region this system awards in.` },
      { status: 404 },
    );
  }
  return refuseRegion(request, region);
}

export function refuseJob(request: Request, jobRecordId: number) {
  return refuseByRecord(request, jobRecordId, jobRegionKey, "job");
}

export function refusePo(request: Request, poRecordId: number) {
  return refuseByRecord(request, poRecordId, poRegionKey, "purchase order");
}
