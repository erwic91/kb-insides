import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/supabase/server";
import { isAdminEmail } from "../../../../lib/db/admin";
import { ensureConnectionToken } from "../../../../lib/kickbase/session";
import { getUserLeagues } from "../../../../lib/db/connections";
import {
  fetchRanking,
  fetchAllTransfers,
  fetchManagerSquad,
  fetchPlayerMarketValue,
} from "../../../../lib/kickbase/endpoints";
import { parseRanking } from "../../../../lib/ingest/ranking";
import { kbFetch, politeDelay } from "../../../../lib/kickbase/http";

export const maxDuration = 300;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnose-Probe (nur Admin): misst, wie tief die Kickbase-Daten wirklich
 * zurückreichen, damit wir den historischen Backfill auf echten Zahlen planen
 * können statt zu raten. Prüft:
 *  A) Transfer-Tiefe je Manager (ältester/jüngster erreichbarer Transfer),
 *  B) ob es eine Transfer-/Besitzhistorie PRO SPIELER gibt (Kandidaten-Endpoints),
 *  C) Tiefe der Marktwert-Kurve (365) eines Spielers.
 * Keine Schreibvorgänge. Aufruf im eingeloggten Admin-Browser: /api/dev/probe
 * (optional ?league=<id>).
 */

/** Kompakte Struktur-Zusammenfassung einer unbekannten API-Antwort. */
function summarize(v: unknown): unknown {
  if (v == null) return null;
  if (Array.isArray(v)) {
    return { array: true, len: v.length, sampleKeys: v[0] && typeof v[0] === "object" ? Object.keys(v[0] as object) : [] };
  }
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = { keys: Object.keys(obj) };
    if (Array.isArray(obj.it)) {
      const it = obj.it as unknown[];
      out.it = {
        len: it.length,
        sampleKeys: it[0] && typeof it[0] === "object" ? Object.keys(it[0] as object) : [],
        first: it[0] ?? null,
      };
    }
    return out;
  }
  return v;
}

