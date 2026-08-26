import { readFileSync, existsSync } from "node:fs";

/** Minimal .env.local reader so these scripts need no dependencies. */
export function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const value = m[2].replace(/^["']|["']$/g, "");
      if (!(m[1] in process.env)) process.env[m[1]] = value;
    }
  }
}

loadEnv();

export const REALM = process.env.QB_REALM ?? "byrdsonservices.quickbase.com";
export const TOKEN = process.env.QB_USER_TOKEN ?? "";
export const TABLES = {
  jobs: process.env.QB_JOBS_TABLE ?? "buskqh27b",
  vendors: process.env.QB_VENDORS_TABLE ?? "buskqh272",
};

if (!TOKEN) {
  console.error(
    "QB_USER_TOKEN is not set.\n" +
      "Put it in .env.local (which is gitignored):\n\n" +
      "  QB_USER_TOKEN=your_token_here\n",
  );
  process.exit(1);
}

export async function qb(path, init = {}) {
  const res = await fetch(`https://api.quickbase.com/v1${path}`, {
    ...init,
    headers: {
      "QB-Realm-Hostname": REALM,
      Authorization: `QB-USER-TOKEN ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Quickbase ${res.status} ${path}: ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
}
