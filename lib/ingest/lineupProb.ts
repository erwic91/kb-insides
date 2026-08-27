import { getServiceClient } from "../db/client";
import { kbFetch, politeDelay } from "../kickbase/http";

/**
 * Reichert die players-Tabelle mit der Startelf-Wahrscheinlichkeit an (Kickbase
 * `prob`, 1..5). prob ist spielerglobal und steckt NICHT im Squad-Endpunkt,
 * sondern im Spielerprofil — daher ein Call je Spieler. Um die Last je Lauf zu
 * begrenzen, werden nur Kaderspieler mit fehlendem/veraltetem Stand behandelt
 * (die ältesten zuerst), gedeckelt auf `cap`. Über mehrere Läufe deckt das alle
 * ab und hält die Prognose spieltagsnah frisch. Best-effort.
 */
const STALE_MS = 18 * 60 * 60 * 1000;

export async function syncLineupProb(token: string, cap = 150): Promise<{ updated: number }> {
  const supabase = getServiceClient();

  // Spieler, die in irgendeinem Kader stehen (nur die zeigen wir mit Icon).
  const { data: sq } = await supabase.from("squad_players").select("player_id");
  const ids = [...new Set((sq ?? []).map((r) => r.player_id as string))];
  if (ids.length === 0) return { updated: 0 };

  const { data: pl } = await supabase.from("players").select("id, lineup_prob_at").in("id", ids);
  const atMap = new Map<string, string | null>();
  for (const p of pl ?? []) atMap.set(p.id as string, (p.lineup_prob_at as string) ?? null);

  const now = Date.now();
  const stale = ids
    .filter((id) => {
      const at = atMap.get(id);
      return at == null || now - Date.parse(at) > STALE_MS;
    })
    .sort((a, b) => {
      const ta = atMap.get(a);
      const tb = atMap.get(b);
      return (ta ? Date.parse(ta) : 0) - (tb ? Date.parse(tb) : 0); // nie/älteste zuerst
    })
    .slice(0, cap);

  let updated = 0;
  for (const pid of stale) {
    try {
      const raw = await kbFetch<Record<string, unknown>>(`/v4/competitions/1/players/${pid}`, { token });
      const probRaw = raw.prob;
      const prob = typeof probRaw === "number" ? probRaw : Number(probRaw);
      await supabase
        .from("players")
        .update({
          lineup_prob: Number.isFinite(prob) && prob >= 1 && prob <= 5 ? prob : null,
          lineup_prob_at: new Date().toISOString(),
        })
        .eq("id", pid);
      updated++;
    } catch {
      // Bei Fehler NICHT stempeln → nächster Lauf versucht es erneut.
    }
    await politeDelay(400);
  }
  return { updated };
}
