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
   * The QB Line Item the cost item and billing lines post to.
   *
   * null means accounting has not said which account mainland work belongs to.
   * The QB Line Items table holds #181 "Subcontractors", #182 "Subcontractors
   * - Puerto Rico" and #233, also called "Subcontractors" — so the choice is
   * genuinely ambiguous and guessing would put costs on the wrong account.
   * Cost Items has a data rule rejecting a record with no QB line item, so a
   * guess would not even fail quietly; it would fail after the PO was written.
   */
  qbLineItem: { id: number; label: string } | null;
  /**
   * Prefilled "Programa" on the award letter. Empty where the programme is not
   * known for the region — an empty field a user fills in is better than a
   * plausible wrong one carried over from Puerto Rico.
   */
  defaultProgram: string;
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
  qbLineItem: null,
  defaultProgram: "",
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
    qbLineItem: { id: 182, label: "Subcontractors - Puerto Rico" },
    defaultProgram: "PR R3",
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
  if (!region.qbLineItem) {
    missing.push("the QB Line Item account mainland cost posts to");
  }
  return missing;
}
