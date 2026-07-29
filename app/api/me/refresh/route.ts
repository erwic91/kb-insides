import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/supabase/server";
import { runCollectForUser } from "../../../../lib/ingest/collect";

// Sammelt die aktive Liga des angemeldeten Nutzers + dessen /me/budget.
export const maxDuration = 120;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authentifizierter On-Demand-Refresh (Session-Cookie, kein CRON_SECRET). Zieht
 * frische Daten für die aktive Liga des Nutzers und dessen exakten Kontostand.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const league = new URL(request.url).searchParams.get("league") ?? undefined;
  try {
    const results = await runCollectForUser(user.id, league);
    const failed = results.find((r) => r.error);
    if (failed && results.length === 1) {
      return NextResponse.json({ ok: false, error: failed.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, leagues: results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
