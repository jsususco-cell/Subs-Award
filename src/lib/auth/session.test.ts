import { test } from "node:test";
import assert from "node:assert/strict";

import { sealSession, openSession, newSession, sessionCookieOptions } from "./session";
import { safeNext } from "./safe-next";

// The secret is read when a session is sealed, not at import, so setting it
// here is enough — no dynamic import needed.
process.env.AUTH_SECRET = "test-secret-that-is-long-enough-for-hmac-0123456789";

const base = {
  sub: "google-123",
  email: "someone@byrdsonservices.com",
  name: "Someone",
};

test("a sealed session round-trips", async () => {
  const sealed = await sealSession(newSession(base));
  const opened = await openSession(sealed);
  assert.equal(opened?.email, base.email);
  assert.equal(opened?.sub, base.sub);
});

test("a tampered payload is rejected", async () => {
  const sealed = await sealSession(newSession(base));
  const [payload, mac] = sealed.split(".");
  const forged = JSON.parse(Buffer.from(payload, "base64url").toString());
  forged.email = "someone@gmail.com";
  const swapped = `${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${mac}`;
  assert.equal(await openSession(swapped), null);
});

test("an expired session is rejected", async () => {
  const expired = { ...base, iat: 0, exp: Math.floor(Date.now() / 1000) - 60 };
  assert.equal(await openSession(await sealSession(expired)), null);
});

test("garbage and absence are rejected rather than thrown", async () => {
  assert.equal(await openSession(undefined), null);
  assert.equal(await openSession("not-a-session"), null);
  assert.equal(await openSession("a.b"), null);
});

test("a short secret cannot seal, and verifies nothing", async () => {
  const sealed = await sealSession(newSession(base));
  const real = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "too-short";
  try {
    await assert.rejects(() => sealSession(newSession(base)), /AUTH_SECRET/);
    // A cookie signed with the real secret must not open under a bad one, and
    // must not throw either: an unconfigured deployment is "nobody is signed
    // in", not a 500 on every page.
    assert.equal(await openSession(sealed), null);
  } finally {
    process.env.AUTH_SECRET = real;
  }
});

test("the cookie is cross-site capable only where it can also be Secure", () => {
  const env = process.env as Record<string, string | undefined>;
  const real = env.NODE_ENV;
  try {
    // The Quickbase dashboard frames this app from another site, so a Lax
    // cookie would never be sent there.
    env.NODE_ENV = "production";
    const prod = sessionCookieOptions();
    assert.equal(prod.sameSite, "none");
    assert.equal(prod.secure, true);

    // Locally it is plain http, where a browser drops SameSite=None outright.
    env.NODE_ENV = "development";
    const dev = sessionCookieOptions();
    assert.equal(dev.sameSite, "lax");
    assert.equal(dev.secure, false);
  } finally {
    env.NODE_ENV = real;
  }
});

test("post-login redirect refuses another origin", () => {
  assert.equal(safeNext("/fondo/review"), "/fondo/review");
  assert.equal(safeNext("//evil.example/x"), "/");
  assert.equal(safeNext("https://evil.example"), "/");
  assert.equal(safeNext("/\\evil.example"), "/");
  assert.equal(safeNext(null), "/");
});
