/**
 * The regions this system awards in.
 *
 * Byrdson works Puerto Rico and four mainland states, and almost everything
 * that differs between them is data rather than logic: which jobs and vendors
 * are in scope, which award letter is sent, which payment schedule the letter
 * and the billing lines follow, whether a Fondo poliza is owed, and which
 * account the cost lands on.
 *
 * This file is the single source of truth for those differences. It is
 * imported by client components as well as the server, so it must stay free of
 * `process.env` reads — anything not prefixed NEXT_PUBLIC_ is undefined in the
 * browser, and a value that differs between render passes is worse than a
 * literal that is merely out of date.
 *
 * Adding a state means adding an entry here, not editing the components.
 */

export type RegionKey = "PR" | "FL" | "NC" | "TX" | "LA";

/** Award letter wording. A region with no template cannot produce a letter. */
export type LetterTemplateKey = "pr-es" | "us-en";

/** Payment milestone set. A region with none has no breakdown and no bills. */
export type ScheduleSetKey = "pr" | "us";

/** What the subcontractor owes after being awarded. */
export type InsuranceKind = "fondo" | "none";

/**
 * How an award can be started in a region.
 *
 * - `canopy` — upload the scope export and derive the award from it.
 * - `award-po` — no scope file; the award breakdown is entered directly.
 * - `bill-po` — draw bills against a purchase order that already exists.
 */
export type AwardRoute = "canopy" | "award-po" | "bill-po" | "vendor-status";

/**
 * How the money is entered on an award.
 *
 * - `categories` — Puerto Rico. The Award Breakdown's seven cost categories,
 *   which Quickbase sums into Total Amount (262), and a fixed milestone
 *   schedule that becomes Billing Line Items.
 * - `contract` — the mainland. One Total Contract Price, broken down by hand
 *   into PO line items (Cost Items). The breakdown need not consume the whole
 *   contract at once; the balance can be broken down later.
 */
export type AwardEntry = "categories" | "contract";

export interface RegionConfig {
  key: RegionKey;
  /** How the region is named on screen. */
  label: string;
  /**
   * The exact value stored in Jobs fid 11, which is the State/Region child of
   * the composite address field. Confirmed against the live table: Puerto Rico
   * 403, Florida 252, North Carolina 170, Texas 73, Louisiana 9.
   */
  jobRegion: string;
  /**
   * Values of Subs/Vendors fid 206 that count as in region. That field is a
   * coarse bucket — its choices are Puerto Rico, Mainland, Both and No work on
   * file — so every mainland state currently matches the same vendors.
   *
   * "Both" belongs to each side: a vendor working Puerto Rico *and* the
   * mainland is in scope for both, and matching the primary value alone
   * silently drops them.
   */
  vendorRegions: string[];
  /**
   * The award letter. null means no template exists for this region yet, and
   * letter generation is refused rather than falling back to another region's
   * wording — the Puerto Rico letter is in Spanish and its twenty conditions
   * cite CFSE, OGPe, PRDOH and CDBG-DR, none of which bind a Florida
   * subcontractor.
   */
  letter: LetterTemplateKey | null;
  /**
   * The Desglose de Pagos milestones, which also drive the Billing Line Items
   * created against the purchase order. null means neither is available.
   */
  schedule: ScheduleSetKey | null;
  /**
   * Fondo (CFSE) is the Puerto Rico state insurance fund and has no mainland
   * equivalent, so mainland awards open no insurance submittal.
   */
  insurance: InsuranceKind;
  /**
   * The QuickBooks location whose chart of accounts this region posts to.
   *
   * The account itself is looked up at write time rather than pinned here:
   * the active "Subcontractors" account for this location. See
   * src/lib/qb-accounts.ts for why — the chart of accounts moves, and this
   * app spent a while posting Puerto Rico cost to an account that had been
   * deactivated.
   */
  qboLocation: "US" | "PR";
  /**
   * Prefilled "Programa" on the award letter. Empty where the programme is not
   * known for the region — an empty field a user fills in is better than a
   * plausible wrong one carried over from Puerto Rico.
   */
  defaultProgram: string;
  /**
   * The ways an award can be started here, in the order they are offered. The
   * first is the default. A route left out is not shown at all rather than
   * shown and disabled — there is nothing to fix, it simply is not how work
   * arrives in that region.
   */
  routes: AwardRoute[];
  /** How the money is entered — see AwardEntry. */
  awardEntry: AwardEntry;
  /**
   * Whether the subcontractor list is restricted to vendors ticked "Eligible
   * for Award" (fid 182).
   *
   * True for Puerto Rico, where 20 vendors are marked and the list is the
   * approved bench. False on the mainland, where only 2 are marked — and both
   * only qualify through Region "Both" — so the filter left almost nobody to
   * award to. Until that field is maintained for mainland vendors, the list is
   * every subcontractor in the region instead of a bench of two.
   *
   * The region filter still applies either way: a Florida screen never offers
   * a Puerto Rico vendor.
   */
  awardEligibleOnly: boolean;
  /**
   * Whether the subcontractor is sent the purchase order itself, as well as
   * the award letter.
   *
   * A mainland practice: the PO document carries the line items and the
   * acceptance block the subcontractor signs, and it is what Byrdson already
   * sends out of Quickbase there. Puerto Rico awards go out on the Spanish
   * award letter alone, and the PO document has no Spanish version — turning
   * this on for PR would mail an English contract document to a subcontractor
   * whose letter is deliberately not in English.
   */
  poDocument: boolean;
}

