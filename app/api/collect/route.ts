import { NextResponse } from "next/server";
import { runCollect, runCollectLeague } from "../../../lib/ingest/collect";

// Ranking + Transfers (paginiert) + Markt je Liga → großzügiges Zeitbudget.
export const maxDuration = 120;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * On-Demand-Sammler für den „Aktualisieren"-Button.
 *   POST /api/collect             → alle Ligen des Nutzers
 *   POST /api/collect?league=<id> → nur diese Liga (schnell, für den Button)
 *
 * Schutz identisch zum Cron: `Authorization: Bearer <CRON_SECRET>`. Der Button
 * hält das Secret nur clientseitig (localStorage) — es steht nicht im Bundle.
 */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const league = new URL(request.url).searchParams.get("league");
  try {
    const result = league
      ? { leagues: [await runCollectLeague(league)] }
      : await runCollect();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
