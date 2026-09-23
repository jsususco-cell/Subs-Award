import assert from "node:assert/strict";
import { test } from "node:test";

import { accessFrom, allows, parseRosterRegions } from "./roster";
import { REGION_KEYS } from "../regions";

/*
 * The strings below are the live values from Internal Users (buskqh27r) field
 * 126, not invented ones. Testing against what the table actually holds is the
 * whole point: a parser that satisfies a convention I imagined would pass
 * while being wrong about the data.
 */

test("the roster's own region strings parse", () => {
  assert.deepEqual(parseRosterRegions("PR"), ["PR"]);
  assert.deepEqual(parseRosterRegions("FL"), ["FL"]);
  assert.deepEqual(parseRosterRegions("TX"), ["TX"]);
  assert.deepEqual(parseRosterRegions("NC"), ["NC"]);
  assert.deepEqual(parseRosterRegions("FL, NC"), ["FL", "NC"]);
  assert.deepEqual(parseRosterRegions("FL, TX"), ["FL", "TX"]);
  // Returned in the app's display order, not the order the field lists them.
  assert.deepEqual(parseRosterRegions("FL, TX, NC"), ["FL", "NC", "TX"]);
});

test("a state the roster tracks and this app does not is dropped, not refused", () => {
  // "VA" is on inactive records. It is a fact about the business, not a
  // broken value, so it parses to nothing rather than throwing.
  assert.deepEqual(parseRosterRegions("VA"), []);
  assert.deepEqual(parseRosterRegions("FL, VA"), ["FL"]);
});

test("junk and absence parse to nothing rather than throwing", () => {
  assert.deepEqual(parseRosterRegions(""), []);
  assert.deepEqual(parseRosterRegions("   "), []);
  assert.deepEqual(parseRosterRegions(null), []);
  assert.deepEqual(parseRosterRegions(undefined), []);
  assert.deepEqual(parseRosterRegions(126), []);
  assert.deepEqual(parseRosterRegions(["PR"]), []);
});

test("a blank region means head office, which is every region", () => {
  // The 18 active records with no region are the CEO, the Owner, the VP of
  // Operations, the Financial Controller, finance and IT. Scoping them to
  // nothing would lock out exactly the people who need every region.
  const access = accessFrom({ region: "", active: true, name: "A Byrd" });
  assert.deepEqual(access.regions, REGION_KEYS);
  assert.equal(access.grant, "head-office");
  assert.equal(access.linked, true);
});

test("a named region scopes, and does not leak the others", () => {
  const pr = accessFrom({ region: "PR", active: true });
  assert.deepEqual(pr.regions, ["PR"]);
  assert.equal(pr.grant, "states");
  assert.equal(allows(pr, "PR"), true);
  assert.equal(allows(pr, "FL"), false);

  const mainland = accessFrom({ region: "FL, TX, NC", active: true });
  assert.equal(allows(mainland, "PR"), false);
  assert.equal(allows(mainland, "TX"), true);
  // Louisiana is in the app but on nobody's record, so holding three mainland
  // states does not imply it.
  assert.equal(allows(mainland, "LA"), false);
});

test("a record naming only an unknown state gets nothing, not everything", () => {
  // The dangerous case: "VA" parses to no regions, and treating that like a
  // blank would hand a Virginia-only record every region in the system.
  const va = accessFrom({ region: "VA", active: true });
  assert.deepEqual(va.regions, []);
  assert.equal(va.grant, "none");
  assert.equal(va.linked, true);
});

test("no record and an inactive record are both refused, and are distinguishable", () => {
  const missing = accessFrom(null);
  assert.deepEqual(missing.regions, []);
  assert.equal(missing.linked, false);
  assert.equal(missing.inactive, false);

  // An inactive record must not fall through to the blank-means-everything
  // rule just because its region happens to be empty.
  const gone = accessFrom({ region: "", active: false });
  assert.deepEqual(gone.regions, []);
  assert.equal(gone.inactive, true);

  const goneScoped = accessFrom({ region: "PR", active: false });
  assert.deepEqual(goneScoped.regions, []);
});

test("HQ means head office, not an unknown state", () => {
  /*
   * "HQ" is one of the Region field's offered choices and no record uses it
   * yet. That is the trap: it is the obvious thing to pick for a head-office
   * record, and parsing it as a state would drop it to nothing and lock the
   * person out on the day somebody chose it.
   */
  const hq = accessFrom({ region: "HQ", active: true });
  assert.deepEqual(hq.regions, REGION_KEYS);
  assert.equal(hq.grant, "head-office");

  // The wider claim wins where both are written down.
  const both = accessFrom({ region: "HQ, PR", active: true });
  assert.deepEqual(both.regions, REGION_KEYS);
  assert.equal(allows(both, "FL"), true);

  // Still nothing for somebody who has left.
  assert.deepEqual(accessFrom({ region: "HQ", active: false }).regions, []);
});

test("Admin Access grants every region, and outranks the Region field", () => {
  /*
   * The roster's own convention: six of the seven active administrators have
   * no region at all. The seventh is a Process Improvement Specialist whose
   * record says "PR", which scoped him to Puerto Rico while his colleague on
   * the same job saw everything. The tick is what says "not confined to one
   * state", so it is what decides.
   */
  const admin = accessFrom({ region: "PR", active: true, adminAccess: true });
  assert.deepEqual(admin.regions, REGION_KEYS);
  assert.equal(admin.grant, "admin");
  assert.equal(allows(admin, "FL"), true);

  // Even a region this app does not award in cannot narrow an administrator.
  const odd = accessFrom({ region: "VA", active: true, adminAccess: true });
  assert.deepEqual(odd.regions, REGION_KEYS);

  // Absent and false both mean "not an administrator" — an undefined flag
  // must not read as truthy and quietly widen somebody.
  assert.equal(accessFrom({ region: "PR", active: true }).grant, "states");
  assert.equal(
    accessFrom({ region: "PR", active: true, adminAccess: false }).grant,
    "states",
  );
});

test("a leaver keeps nothing, however many boxes are ticked", () => {
  // Admin Access is not cleared when somebody leaves, so Active has to be
  // read first. An inactive administrator holding every region is the one
  // outcome this must never produce.
  const gone = accessFrom({ region: "PR", active: false, adminAccess: true });
  assert.deepEqual(gone.regions, []);
  assert.equal(gone.grant, "none");
  assert.equal(gone.inactive, true);
});
