import { NextResponse } from "next/server";
import { runCollect } from "../../../../lib/ingest/collect";

// ~35-40 s je Liga (Kader + Transfers je Manager, höfliche Pausen). Mit 120 s
// brach der Lauf bei ~6 Ligen ab → Kaderwerte blieben tagelang veraltet.
export const maxDuration = 300;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vercel Cron target. Vercel sends `Authorization: Bearer <CRON_SECRET>`.
 * We reject anything that does not match CRON_SECRET so the route can only
 * be triggered by the scheduled cron (or an operator holding the secret).
 */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
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
