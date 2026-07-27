import { NextResponse } from "next/server";
import {
  setLeagueTrackingSince,
  deleteTransfersBefore,
} from "../../../../lib/db/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Setzt (oder löscht) den Monitoring-Startpunkt einer Liga.
 *   POST /api/league/tracking?league=<id>   body: { since: "<ISO>" | null }
 * Beim Setzen werden Transfers vor dem Zeitpunkt gelöscht (saubere Basis) und
 * künftige Sammel-Läufe laden nichts Älteres. Schutz via CRON_SECRET (Bearer).
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
  if (!league) {
    return NextResponse.json({ error: "league fehlt" }, { status: 400 });
  }

  let since: string | null = null;
  try {
    const body = (await request.json()) as { since?: string | null };
    since = body.since ?? null;
  } catch {
    // leerer Body → since = null (Tracking-Start löschen)
  }

  // Validierung: entweder null oder ein parsebarer Zeitstempel.
  if (since != null) {
    const ms = Date.parse(since);
    if (Number.isNaN(ms)) {
      return NextResponse.json({ error: "since ist kein gültiges Datum" }, { status: 400 });
    }
    since = new Date(ms).toISOString();
  }

  try {
    await setLeagueTrackingSince(league, since);
    const deleted = since ? await deleteTransfersBefore(league, since) : 0;
    return NextResponse.json({ ok: true, trackingSince: since, deletedTransfers: deleted });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
