import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FONDO_FIELDS,
  FONDO_STATUS,
  base64Bytes,
  canSubmit,
  coverageOf,
  fondoConfigured,
  missingFondoFields,
  rejectReturn,
  rejectSubmission,
  type FondoSubmission,
} from "./fondo";
import {
  fondoFormUrl,
  formRequestMail,
  returnedMail,
  reviewRequestMail,
} from "./fondo-mail";

function sub(over: Partial<FondoSubmission> = {}): FondoSubmission {
  return {
    insuranceAmount: 178275.23,
    policyNumber: "CFSE-99",
    file: { fileName: "poliza.pdf", data: "A".repeat(400) },
    submittedBy: "Juan",
    ...over,
  };
}

test("a submission needs an amount and a document", () => {
  assert.equal(rejectSubmission(sub(), false), null);

  assert.match(String(rejectSubmission(sub({ insuranceAmount: 0 }), false)), /amount/i);
  assert.match(String(rejectSubmission(sub({ file: null }), false)), /Attach the poliza/i);

  // A resubmission may keep the file already on record.
  assert.equal(rejectSubmission(sub({ file: null }), true), null);
});

test("a poliza short of the award is accepted, not blocked", () => {
  // Deliberate: under-cover is real and belongs in the review queue. Refusing
  // it here would push the subcontractor to inflate the figure to get through.
  assert.equal(rejectSubmission(sub({ insuranceAmount: 1 }), false), null);
  const c = coverageOf(1, 178275.23);
  assert.equal(c.covers, false);
  assert.ok(Math.abs(c.shortfall - 178274.23) < 0.005);
});

test("coverage is only satisfied at or above the award", () => {
  assert.equal(coverageOf(178275.23, 178275.23).covers, true);
  assert.equal(coverageOf(178275.24, 178275.23).covers, true);
  assert.equal(coverageOf(178275.22, 178275.23).covers, false);
  assert.equal(coverageOf(178275.23, 178275.23).shortfall, 0);
});

test("only documents we can read are accepted, and not oversized ones", () => {
  assert.match(String(rejectSubmission(sub({ file: { fileName: "poliza.exe", data: "A".repeat(400) } }), false)), /PDF or an image/i);
  assert.equal(rejectSubmission(sub({ file: { fileName: "POLIZA.PDF", data: "A".repeat(400) } }), false), null);
  assert.equal(rejectSubmission(sub({ file: { fileName: "foto.HEIC", data: "A".repeat(400) } }), false), null);

  // Base64 carries 3 bytes per 4 characters, so the string has to be a third
  // longer than the limit to exceed it: 11 MB of base64 is only ~8.25 MB.
  const huge = "A".repeat(14 * 1024 * 1024);
  assert.ok(base64Bytes(huge) > 10 * 1024 * 1024, "fixture must actually exceed the cap");
  assert.match(String(rejectSubmission(sub({ file: { fileName: "p.pdf", data: huge } }), false)), /larger than 10 MB/i);
  assert.match(String(rejectSubmission(sub({ file: { fileName: "p.pdf", data: "AA" } }), false)), /looks empty/i);
});

test("base64 size is measured, not guessed from the string length", () => {
  // "hello" -> aGVsbG8= : 8 chars of base64, 5 bytes of content.
  assert.equal(base64Bytes("aGVsbG8="), 5);
  assert.equal(base64Bytes("aGVsbG9v"), 6);
});

test("an approved case is closed to further submissions", () => {
  assert.equal(canSubmit(FONDO_STATUS.awaiting), true);
  assert.equal(canSubmit(FONDO_STATUS.returned), true);
  assert.equal(canSubmit(FONDO_STATUS.submitted), true);
  assert.equal(canSubmit(FONDO_STATUS.approved), false);
});

test("returning a submission requires a reason the subcontractor can act on", () => {
  assert.match(String(rejectReturn("")), /Say what needs correcting/);
  assert.match(String(rejectReturn("   ")), /Say what needs correcting/);
  assert.equal(rejectReturn("The poliza is for the wrong case number."), null);
});

test("every staging field is mapped to a real Quickbase field", () => {
  const names = Object.keys(FONDO_FIELDS);
  assert.equal(names.length, 9);
  // Field 0 does not exist; a zero here would mean a silent write to nowhere.
  for (const [name, id] of Object.entries(FONDO_FIELDS)) {
    assert.ok(id > 0, `${name} is not mapped`);
  }
  // Distinct ids -- a copy/paste slip would quietly overwrite another field.
  assert.equal(new Set(Object.values(FONDO_FIELDS)).size, names.length);
  assert.equal(fondoConfigured(), true);
  assert.deepEqual(missingFondoFields(), []);
});

// --- the messages the flow sends -------------------------------------------

test("the form request tells the subcontractor the amount that must be covered", () => {
  const m = formRequestMail({
    caseNumber: "PR-R3-10266",
    subcontractor: "ALL POINTS ENVIRONMENTAL LLC",
    awardedAmount: 178275.23,
    formUrl: "https://example.com/fondo/abc/1",
  });
  assert.match(m.subject, /PR-R3-10266/);
  assert.match(m.text, /\$178,275\.23/);
  assert.match(m.text, /https:\/\/example\.com\/fondo\/abc\/1/);
  // The lever the award letter names, restated where it is actionable.
  assert.match(m.text, /Inspección Final/);
});

test("the reviewer is told whether the poliza covers the award", () => {
  const base = {
    caseNumber: "PR-R3-10266",
    subcontractor: "ALL POINTS",
    awardedAmount: 178275.23,
    formUrl: "",
  };
  const short = reviewRequestMail(base, 150000, "https://example.com/fondo/review");
  assert.match(short.text, /SHORT by \$28,275\.23/);

  const full = reviewRequestMail(base, 178275.23, "https://example.com/fondo/review");
  assert.match(full.text, /Covers the award/);
  assert.ok(!full.text.includes("SHORT"));
});

test("a returned poliza carries the reason the subcontractor has to act on", () => {
  const m = returnedMail(
    {
      caseNumber: "PR-R3-10266",
      subcontractor: "ALL POINTS",
      awardedAmount: 178275.23,
      formUrl: "https://example.com/fondo/abc/1",
    },
    "La póliza es del caso equivocado.",
  );
  assert.match(m.text, /La póliza es del caso equivocado\./);
  assert.match(m.text, /https:\/\/example\.com\/fondo\/abc\/1/);
});

test("links are refused rather than guessed when the base URL is unset", () => {
  const had = process.env.APP_BASE_URL;
  const hadVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  delete process.env.APP_BASE_URL;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  // A relative link in an inbox is dead, so an empty string is the signal for
  // the sender to refuse instead of mailing one.
  assert.equal(fondoFormUrl("abc", 1), "");

  process.env.APP_BASE_URL = "https://subs-award.vercel.app/";
  assert.equal(fondoFormUrl("abc", 1), "https://subs-award.vercel.app/fondo/abc/1");

  if (had === undefined) delete process.env.APP_BASE_URL;
  else process.env.APP_BASE_URL = had;
  if (hadVercel !== undefined) process.env.VERCEL_PROJECT_PRODUCTION_URL = hadVercel;
});
