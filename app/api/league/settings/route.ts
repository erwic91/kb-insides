import { NextResponse } from "next/server";
import {
  updateLeagueSettings,
  deleteTransfersBefore,
  type LeagueSettingsInput,
} from "../../../../lib/db/ingest";
import { getCurrentUser } from "../../../../lib/supabase/server";
import { userHasLeagueAccess } from "../../../../lib/db/connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Speichert die per-Liga-Einstellungen.
 *   POST /api/league/settings?league=<id>
 *   body: { gameMode?, startBudget?, trackingSince?, includeHistory?, bonusMode? }
 * Wird historische Historie ausgeschlossen (includeHistory=false) und ein
 * trackingSince gesetzt, werden Transfers davor gelöscht (saubere Basis).
 * Auth: angemeldeter Nutzer (Session) MIT Zugriff auf diese Liga (league_access).
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const league = new URL(request.url).searchParams.get("league");
  if (!league) return NextResponse.json({ error: "league fehlt" }, { status: 400 });

  if (!(await userHasLeagueAccess(user.id, league))) {
    return NextResponse.json({ error: "Keine Berechtigung für diese Liga" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "ungültiger Body" }, { status: 400 });
  }

  const settings: LeagueSettingsInput = {};

  if ("gameMode" in body) {
    const gm = Number(body.gameMode);
    if (gm !== 1 && gm !== 2) return NextResponse.json({ error: "gameMode muss 1 oder 2 sein" }, { status: 400 });
    settings.game_mode = gm;
  }
  if ("startBudget" in body) {
    const b = Number(body.startBudget);
    if (!Number.isFinite(b) || b < 0) return NextResponse.json({ error: "startBudget ungültig" }, { status: 400 });
    settings.start_budget = Math.round(b);
  }
  if ("trackingSince" in body) {
    const ts = body.trackingSince;
    if (ts == null) settings.tracking_since = null;
    else {
      const ms = Date.parse(String(ts));
      if (Number.isNaN(ms)) return NextResponse.json({ error: "trackingSince ungültig" }, { status: 400 });
      settings.tracking_since = new Date(ms).toISOString();
    }
  }
  if ("includeHistory" in body) settings.include_history = Boolean(body.includeHistory);
  if ("bonusMode" in body) {
    const m = String(body.bonusMode);
    if (m !== "matchday" && m !== "lockin") return NextResponse.json({ error: "bonusMode ungültig" }, { status: 400 });
    settings.bonus_mode = m;
  }

  try {
    await updateLeagueSettings(league, settings);
    // Saubere Basis: Historie ausgeschlossen + Startpunkt gesetzt → Ältere löschen.
    let deleted = 0;
    if (settings.include_history === false && settings.tracking_since) {
      deleted = await deleteTransfersBefore(league, settings.tracking_since);
    }
    return NextResponse.json({ ok: true, deletedTransfers: deleted });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
