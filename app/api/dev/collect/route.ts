import { NextResponse } from "next/server";
import { runCollect } from "../../../../lib/ingest/collect";

// Login + Ranking je Liga, sequentiell mit Pausen → genug Zeit geben.
export const maxDuration = 120;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Manueller Trigger für den M2-Collector (Ranking-Ingest über alle Ligen aus
 * KICKBASE_LEAGUE_IDS). Identische Logik wie der Vercel-Cron
 * (`/api/cron/collect`), aber zusätzlich per `?secret=` im Browser auslösbar,
 * damit man den Lauf ohne Terminal anstoßen kann.
 *
 * Schutz per CRON_SECRET (Header ODER Query). Kann nach dem produktiven
 * Aufsetzen des Crons entfernt werden.
 */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  return new URL(request.url).searchParams.get("secret") === secret;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runCollect();
    return NextResponse.json({ ok: true, ran: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
