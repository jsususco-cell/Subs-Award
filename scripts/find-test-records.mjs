/**
 * Read-only. Find records that already look like test data, so the write-path
 * rehearsal lands on something nobody is relying on.
 *
 * Writes nothing. Run:  node scripts/find-test-records.mjs
 */
import { qb, TABLES } from "./qb.mjs";

const JOBS = { recordId: 3, name: 6, state: 40, type: 1073 };
const VENDORS = { recordId: 3, company: 6, email: 8, region: 66 };

const NEEDLES = ["test", "zzz", "sample", "dummy", "do not use", "training"];

async function query(from, select, where) {
  const res = await qb("/records/query", {
    method: "POST",
    body: JSON.stringify({ from, select, where, options: { top: 60 } }),
  });
  return res.data ?? [];
}

const v = (row, fid) => row[String(fid)]?.value ?? "";

console.log("Jobs whose name looks like test data\n" + "-".repeat(60));
for (const needle of NEEDLES) {
  const rows = await query(
    TABLES.jobs,
    [JOBS.recordId, JOBS.name, JOBS.state, JOBS.type],
    `{${JOBS.name}.CT.'${needle}'}`,
  );
  for (const r of rows) {
    console.log(
      `  #${v(r, JOBS.recordId)}  ${String(v(r, JOBS.name)).slice(0, 52).padEnd(52)} ` +
        `${String(v(r, JOBS.state)).padEnd(14)} ${v(r, JOBS.type)}`,
    );
  }
}

console.log(
  "\nSubcontractors whose name looks like test data\n" + "-".repeat(60),
);
for (const needle of NEEDLES) {
  const rows = await query(
    TABLES.vendors,
    [VENDORS.recordId, VENDORS.company, VENDORS.email, VENDORS.region],
    `{${VENDORS.company}.CT.'${needle}'}`,
  );
  for (const r of rows) {
    console.log(
      `  #${v(r, VENDORS.recordId)}  ${String(v(r, VENDORS.company)).slice(0, 40).padEnd(40)} ` +
        `${String(v(r, VENDORS.region)).padEnd(14)} ${v(r, VENDORS.email)}`,
    );
  }
}