const dayToDate = (dt: number) => new Date(dt * 86_400_000).toISOString().slice(0, 10);

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Unauthorized (Admin erforderlich)" }, { status: 401 });
  }

  let token: string;
  try {
    token = await ensureConnectionToken(user.id);
  } catch (e) {
    return NextResponse.json({ error: `Keine Kickbase-Verbindung: ${(e as Error).message}` }, { status: 400 });
  }

  const url = new URL(request.url);
  const requested = url.searchParams.get("league");
  const leagues = await getUserLeagues(user.id);
  const leagueId = requested ?? leagues[0]?.leagueId;
  if (!leagueId) {
    return NextResponse.json({ error: "Keine aktive Liga gefunden." }, { status: 400 });
  }

  const report: Record<string, unknown> = { leagueId, checkedAt: new Date().toISOString() };

  try {
    // Manager der Liga bestimmen (Sample: bis zu 3).
    const ranking = await fetchRanking(leagueId, { token });
    const parsed = parseRanking(ranking, leagueId);
    const managers = parsed.managers.slice(0, 3);
    await politeDelay();

    // A) Transfer-Tiefe je Manager — volle Historie zurückblättern (bis 60 Seiten).
    const transferDepth: unknown[] = [];
    let samplePlayerId: string | null = null;
    for (const m of managers) {
      try {
        const tr = await fetchAllTransfers(leagueId, m.id, { token, since: null, maxPages: 60 });
        const dts = tr.it.map((t) => t.dt).filter((d): d is string => !!d).sort();
        transferDepth.push({
          managerId: m.id,
          name: m.name,
          count: tr.it.length,
          oldest: dts[0] ?? null,
          newest: dts[dts.length - 1] ?? null,
          maybeCapped: tr.it.length >= 60 * 25,
        });
      } catch (e) {
        transferDepth.push({ managerId: m.id, error: (e as Error).message });
      }
      await politeDelay();
    }
    report.A_transferDepth = transferDepth;

    // Sample-Spieler + D) Roh-Kader (alle Felder je Spieler) für Aufstellungs-/
    // Status-Analyse.
    const sampleManagerId = managers[0]?.id ?? null;
    if (managers[0]) {
      try {
        const squad = await fetchManagerSquad(leagueId, managers[0].id, { token });
        samplePlayerId = squad.it.find((p) => p.pi != null)?.pi ?? null;
        const items = squad.it as unknown as Record<string, unknown>[];
        // Verteilung von st / lst über den Kader (für die Status-Zuordnung).
        const dist = (key: string) => {
          const m: Record<string, number> = {};
          for (const it of items) {
            const v = String((it as Record<string, unknown>)[key] ?? "∅");
            m[v] = (m[v] ?? 0) + 1;
          }
          return m;
        };
        report.D_squadRaw = {
          count: items.length,
          allKeys: items[0] ? Object.keys(items[0]) : [],
          firstTwo: items.slice(0, 2),
          stDistribution: dist("st"),
          lstDistribution: dist("lst"),
        };
      } catch (e) {
        report.D_squadRaw = { error: (e as Error).message };
      }
      await politeDelay();
    }
    report.samplePlayerId = samplePlayerId;

    // E) Aufstellungs-Endpunkte (Kandidaten) — für das Fußballfeld.
    if (sampleManagerId) {
      const lineupCandidates = [
        `/v4/leagues/${leagueId}/managers/${sampleManagerId}/lineup`,
        `/v4/leagues/${leagueId}/managers/${sampleManagerId}/teamcenter`,
        `/v4/leagues/${leagueId}/lineup`,
        `/v4/leagues/${leagueId}/teamcenter`,
      ];
      const lineupEndpoints: Record<string, unknown> = {};
      for (const path of lineupCandidates) {
        try {
          const raw = await kbFetch<unknown>(path, { token });
          lineupEndpoints[path] = { ok: true, summary: summarize(raw), raw };
        } catch (e) {
          lineupEndpoints[path] = { ok: false, error: (e as Error).message };
        }
        await politeDelay();
      }
      report.E_lineupEndpoints = lineupEndpoints;
    }

    // F) Spielerprofil-Werte (prob/st/stl/iposl/pos) — für die Status-Icons.
    if (samplePlayerId) {
      try {
        const prof = (await kbFetch<Record<string, unknown>>(
          `/v4/leagues/${leagueId}/players/${samplePlayerId}`,
          { token },
        )) ?? {};
        const keys = ["prob", "st", "stl", "iposl", "pos", "sl", "day", "mdsum"];
        report.F_playerProfileValues = Object.fromEntries(
          keys.filter((k) => k in prof).map((k) => [k, prof[k]]),
        );
      } catch (e) {
        report.F_playerProfileValues = { error: (e as Error).message };
      }
      await politeDelay();
    }

    // B) Kandidaten für eine Transfer-/Besitzhistorie PRO SPIELER.
    if (samplePlayerId) {
      const candidates = [
        `/v4/leagues/${leagueId}/players/${samplePlayerId}/transfers`,
        `/v4/leagues/${leagueId}/players/${samplePlayerId}/transferHistory`,
        `/v4/leagues/${leagueId}/players/${samplePlayerId}`,
        `/v4/competitions/1/players/${samplePlayerId}`,
        `/v4/competitions/1/players/${samplePlayerId}/transfers`,
      ];
      const playerEndpoints: Record<string, unknown> = {};
      for (const path of candidates) {
        try {
          const raw = await kbFetch<unknown>(path, { token });
          playerEndpoints[path] = { ok: true, summary: summarize(raw) };
        } catch (e) {
          playerEndpoints[path] = { ok: false, error: (e as Error).message };
        }
        await politeDelay();
      }
      report.B_playerEndpoints = playerEndpoints;

      // C) Marktwert-Kurve (365) — Tiefe.
      try {
        const mv = await fetchPlayerMarketValue(leagueId, samplePlayerId, "365", { token });
        const pts = (mv.it ?? []).filter((p) => p.dt != null);
        const days = pts.map((p) => p.dt as number).sort((a, b) => a - b);
        const oldest = days[0];
        const newest = days[days.length - 1];
        report.C_marketValueCurve = {
          count: pts.length,
          oldest: oldest != null ? dayToDate(oldest) : null,
          newest: newest != null ? dayToDate(newest) : null,
        };
      } catch (e) {
        report.C_marketValueCurve = { error: (e as Error).message };
      }
    }

    return NextResponse.json({ ok: true, report });
  } catch (e) {
    return NextResponse.json({ ok: false, report, error: (e as Error).message }, { status: 500 });
  }
}
