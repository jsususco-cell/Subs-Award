import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * .env.example is the one env file git tracks, which makes it the easy place
 * for a real credential to end up by mistake — it looks like the file you are
 * meant to edit. This guards against committing one.
 */

const SECRET_KEYS =
  /^(QB_USER_TOKEN|GMAIL_APP_PASSWORD|PORTAL_SEND_KEY|[A-Z0-9_]*(TOKEN|SECRET|PASSWORD|APIKEY|API_KEY))$/;

function trackedFiles(): string[] {
  try {
    return execFileSync("git", ["ls-files"], { encoding: "utf8" })
      .split(/\r?\n/)
      .filter(Boolean);
  } catch {
    return [];
  }
}

test(".env.example carries no populated secret values", () => {
  const text = readFileSync(".env.example", "utf8");
  const offenders: string[] = [];

  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    const value = rawValue.trim().replace(/^["']|["']$/g, "");
    if (value && SECRET_KEYS.test(key)) offenders.push(key);
  }

  assert.deepEqual(
    offenders,
    [],
    `.env.example has real value(s) for ${offenders.join(", ")}. ` +
      `Put credentials in .env.local — .env.example is committed.`,
  );
});

test("no tracked file contains a Quickbase user token", () => {
  // QB user tokens look like b<alnum>_<alnum>_<alnum>_<32+ alnum>.
  const QB_TOKEN = /\b[a-z0-9]{6}_[a-z0-9]{3,6}_[a-z0-9]_[a-z0-9]{25,}\b/;
  const skip = /\.(png|jpe?g|gif|ico|webp|woff2?|pdf|lock)$|package-lock\.json$/i;

  const hits: string[] = [];
  for (const file of trackedFiles()) {
    if (skip.test(file)) continue;
    let content = "";
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (QB_TOKEN.test(content)) hits.push(file);
  }

  assert.deepEqual(hits, [], `Quickbase token found in tracked file(s): ${hits.join(", ")}`);
});

test("no env file other than .env.example is tracked", () => {
  const tracked = trackedFiles().filter((f) => /(^|\/)\.env/.test(f));
  assert.deepEqual(tracked, [".env.example"]);
});
