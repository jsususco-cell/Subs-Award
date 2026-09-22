/**
 * Proves this app can actually write to the System Log, end to end: writes one
 * record of each kind, reads them back, then deletes them.
 *
 *   npm run log:verify
 */
process.loadEnvFile(".env.local");
process.env.LOG_ENV = "dev";

const { log, logError, logAudit, __schema: QB } = await import("../src/lib/log.ts");

const marker = `subs-award-verify-${Date.now().toString(36)}`;

await log({ event: "test.activity", message: marker, component: "verify", items: 2 });
await logError(new TypeError(`${marker} broke`), { event: "test.error", component: "verify" });
await logAudit({
  action: "test.award.po.created",
  actor: "btechteam@byrdsonservices.com",
  outcome: "ok",
  target: { table: "purchaseOrders", recordId: 4242 },
  after: { marker, contractPrice: 9500 },
});

const H = {
  "QB-Realm-Hostname": process.env.QB_REALM ?? QB.realm,
  Authorization: `QB-USER-TOKEN ${process.env.QB_LOG_TOKEN ?? process.env.QB_USER_TOKEN}`,
  "Content-Type": "application/json",
};
const q = async (table: string, where: string, select: number[]) => {
  const r = await fetch("https://api.quickbase.com/v1/records/query", {
    method: "POST", headers: H, body: JSON.stringify({ from: table, select: [3, ...select], where }),
  });
  return ((await r.json()) as { data?: Record<string, { value: unknown }>[] }).data ?? [];
};

let bad = 0;
const ok = (l: string, c: boolean, x?: unknown) => {
  if (c) console.log(`  ok   ${l}`); else { bad++; console.log(`  FAIL ${l} -> ${JSON.stringify(x)}`); }
};

const act = await q(QB.tables.activity, `{${QB.env.message}.EX.'${marker}'}`, [QB.env.system, QB.env.environment, QB.activity.items]);
const err = await q(QB.tables.errors, `{${QB.env.message}.CT.'${marker}'}`, [QB.errors.errorType, QB.errors.triage]);
const aud = await q(QB.tables.audit, `{${QB.audit.after}.CT.'${marker}'}`, [QB.audit.action, QB.audit.targetId]);

ok("activity written", act.length === 1, act.length);
ok("  system is subs-award", act[0]?.[String(QB.env.system)]?.value === "subs-award", act[0]?.[String(QB.env.system)]?.value);
ok("  environment is dev", act[0]?.[String(QB.env.environment)]?.value === "dev");
ok("  items stored as a number", act[0]?.[String(QB.activity.items)]?.value === 2);
ok("error written", err.length === 1, err.length);
ok("  error type", err[0]?.[String(QB.errors.errorType)]?.value === "TypeError");
ok("audit written", aud.length === 1, aud.length);
ok("  target id", String(aud[0]?.[String(QB.audit.targetId)]?.value) === "4242");

for (const [table, rows] of [[QB.tables.activity, act], [QB.tables.errors, err], [QB.tables.audit, aud]] as const) {
  if (!rows.length) continue;
  const r = await fetch("https://api.quickbase.com/v1/records", {
    method: "DELETE", headers: H,
    body: JSON.stringify({ from: table, where: rows.map((x) => `{3.EX.${x["3"].value}}`).join("OR") }),
  });
  const j = (await r.json()) as { numberDeleted?: number };
  ok(`cleaned up ${j.numberDeleted} from ${table}`, j.numberDeleted === rows.length);
}

console.log(bad ? `\n${bad} FAILED` : "\nall good");
process.exit(bad ? 1 : 0);
