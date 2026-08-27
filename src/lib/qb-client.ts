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
  region?: string;
}

// One in-flight request per resource, shared across every combobox on the page.
const inflight = new Map<string, Promise<Lookup<unknown>>>();

async function load<T>(resource: "jobs" | "subs"): Promise<Lookup<T>> {
  const existing = inflight.get(resource);
  if (existing) return existing as Promise<Lookup<T>>;

  const promise = (async (): Promise<Lookup<unknown>> => {
    try {
      const res = await fetch(`/api/qb?resource=${resource}`);
      const body = await res.json();
      if (!body.ok) {
        inflight.delete(resource);
        return {
          configured: Boolean(body.configured),
          items: [],
          error: body.error ?? "Could not reach Quickbase.",
        };
      }
      if (!body.configured) {
        // The token may be added without redeploying the browser tab.
        inflight.delete(resource);
      }
      return {
        configured: Boolean(body.configured),
        items: body.items ?? [],
        warning: body.warning,
        region: body.region,
      };
    } catch {
      // A failed lookup must never block the letter — the fields stay typable.
      inflight.delete(resource);
      return { configured: false, items: [], error: "Could not reach Quickbase." };
    }
  })();

  inflight.set(resource, promise);
  return promise as Promise<Lookup<T>>;
}

export function loadJobs(): Promise<Lookup<JobOption>> {
  return load<JobOption>("jobs");
}

export function loadSubs(): Promise<Lookup<SubOption>> {
  return load<SubOption>("subs");
}

/** Drop the cached lookups so the next open refetches. */
export function refreshLookups(): void {
  inflight.clear();
}
