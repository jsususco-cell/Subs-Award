import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ATTACHMENT_CATEGORIES,
  attachmentProblem,
  humanSize,
  MAX_ATTACHMENT_BYTES,
  tooBig,
} from "./attachments";
import { REGIONS } from "./regions";

const ok = { jobRecordId: 1885, fileName: "invoice.pdf", bytes: 120_000 };

test("a file needs a job to hang off", () => {
  /*
   * The Attachments table is shared with the whole of Quickbase. A record
   * with no relationship is not findable from anywhere and is worse than a
   * refused upload.
   */
  assert.match(
    attachmentProblem({ ...ok, jobRecordId: 0 }) ?? "",
    /Pick a job first/,
  );
  assert.equal(attachmentProblem(ok), null);
});

test("an empty or nameless file is refused", () => {
  assert.match(attachmentProblem({ ...ok, bytes: 0 }) ?? "", /empty/);
  assert.match(attachmentProblem({ ...ok, fileName: "   " }) ?? "", /no name/);
});

test("the size limit is stated in the refusal, in both sizes", () => {
  const over = MAX_ATTACHMENT_BYTES + 1;
  assert.ok(tooBig(over));
  assert.ok(!tooBig(MAX_ATTACHMENT_BYTES));

  const message = attachmentProblem({ ...ok, bytes: over }) ?? "";
  // Somebody reading this needs to know how big theirs is AND what the cap is.
  assert.match(message, /3\.0 MB/, "says how big the file is");
  assert.match(message, /Quickbase record instead/, "says what to do instead");
});

test("sizes read as a person would write them", () => {
  assert.equal(humanSize(512), "512 B");
  assert.equal(humanSize(2048), "2 KB");
  assert.equal(humanSize(3 * 1024 * 1024), "3.0 MB");
});

test("the categories are ones the table already uses", () => {
  /*
   * Deliberately not invented. "Invoice" and "Award Letter" are existing
   * values on the Attachments table; adding a near-synonym of one is how a
   * 49,000-record document store stops being searchable.
   */
  assert.ok(ATTACHMENT_CATEGORIES.includes("Invoice"));
  assert.ok(ATTACHMENT_CATEGORIES.includes("Award Letter"));
  assert.equal(
    new Set(ATTACHMENT_CATEGORIES).size,
    ATTACHMENT_CATEGORIES.length,
  );
});

test("attachments are offered on the mainland, and not in Puerto Rico", () => {
  for (const key of ["FL", "NC", "TX", "LA"] as const) {
    assert.ok(
      REGIONS[key].routes.includes("attachments"),
      `${key} should offer attachments`,
    );
  }
  assert.ok(!REGIONS.PR.routes.includes("attachments"));
});
