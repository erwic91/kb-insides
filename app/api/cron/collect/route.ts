import { NextResponse } from "next/server";

// ~20-25 sequential requests per league; give the run room to breathe.
export const maxDuration = 120;
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

  // The full poll/compute cycle is implemented in M7.
  return NextResponse.json({ ok: true, ran: false, note: "collector not yet wired (M7)" });
}
