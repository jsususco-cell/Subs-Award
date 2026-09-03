import assert from "node:assert/strict";
import { test } from "node:test";
import { checkRecipients, isEmail, parseRecipients, sendKeyRequired } from "./mail";
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
    ada: 0,
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

test("accented Spanish survives the JSON body the send route builds", () => {
  // A shell can mangle these into a different codepage before they are ever
  // serialised; JSON.stringify plus a UTF-8 encode must not.
  const subject = "Adjudicación de Subcontrato — Caso PR-R3-03073";
  const body = "Señor, ¿está bien? ¡Sí! Movilización, Empañetado, Inspección Final.";

  const wire = JSON.stringify({ subject, text: body });
  const round = JSON.parse(Buffer.from(wire, "utf8").toString("utf8"));

  assert.equal(round.subject, subject);
  assert.equal(round.text, body);
  assert.ok(!round.subject.includes("\uFFFD"), "replacement char in subject");
  assert.ok(!round.text.includes("\uFFFD"), "replacement char in body");

  // Every character the award letter relies on must survive the round trip.
  for (const ch of ["ó", "á", "ñ", "í", "¿", "¡", "—"]) {
    const source = subject + body;
    assert.ok(source.includes(ch), `sample text is missing ${ch}`);
    assert.ok(
      (round.subject + round.text).includes(ch),
      `${ch} (U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase()}) did not survive`,
    );
  }
});

test("the default covering note carries real accents, not escapes", () => {
  const input = sampleInput();
  input.subcontractor = "Demolición Acme";
  const subject = defaultSubject(input);
  const body = defaultBody(input);

  assert.ok(subject.includes("Adjudicación"), "subject lost its accent");
  assert.ok(subject.includes("—"), "subject lost its em dash");
  assert.ok(body.includes("Demolición"));
  assert.ok(body.includes("días laborables"));
  assert.ok(!(subject + body).includes("\uFFFD"));

  // Code points, so a mis-encoded source file would be caught too.
  assert.equal("ó".codePointAt(0), 0x00f3);
  assert.equal("—".codePointAt(0), 0x2014);
  assert.ok(subject.codePointAt(subject.indexOf("ó")) === 0x00f3);
});

test("the send key is required on a hosted deployment, optional locally", () => {
  const saved = { vercel: process.env.VERCEL, key: process.env.LETTER_SEND_KEY };
  try {
    delete process.env.VERCEL;
    delete process.env.LETTER_SEND_KEY;
    assert.equal(sendKeyRequired(), false, "local dev should not demand a key");

    // A hosted deployment is reachable by anyone, so it must fail closed even
    // when nobody configured a key.
    process.env.VERCEL = "1";
    assert.equal(sendKeyRequired(), true, "Vercel must always demand a key");

    delete process.env.VERCEL;
    process.env.LETTER_SEND_KEY = "abc";
    assert.equal(sendKeyRequired(), true, "an explicit key must be enforced");
  } finally {
    if (saved.vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = saved.vercel;
    if (saved.key === undefined) delete process.env.LETTER_SEND_KEY;
    else process.env.LETTER_SEND_KEY = saved.key;
  }
});

test("the allowlist is read at call time, so it cannot act on a stale value", () => {
  const had = process.env.LETTER_SEND_ALLOWLIST;

  delete process.env.LETTER_SEND_ALLOWLIST;
  assert.equal(checkRecipients(["anyone@example.com"]).ok, true, "unset means no restriction");

  // Set AFTER the module was imported: a snapshotted const would miss this,
  // which is exactly how a rail silently fails to be a rail.
  process.env.LETTER_SEND_ALLOWLIST = "admin@byrdsonservices.com,jsususco@byrdsonservices.com";
  const blocked = checkRecipients(["outsider@example.com"]);
  assert.equal(blocked.ok, false);
  assert.deepEqual(blocked.blocked, ["outsider@example.com"]);

  assert.equal(checkRecipients(["admin@byrdsonservices.com"]).ok, true);
  // Case and spacing in the variable must not decide who can be mailed.
  process.env.LETTER_SEND_ALLOWLIST = "  ADMIN@Byrdsonservices.com , jsususco@byrdsonservices.com ";
  assert.equal(checkRecipients(["admin@byrdsonservices.com"]).ok, true);

  if (had === undefined) delete process.env.LETTER_SEND_ALLOWLIST;
  else process.env.LETTER_SEND_ALLOWLIST = had;
});
