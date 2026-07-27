import { NextResponse } from "next/server";
import { captureFixtures } from "../../../../lib/kickbase/captureFixtures";
import { getServiceClient } from "../../../../lib/db/client";

// Login + ~8 sequentielle Requests mit höflichen Pausen → genug Zeit geben.
export const maxDuration = 120;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * HUMAN CHECKPOINT B — hosted.
 *
 * Greift jeden Endpunkt aus SPEC §6 EINMAL ab und gibt die (token-redigierten)
 * Rohantworten als JSON zurück, damit die echten Kickbase-Feldnamen sichtbar
 * werden — Grundlage für die Parser ab M2. Ersetzt den lokalen
 * `pnpm capture-fixtures`-Lauf: läuft im Vercel-Deployment mit den dort
 * gesetzten Env-Variablen, es muss nichts lokal ausgeführt werden.
 *
 * Auslösen (einmalig, mit dem in Vercel gesetzten CRON_SECRET):
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        https://<deine-app>.vercel.app/api/dev/capture-fixtures
 * Alternativ im Browser mit ?secret=<CRON_SECRET> (Secret landet dann im
 * Server-Log/Verlauf — nur für den einmaligen Abgriff nutzen).
 *
 * Schutz identisch zum Cron: ohne gültiges CRON_SECRET → 401. Die Antwort
 * enthält keine Tokens (redigiert). Kann nach M2 entfernt werden.
 */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await captureFixtures();

    // Ergebnis zusaetzlich in Supabase ablegen, damit es serverseitig (ohne
    // Copy&Paste) ausgelesen werden kann. Fehler hier sind nicht fatal — die
    // JSON-Antwort bleibt der Fallback.
    let persisted = false;
    try {
      const supabase = getServiceClient();
      const { error } = await supabase
        .from("app_settings")
        .upsert({ key: "__dev_last_capture", value: JSON.stringify(result) }, { onConflict: "key" });
      persisted = !error;
    } catch {
      /* ignore — Fallback ist die JSON-Antwort */
    }

    return NextResponse.json({ ok: true, persisted, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
