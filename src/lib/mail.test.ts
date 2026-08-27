import assert from "node:assert/strict";
import { test } from "node:test";
import { isEmail, parseRecipients } from "./mail";
import { parseLetterInput } from "./letter-input";
import { defaultBody, defaultSubject } from "./letter-email";
import type { LetterInput } from "./letter";

test("address validation rejects what would bounce or inject", () => {
  for (const good of [
    "sub@example.com",
    "first.last+tag@sub.domain.co",
    "  spaced@example.com  ",
  ]) {
    assert.ok(isEmail(good), `should accept ${good}`);
  }
  for (const bad of [
    "",
    "not-an-address",
    "missing@tld",
    "two@@at.com",
    "a@b.c",
    "with space@example.com",
    "comma,injection@example.com",
    "<script>@example.com",
    "name <real@example.com>",
  ]) {
    assert.ok(!isEmail(bad), `should reject ${JSON.stringify(bad)}`);
  }
});

test("recipient lists split on commas and semicolons", () => {
  assert.deepEqual(parseRecipients("a@x.com, b@y.com"), ["a@x.com", "b@y.com"]);
  assert.deepEqual(parseRecipients("a@x.com;b@y.com"), ["a@x.com", "b@y.com"]);
  assert.deepEqual(parseRecipients(" a@x.com , , b@y.com "), ["a@x.com", "b@y.com"]);
  assert.deepEqual(parseRecipients(""), []);
});

function sampleInput(): LetterInput {
  return {
    jobName: "PR-R3-03073",
    jobAddress: "Calle Luna 12, Ponce",
    subcontractor: "Acme Demolition",
    scopeOfWork: "",
    jobType: "Reconstruction",
    program: "PR R3",
    startDate: "",
    endDate: "",
    coverages: ["CE-DEMO", "CE-SITE"],
    issuedOn: "2026-08-27T00:00:00.000Z",
    result: {
      base: 148566.6,
      derivedLessOandP: 112550.45,
      lessOandP: 112550.45,
      lessOandPIsManual: false,
      tierRows: [
        { pct: 50, amount: 56275.23, selected: true },
        { pct: 55, amount: 61902.75, selected: false },
      ],
      hc: 122000,
      award: 178275.23,
    },
  };
}

test("the payload validator accepts a real letter and coerces the rest", () => {
  const parsed = parseLetterInput(sampleInput());
  assert.ok(parsed);
  assert.equal(parsed.jobName, "PR-R3-03073");
  assert.equal(parsed.result.award, 178275.23);
  assert.equal(parsed.result.tierRows.length, 2);
  assert.equal(parsed.result.tierRows[0].selected, true);
});

test("the validator refuses payloads it cannot trust", () => {
  assert.equal(parseLetterInput(null), null);
  assert.equal(parseLetterInput("string"), null);
  assert.equal(parseLetterInput({}), null, "no result block");
  assert.equal(parseLetterInput({ result: "nope" }), null);
});

test("non-numeric money in the payload becomes zero, never NaN", () => {
  const parsed = parseLetterInput({
    ...sampleInput(),
    result: { ...sampleInput().result, award: "1e9999", base: null, hc: undefined },
  });
  assert.ok(parsed);
  assert.equal(parsed.result.award, 0);
  assert.equal(parsed.result.base, 0);
  assert.equal(parsed.result.hc, 0);
  assert.ok(!Number.isNaN(parsed.result.award));
});

test("oversized text is truncated rather than forwarded whole", () => {
  const parsed = parseLetterInput({ ...sampleInput(), jobName: "x".repeat(50000) });
  assert.ok(parsed);
  assert.equal(parsed.jobName.length, 2000);
});

test("the covering note names the case and the award", () => {
  const input = sampleInput();
  assert.equal(defaultSubject(input), "Adjudicación de Subcontrato — Caso PR-R3-03073");

  const body = defaultBody(input);
  assert.ok(body.includes("Acme Demolition"));
  assert.ok(body.includes("PR-R3-03073"));
  assert.ok(body.includes("$178,275.23"));
  assert.ok(body.includes("50%"));
  assert.ok(body.includes("tres (3) días laborables"), "acceptance window missing");
  assert.ok(
    body.includes("no autoriza el inicio de trabajos"),
    "the NTP warning must travel with the letter",
  );
  assert.ok(!/undefined|NaN/.test(body));
});

test("a letter with no selected tier still produces a sendable note", () => {
  const input = sampleInput();
  input.result.tierRows = input.result.tierRows.map((t) => ({ ...t, selected: false }));
  const body = defaultBody(input);
  assert.ok(!/undefined|NaN/.test(body));
  assert.ok(body.includes("$178,275.23"));
});
