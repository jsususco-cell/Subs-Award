import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/quickbase";
import { currentSession } from "@/lib/auth/current-user";
import { AccessUnavailableError, regionAccess } from "@/lib/auth/access";
import { formatRosterRegions, preservedCodes } from "@/lib/auth/roster";
import { isRegionKey, type RegionKey } from "@/lib/regions";
import { listRoster, rosterRow, updateRosterAccess } from "@/lib/auth/admin";
import { logAudit } from "@/lib/log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Changing who sees which region.
 *
 * Gated on Admin Access, the same tick that grants every region — so the
 * people who can already see everything are the people who can hand it out,
 * and there is no second list of administrators to keep in step with the
 * first.
 *
 * The send key is not accepted here. Everywhere else it stands in for a
 * machine; there is no machine that should be editing who works where, and
 * an audit entry naming nobody is worse than no endpoint at all.
 */
async function requireAdmin(): Promise<
  { ok: true; email: string } | { ok: false; response: NextResponse }
> {
  const session = await currentSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 }),
    };
  }

  let access;
  try {
    access = await regionAccess(session.email);
  } catch (e) {
    if (e instanceof AccessUnavailableError) {
      return {
        ok: false,
        response: NextResponse.json({ ok: false, error: e.message }, { status: 503 }),
      };
    }
    throw e;
  }

  if (access.grant !== "admin") {
    await logAudit({
      action: "access.denied",
      actor: session.email,
      outcome: "denied",
      details: { screen: "roster", held: access.grant },
    });
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error:
            "Changing who sees which region needs Admin Access on your own Internal Users record.",
        },
        { status: 403 },
      ),
    };
  }
  return { ok: true, email: session.email };
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  if (!isConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Quickbase is not configured." },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, users: await listRoster() });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const recordId = Number(body.recordId) || 0;
  if (!recordId) {
    return NextResponse.json({ ok: false, error: "No person given." }, { status: 400 });
  }

  const target = await rosterRow(recordId);
  if (!target) {
    return NextResponse.json(
      { ok: false, error: "That person is no longer on the roster." },
      { status: 404 },
    );
  }

  const headOffice = body.headOffice === true;
  const regions = (Array.isArray(body.regions) ? body.regions : []).filter(
    (r): r is RegionKey => isRegionKey(r),
  );
  const adminAccess = body.adminAccess === true;

  /*
   * You cannot take Admin Access off yourself.
   *
   * Not because it would be catastrophic — six other people hold it — but
   * because it is a one-click way to lose the only screen that could undo it,
   * and the mistake looks exactly like the app breaking.
   */
  if (target.email === admin.email && target.adminAccess && !adminAccess) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "You cannot remove your own Admin Access here — it would close this screen behind you. Ask another administrator, or untick it in Quickbase.",
      },
      { status: 400 },
    );
  }

  // Anything the roster tracks and this app does not — "VA" — is carried
  // through untouched. Ticking Florida must not delete Virginia.
  const region = formatRosterRegions({
    headOffice,
    regions,
    preserved: preservedCodes(target.region),
  });

  try {
    const updated = await updateRosterAccess({
      recordId,
      region,
      adminAccess,
      actor: admin.email,
    });
    return NextResponse.json({ ok: true, user: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "The change could not be saved.";
    console.error("[admin/roster]", message);
    return NextResponse.json(
      { ok: false, error: `Quickbase would not accept the change, so nothing was saved. ${message}` },
      { status: 502 },
    );
  }
}
