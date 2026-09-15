import type { RegionKey } from "./regions";

export interface JobOption {
  id: string;
  name: string;
  address: string;
  jobType: string;
}

export interface SubOption {
  id: string;
  company: string;
  trade: string;
  email: string;
}

export interface Lookup<T> {
  configured: boolean;
  items: T[];
  warning?: string;
  error?: string;
  region?: RegionKey;
  regionLabel?: string;
}

/*
 * One in-flight request per resource *and region*, shared across every combobox
 * on the page. Keying on the resource alone would hand the Florida job list the
 * Puerto Rico request that was already running.
 */
const inflight = new Map<string, Promise<Lookup<unknown>>>();

async function load<T>(
  resource: "jobs" | "subs",
  region: RegionKey,
): Promise<Lookup<T>> {
  const key = `${resource}:${region}`;
  const existing = inflight.get(key);
  if (existing) return existing as Promise<Lookup<T>>;

  const promise = (async (): Promise<Lookup<unknown>> => {
    try {
      const res = await fetch(
        `/api/qb?resource=${resource}&region=${encodeURIComponent(region)}`,
      );
      const body = await res.json();
      if (!body.ok) {
        inflight.delete(key);
        return {
          configured: Boolean(body.configured),
          items: [],
          error: body.error ?? "Could not reach Quickbase.",
        };
      }
      if (!body.configured) {
        // The token may be added without redeploying the browser tab.
        inflight.delete(key);
      }
      return {
        configured: Boolean(body.configured),
        items: body.items ?? [],
        warning: body.warning,
        region: body.region,
        regionLabel: body.regionLabel,
      };
    } catch {
      // A failed lookup must never block the letter — the fields stay typable.
      inflight.delete(key);
      return { configured: false, items: [], error: "Could not reach Quickbase." };
    }
  })();

  inflight.set(key, promise);
  return promise as Promise<Lookup<unknown>> as Promise<Lookup<T>>;
}

export function loadJobs(region: RegionKey): Promise<Lookup<JobOption>> {
  return load<JobOption>("jobs", region);
}

export function loadSubs(region: RegionKey): Promise<Lookup<SubOption>> {
  return load<SubOption>("subs", region);
}

/** Drop the cached lookups so the next open refetches. */
export function refreshLookups(): void {
  inflight.clear();
}
