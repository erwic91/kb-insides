import { NextResponse } from "next/server";
import { runBackfill } from "../../../../lib/ingest/backfill";
import { parseLeagueIds } from "../../../../lib/env";

// Bis zu 34 Ranking-Abrufe pro Liga, sequentiell mit Pausen.
export const maxDuration = 300;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * M3 — manueller Backfill-Trigger (CRON_SECRET-geschützt, per `?secret=` im
 * Browser auslösbar). Optional `?league=<id>` für eine einzelne Liga, sonst
 * alle aus KICKBASE_LEAGUE_IDS.
 */
function isAuthorized(request: Request, url: URL): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  return url.searchParams.get("secret") === secret;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!isAuthorized(request, url)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const league = url.searchParams.get("league");
  const leagueIds = league ? [league] : parseLeagueIds();

  try {
    const result = await runBackfill(leagueIds);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
