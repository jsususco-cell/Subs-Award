import { readFileSync, existsSync } from "node:fs";

/**
 * Minimal n8n REST client.
 *
 * Credentials come from N8N_BASE_URL / N8N_KEY in the environment, or from an
 * env file named by N8N_ENV_FILE. Values are never printed.
 */
function loadEnv() {
  const files = [
    process.env.N8N_ENV_FILE,
    ".env.local",
    "../byrdson-hris/.env.n8n",
    "../byrdson-cc-system/.env.n8n",
  ].filter(Boolean);

  for (const file of files) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      if (!(m[1] in process.env)) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}

loadEnv();

export const BASE = (process.env.N8N_BASE_URL ?? "").replace(/\/+$/, "");
const KEY = process.env.N8N_KEY ?? process.env.N8N_API_KEY ?? "";

if (!BASE || !KEY) {
  console.error(
    "n8n credentials not found.\n" +
      "Expected N8N_BASE_URL and N8N_KEY in .env.local (or set N8N_ENV_FILE).",
  );
  process.exit(1);
}

export async function n8n(path, init = {}) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    ...init,
    headers: {
      "X-N8N-API-KEY": KEY,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`n8n ${res.status} ${path}: ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
}
