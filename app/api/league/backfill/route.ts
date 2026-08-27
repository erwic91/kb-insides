import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/supabase/server";
import { userHasLeagueAccess } from "../../../../lib/db/connections";
import { getLeagueMoneyBasis, deleteTransfersBefore } from "../../../../lib/db/ingest";
import { runCollectForUser } from "../../../../lib/ingest/collect";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Voll-Backfill EINER Liga: lädt die GESAMTE Transferhistorie ab dem
 * eingestellten Startzeitpunkt (Reset) — nicht inkrementell — und rekonstruiert
 * damit Konto & Handelsbilanz vollständig. Gedacht für NEU verbundene Ligen,
 * bei denen der Startzeitpunkt nachträglich auf den Saison-Reset gesetzt wurde.
 * Bestehende, bereits korrekte Ligen bleiben unberührt (Button wird dort nicht
 * geklickt). Auth: angemeldeter Nutzer MIT Zugriff auf diese Liga.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const league = new URL(request.url).searchParams.get("league");
  if (!league) return NextResponse.json({ error: "league fehlt" }, { status: 400 });

  if (!(await userHasLeagueAccess(user.id, league))) {
    return NextResponse.json({ error: "Keine Berechtigung für diese Liga" }, { status: 403 });
  }

  // Der Backfill braucht einen Anker (Startzeitpunkt), sonst würde er die
  // komplette Mehrjahres-Historie ziehen.
  const { trackingSince } = await getLeagueMoneyBasis(league);
  if (!trackingSince) {
    return NextResponse.json(
      { error: "Kein Startzeitpunkt gesetzt. Bitte zuerst in den Liga-Einstellungen den Reset/Start setzen." },
      { status: 400 },
    );
  }

  try {
    // Saubere Basis: Transfers vor dem Startzeitpunkt entfernen, dann die
    // gesamte Historie ab Startzeitpunkt neu laden.
    const deleted = await deleteTransfersBefore(league, trackingSince);
    const results = await runCollectForUser(user.id, league, { fullTransfers: true });
    const r = results[0];
    if (r?.error) return NextResponse.json({ ok: false, error: r.error }, { status: 500 });
    return NextResponse.json({
      ok: true,
      trackingSince,
      deletedTransfers: deleted,
      transfers: r?.transfers ?? 0,
      managers: r?.managers ?? 0,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
