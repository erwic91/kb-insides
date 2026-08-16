import { NextResponse } from "next/server";
import { snapshotMatchdayBonus } from "../../../../lib/ingest/matchdayBonus";

export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Wöchentlicher Cron (dienstagabends): friert die finalen Spieltagspunkte je
 * Manager ein → Grundlage für den Spieltagsbonus (Punkte × 1000 €) in der
 * Kontorekonstruktion. Läuft nach dem täglichen Collect, liest dessen frische
 * Snapshots. Auth wie bei /api/cron/collect über CRON_SECRET.
 */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await snapshotMatchdayBonus();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