/**
 * Everything the mainland states share. They are generated from one object
 * rather than written out four times, so they cannot drift apart while they
 * are still identical — and a state that later needs its own letter or account
 * overrides just that key.
 */
const MAINLAND = {
  vendorRegions: ["Mainland", "Both"],
  /*
   * The English letter, translated from the Puerto Rico one. Three of its
   * twenty conditions could not be translated literally because they bind the
   * subcontractor to Puerto Rico institutions — see US_CONDITIONS in
   * src/lib/letter-content.ts for what replaced them.
   */
  letter: "us-en",
  schedule: "us",
  insurance: "none",
  qboLocation: "US",
  defaultProgram: "",
  /*
   * No Canopy upload on the mainland. Scope exports come out of the Puerto
   * Rico estimating pipeline; mainland awards are raised straight against a
   * purchase order, so offering an upload step would be offering a route that
   * never has a file to feed it.
   */
  routes: ["award-po", "bill-po", "vendor-status"],
  awardEntry: "contract",
  awardEligibleOnly: false,
  poDocument: true,
} satisfies Omit<RegionConfig, "key" | "label" | "jobRegion">;

function mainland(key: RegionKey, label: string): RegionConfig {
  return { key, label, jobRegion: label, ...MAINLAND };
}

export const REGIONS: Record<RegionKey, RegionConfig> = {
  PR: {
    key: "PR",
    label: "Puerto Rico",
    jobRegion: "Puerto Rico",
    vendorRegions: ["Puerto Rico", "Both"],
    letter: "pr-es",
    schedule: "pr",
    insurance: "fondo",
    qboLocation: "PR",
    defaultProgram: "PR R3",
    routes: ["canopy", "award-po", "bill-po"],
    awardEntry: "categories",
    awardEligibleOnly: true,
    poDocument: false,
  },
  FL: mainland("FL", "Florida"),
  NC: mainland("NC", "North Carolina"),
  TX: mainland("TX", "Texas"),
  LA: mainland("LA", "Louisiana"),
};

/** Display order — by how much work is on the books, largest first. */
export const REGION_KEYS: RegionKey[] = ["PR", "FL", "NC", "TX", "LA"];

/** Puerto Rico is where this system started and where every saved award is. */
export const DEFAULT_REGION: RegionKey = "PR";

/** Does this region enter one contract figure and break it down by hand? */
export function isContractEntry(region: RegionConfig): boolean {
  return region.awardEntry === "contract";
}

/** Can an award be started this way here? */
export function allowsRoute(region: RegionConfig, route: AwardRoute): boolean {
  return region.routes.includes(route);
}

/** The route a region opens on — the first it offers. */
export function defaultRoute(region: RegionConfig): AwardRoute {
  return region.routes[0];
}

/**
 * The route to use after a change of region: the current one where the new
 * region offers it, otherwise that region's default. Keeps someone who is
 * raising purchase orders on that step when they switch states, and moves
 * them off a route the new region does not have.
 */
export function routeFor(
  region: RegionConfig,
  current: AwardRoute,
): AwardRoute {
  return allowsRoute(region, current) ? current : defaultRoute(region);
}

export function isRegionKey(value: unknown): value is RegionKey {
  return typeof value === "string" && value in REGIONS;
}

/** Resolve a key, falling back to the default rather than throwing. */
export function regionFor(value: unknown): RegionConfig {
  return REGIONS[isRegionKey(value) ? value : DEFAULT_REGION];
}

/*
 * There are deliberately no hasLetter/hasSchedule helpers here. Whether a
 * letter can be produced is `canRenderLetter` in letter.ts, which checks the
 * template actually exists rather than just the key; whether milestones exist
 * is `scheduleSetFor` in schedule.ts, which returns the set the caller needs
 * anyway. Two ways to ask the same question is how they come to disagree.
 */

/**
 * What a region is still missing, for the UI to show in place of a disabled
 * control. Empty when the region is fully set up.
 */
export function missingSetup(region: RegionConfig): string[] {
  const missing: string[] = [];
  if (!region.letter) {
    missing.push(`an award letter template for ${region.label}`);
  }
  if (!region.schedule) {
    missing.push(`a payment schedule for ${region.label}`);
  }
  /*
   * The cost account is deliberately not checked here. It is resolved from
   * Quickbase at write time, so whether one exists is not something the
   * browser can know — the award route checks it before its first write and
   * reports what it found.
   */
  return missing;
}
