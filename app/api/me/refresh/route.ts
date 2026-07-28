import { NextResponse } from "next/server";
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
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await runCollectForUser(user.id);
    if (result.error) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, leagues: [result] });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
