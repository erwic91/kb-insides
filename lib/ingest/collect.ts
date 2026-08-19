import { ensureToken, ensureOwnUserId, ensureConnectionToken } from "../kickbase/session";
import {
  fetchRanking,
  fetchAllTransfers,
  fetchLeaguesSelection,
  fetchMarket,
  fetchMeBudget,
  fetchManagerDashboard,
  fetchManagerSquad,
  fetchPlayerMarketValue,
} from "../kickbase/endpoints";
import { politeDelay } from "../kickbase/http";
import { parseLeagueIds } from "../env";
import { parseRanking } from "./ranking";
import { parseTransfers, type TransferRow } from "./transfers";
import { parseLeaguesSelection } from "./leaguesSelection";
import { parseMarket } from "./market";
import { reconstructCash } from "../compute/reconstruct";
import { START_BUDGET } from "../compute/constants";
import {
  upsertLeague,
  upsertLeagues,
  upsertManagers,
  upsertManagerSnapshots,
  upsertTransfers,
  upsertPlayers,
  upsertMarketLog,
  upsertPlayerMv,
  upsertCalibration,
  markIsMe,
  getLeagueMoneyBasis,
  replaceSquadPlayers,
  upsertManagerTvDaily,
  upsertPlayerMvDaily,
  getBuyTransfersMissingMvLeague,
  updateTransferMvAtTime,
  type SquadPlayerRow,
  type ManagerTvDailyRow,
  type PlayerMvDailyRow,
} from "../db/ingest";
import {
  getCollectionTargets,
  getUserLeagues,
  upsertUserBudget,
  reconcileLeagueAccess,
} from "../db/connections";
import type { PlayerRow } from "./market";
import { syncExternalInjuries } from "./externalNews";
import { probeFullPool } from "../kickbase/probeFullPool";

const SQUAD_POS: Record<number, string> = { 1: "TW", 2: "ABW", 3: "MF", 4: "ANG" };
const posLabel = (pos: number | null | undefined): string | null =>
  pos == null ? null : (SQUAD_POS[pos] ?? String(pos));

/**
 * Collector. Multi-User (Phase 3): iteriert über die aktiven Kickbase-
 * Verbindungen (`kb_connections`), sammelt jede aktive Liga GENAU EINMAL
 * (Dedupe) liga-weit und zieht je Verbindung zusätzlich den exakten eigenen
 * Kontostand (/me/budget) nach `user_budget` (nutzer-privat).
 *
 * Fällt auf den alten env-basierten Single-User-Pfad zurück, solange es keine
 * Verbindungen gibt (Übergangsphase). Siehe docs/MULTI_USER_DESIGN.md §8.
 */

export interface LeagueIngestResult {
  leagueId: string;
  name?: string;
  day?: number | null;
  managers?: number;
  snapshots?: number;
  transfers?: number;
  market?: number;
  calibrationDelta?: number | null;
  error?: string;
  /** Stille Pro-Manager-Fehler (squad/dashboard/transfer), max. 5. */
  warnings?: string[];
}

// ---------- Liga-weite Sammlung (geteilt von allen Pfaden) ----------

/**
 * Sammelt eine Liga liga-weit: Ranking → Transfers/Squad je Manager → Markt.
 * KEINE nutzer-privaten Daten (kein /me/budget, keine Kalibrierung, kein is_me).
 * Fehler bleiben auf die Liga isoliert (`error` im Ergebnis).
 */
async function collectLeagueWide(
  leagueId: string,
  token: string,
  opts: { recordDailyTv?: boolean } = {},
): Promise<LeagueIngestResult> {
  try {
    // M2 — Ranking.
    const ranking = await fetchRanking(leagueId, { token });
    const rows = parseRanking(ranking, leagueId);
    await upsertLeague(rows.league);
    await upsertManagers(rows.managers);
    const day = rows.snapshots[0]?.day ?? null;

    // Basis-Snapshots SOFORT schreiben (Timeout-Sicherheit) — bevor die teure
    // Pro-Manager-Schleife läuft.
    await upsertManagerSnapshots(rows.snapshots);
    await politeDelay();

    const snapById = new Map(rows.snapshots.map((s) => [s.manager_id, s]));
    const { trackingSince } = await getLeagueMoneyBasis(leagueId);

    let transferCount = 0;
    const squadPlayers: SquadPlayerRow[] = [];
    const squadPlayerMeta: PlayerRow[] = [];
    const warnings: string[] = [];
    const warn = (msg: string) => {
      if (warnings.length < 5) warnings.push(msg);
    };
    const hasTv = (n: number | null) => n != null && n > 0;

    for (const manager of rows.managers) {
      const snap = snapById.get(manager.id);
      if (snap) {
        try {
          const squad = await fetchManagerSquad(leagueId, manager.id, { token });
          snap.squad_size = squad.it.length;
          let sum = 0;
          for (const pl of squad.it) {
            sum += pl.mv ?? 0;
            if (pl.pi == null) continue;
            squadPlayers.push({
              league_id: leagueId,
              player_id: pl.pi,
              manager_id: manager.id,
              // Squad-Endpoint liefert keine Punkte → aus anderen Quellen (null hier).
              points: null,
              avg_points: null,
              market_value: pl.mv ?? null,
              position: posLabel(pl.pos),
              status: pl.st ?? null,
            });
            squadPlayerMeta.push({
              id: pl.pi,
              name: pl.pn ?? null,
              team: pl.tid ?? null,
              position: posLabel(pl.pos),
            });
          }
          if (hasTv(sum)) snap.team_value = sum;
        } catch (e) {
          warn(`squad ${manager.id}: ${(e as Error).message}`);
        }
        await politeDelay();

        if (!hasTv(snap.team_value)) {
          try {
            const dash = await fetchManagerDashboard(leagueId, manager.id, { token });
            if (hasTv(dash.tv ?? null)) snap.team_value = dash.tv ?? null;
            snap.points = snap.points ?? dash.tp ?? null;
          } catch (e) {
            warn(`dashboard ${manager.id}: ${(e as Error).message}`);
          }
          await politeDelay();
        }
      }

      try {
        const tr = await fetchAllTransfers(leagueId, manager.id, {
          token,
          since: trackingSince,
        });
        const transferRows = parseTransfers(tr, leagueId, manager.id);
        await upsertTransfers(transferRows);
        transferCount += transferRows.length;
      } catch (e) {
        warn(`transfer ${manager.id}: ${(e as Error).message}`);
      }
      await politeDelay();
    }

    // Angereicherte Snapshots + Kaderbestand.
    await upsertManagerSnapshots(rows.snapshots);
    if (squadPlayerMeta.length > 0) await upsertPlayers(squadPlayerMeta);
    await replaceSquadPlayers(leagueId, squadPlayers);

    // Täglicher Kaderwert je Manager (für den „Veränderung zum Vortag"-Trend).
    // NUR im nächtlichen Cron schreiben (läuft nach dem täglichen Kickbase-MV-
    // Update). Ein manueller Refresh am Vormittag würde den heutigen Tageseimer
    // sonst mit dem Marktwert-Stand von GESTERN (vor dem Update) befüllen — das
    // erzeugt ein irreführendes „0 %" gegenüber dem gestrigen Abend-Snapshot.
    if (opts.recordDailyTv) {
      const snapDate = new Date().toISOString().slice(0, 10);
      const tvDaily: ManagerTvDailyRow[] = rows.snapshots
        .filter((s) => s.team_value != null)
        .map((s) => ({
          league_id: leagueId,
          manager_id: s.manager_id,
          snap_date: snapDate,
          team_value: s.team_value,
        }));
      if (tvDaily.length > 0) await upsertManagerTvDaily(tvDaily);

      // Täglicher Marktwert je Kaderspieler → „Entwicklung seit gestern" für
      // ALLE Manager (nicht nur den eigenen Kader). Kein zusätzlicher API-Call:
      // die Marktwerte stammen aus den bereits geholten Kadern.
      const mvDaily: PlayerMvDailyRow[] = squadPlayers
        .filter((p) => p.market_value != null)
        .map((p) => ({
          league_id: leagueId,
          player_id: p.player_id,
          snap_date: snapDate,
          market_value: p.market_value as number,
        }));
      if (mvDaily.length > 0) await upsertPlayerMvDaily(mvDaily);
    }
    await politeDelay();

    // M6 — Markt.
    let marketCount = 0;
    try {
      const market = await fetchMarket(leagueId, { token });
      const parsed = parseMarket(market, leagueId, new Date().toISOString());
      await upsertPlayers(parsed.players);
      await upsertMarketLog(parsed.marketLog);
      await upsertPlayerMv(parsed.playerMv);
      marketCount = parsed.marketLog.length;
    } catch {
      // Markt-Fehler isolieren.
    }

    return {
      leagueId,
      name: rows.league.name,
      day,
      managers: rows.managers.length,
      snapshots: rows.snapshots.length,
      transfers: transferCount,
      market: marketCount,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (e) {
    return { leagueId, error: (e as Error).message };
  }
}

const EPOCH_DAY_MS = 86_400_000;

/**
 * Backfill des Marktwerts zum Kaufzeitpunkt (Overpay-Basis) für die eigenen
 * Käufe eines Managers. Gedeckelt (cap) und pro Spieler gecacht — eine
 * MV-Kurve je Spieler pro Lauf. Läuft best-effort; Fehler werden ignoriert.
 */
async function backfillOverpay(
  leagueId: string,
  token: string,
  cap = 40,
): Promise<void> {
  // Liga-weit (alle Manager), jüngste Käufe zuerst — Basis fürs Panik-Barometer.
  const missing = await getBuyTransfersMissingMvLeague(leagueId, cap);
  if (missing.length === 0) return;

  const curves = new Map<string, { d: number; mv: number }[]>();
  for (const t of missing) {
    if (!curves.has(t.player_id)) {
      try {
        const raw = await fetchPlayerMarketValue(leagueId, t.player_id, "365", { token });
        const pts = (raw.it ?? [])
          .filter((p) => p.dt != null && p.mv != null)
          .map((p) => ({ d: p.dt as number, mv: p.mv as number }))
          .sort((a, b) => a.d - b.d);
        curves.set(t.player_id, pts);
      } catch {
        curves.set(t.player_id, []);
      }
      await politeDelay();
    }
    const pts = curves.get(t.player_id) ?? [];
    if (pts.length === 0) continue;
    const targetDay = Math.floor(Date.parse(t.ts) / EPOCH_DAY_MS);
    let mv: number | null = null;
    for (const p of pts) {
      if (p.d <= targetDay) mv = p.mv;
      else break;
    }
    if (mv == null) mv = pts[0]!.mv; // Kauf vor dem ersten Kurvenpunkt → frühester MW
    await updateTransferMvAtTime(leagueId, t.id, mv);
  }
}

/** Nutzer-privater exakter Kontostand (/me/budget) → user_budget. */
async function collectUserBudget(
  userId: string,
  leagueId: string,
  token: string,
  day: number,
): Promise<void> {
  const budget = await fetchMeBudget(leagueId, { token });
  await upsertUserBudget(userId, leagueId, day, budget.b);
}

// ---------- Multi-User-Einstieg ----------

export async function runCollect(): Promise<{ leagues: LeagueIngestResult[] }> {
  const targets = await getCollectionTargets();

  // Übergangsphase: keine Verbindungen → alter env-basierter Pfad.
  if (targets.length === 0) return runCollectLegacy();

  // Token je Nutzer nur einmal beschaffen (mehrere Ligen teilen ein Token).
  const userToken = new Map<string, string | null>();
  const tokenFor = async (userId: string): Promise<string | null> => {
    if (userToken.has(userId)) return userToken.get(userId)!;
    let t: string | null = null;
    try {
      t = await ensureConnectionToken(userId);
    } catch {
      t = null; // ensureConnectionToken markiert needs_reconnect
    }
    userToken.set(userId, t);
    return t;
  };

  // Ligen deduplizieren: je Liga ein (erstes gesundes) Token.
  const leagueToken = new Map<string, string>();
  const budgetTasks: { userId: string; kbUserId: string; leagueId: string; token: string }[] = [];
  for (const t of targets) {
    const token = await tokenFor(t.userId);
    if (!token) continue;
    if (!leagueToken.has(t.leagueId)) leagueToken.set(t.leagueId, token);
    budgetTasks.push({ userId: t.userId, kbUserId: t.kbUserId, leagueId: t.leagueId, token });
  }

  const leagues: LeagueIngestResult[] = [];
  const leagueDay = new Map<string, number | null>();
  for (const [leagueId, token] of leagueToken) {
    // Nächtlicher Cron → Tages-Snapshot des Kaderwerts schreiben.
    const r = await collectLeagueWide(leagueId, token, { recordDailyTv: true });
    leagueDay.set(leagueId, r.day ?? null);
    leagues.push(r);
    await politeDelay();
  }

  // Overpay-Backfill EINMAL je Liga (liga-weit, nicht je Nutzer).
  for (const [leagueId, token] of leagueToken) {
    try {
      await backfillOverpay(leagueId, token);
    } catch {
      // Overpay-Backfill best-effort.
    }
  }

  // Pro (Nutzer, Liga): exakter eigener Kontostand.
  for (const t of budgetTasks) {
    const day = leagueDay.get(t.leagueId);
    if (day == null) continue;
    try {
      await collectUserBudget(t.userId, t.leagueId, t.token, day);
    } catch {
      // /me/budget-Fehler pro Nutzer isolieren.
    }
    await politeDelay();
  }

  // Externe Ausfälle (api-football) einmal pro Lauf, mit Freshness-Guard.
  try {
    await syncExternalInjuries();
  } catch {
    // externe News best-effort.
  }

  // Voll-Pool-Endpunkt-Discovery (einmalig, Freshness-Guard) — für Markt-Potenzial.
  const anyToken = [...leagueToken.values()][0];
  if (anyToken) {
    try {
      await probeFullPool(anyToken);
    } catch {
      // Discovery best-effort.
    }
  }

  return { leagues };
}

/**
 * Authentifizierter Refresh EINES Nutzers. Ohne `leagueId` werden alle aktiven
 * Ligen des Nutzers gesammelt, mit `leagueId` nur diese (sofern der Nutzer
 * Zugriff hat) — je Liga inkl. exaktem Kontostand.
 */
export async function runCollectForUser(
  userId: string,
  leagueId?: string,
): Promise<LeagueIngestResult[]> {
  let token: string;
  try {
    token = await ensureConnectionToken(userId);
  } catch {
    return [{ leagueId: "", error: "Keine gültige Kickbase-Verbindung." }];
  }

  // Abgleich: in Kickbase verlassene Ligen aus league_access entfernen.
  try {
    const sel = await fetchLeaguesSelection({ token });
    const selIds = parseLeaguesSelection(sel).map((l) => l.id);
    if (selIds.length > 0) await reconcileLeagueAccess(userId, selIds);
  } catch {
    // best-effort — Abgleich darf den Sammel-Lauf nicht verhindern.
  }

  const leagues = await getUserLeagues(userId);
  if (leagues.length === 0) return [{ leagueId: "", error: "Keine aktive Liga." }];

  const targets = leagueId ? leagues.filter((l) => l.leagueId === leagueId) : leagues;
  if (targets.length === 0) return [{ leagueId: leagueId ?? "", error: "Liga nicht aktiv." }];

  const results: LeagueIngestResult[] = [];
  for (const l of targets) {
    const r = await collectLeagueWide(l.leagueId, token);
    if (r.day != null) {
      try {
        await collectUserBudget(userId, l.leagueId, token, r.day);
      } catch {
        // isolieren
      }
    }
    try {
      await backfillOverpay(l.leagueId, token);
    } catch {
      // Overpay-Backfill best-effort (liga-weit).
    }
    results.push(r);
    await politeDelay();
  }

  // Externe Ausfälle (api-football) — einmal pro Refresh, Freshness-Guard schützt das Limit.
  try {
    await syncExternalInjuries();
  } catch {
    // externe News best-effort.
  }

  // Voll-Pool-Endpunkt-Discovery (einmalig, Freshness-Guard) — für Markt-Potenzial.
  try {
    await probeFullPool(token);
  } catch {
    // Discovery best-effort.
  }

  return results;
}

/** Gezielter liga-weiter Lauf (CRON_SECRET-Pfad, env-Token, ohne Kontostand). */
export async function runCollectLeague(leagueId: string): Promise<LeagueIngestResult> {
  const token = await ensureToken();
  return collectLeagueWide(leagueId, token);
}

// ---------- Legacy: env-basierter Single-User-Pfad (Übergang) ----------

/**
 * Ermittelt alle einzusammelnden Ligen: /selection (alle Ligen des Nutzers,
 * wird zugleich in `leagues` upgesertet) vereint mit KICKBASE_LEAGUE_IDS.
 */
export async function discoverLeagues(token: string): Promise<string[]> {
  let discovered: string[] = [];
  try {
    const selection = await fetchLeaguesSelection({ token });
    const parsed = parseLeaguesSelection(selection);
    await upsertLeagues(parsed);
    discovered = parsed.map((l) => l.id);
    await politeDelay();
  } catch {
    // /selection nicht kritisch — Fallback ist KICKBASE_LEAGUE_IDS.
  }
  const configured = parseLeagueIds();
  return [...new Set([...discovered, ...configured])];
}

async function runCollectLegacy(): Promise<{ leagues: LeagueIngestResult[] }> {
  const token = await ensureToken();
  const ownId = await ensureOwnUserId();

  const leagueIds = await discoverLeagues(token);
  if (leagueIds.length === 0) {
    throw new Error(
      "Keine Ligen zum Einsammeln: /selection lieferte nichts und KICKBASE_LEAGUE_IDS ist leer.",
    );
  }

  const leagues: LeagueIngestResult[] = [];
  for (const leagueId of leagueIds) {
    // Legacy-Pfad ist der env-basierte Cron → Tages-Snapshot schreiben.
    const r = await collectLeagueWide(leagueId, token, { recordDailyTv: true });
    // Legacy: is_me + eigene Kalibrierung (env-Operator).
    if (!r.error && ownId) {
      try {
        await legacyOwnCalibration(leagueId, token, ownId, r.day ?? null);
      } catch {
        // isolieren
      }
    }
    leagues.push(r);
  }
  return { leagues };
}

/** Legacy §8 — env-Operator: exaktes /me/budget + Kalibrierung (Single-User). */
async function legacyOwnCalibration(
  leagueId: string,
  token: string,
  ownId: string,
  day: number | null,
): Promise<void> {
  await markIsMe(leagueId, ownId);
  if (day == null) return;
  const { startBudget, trackingSince } = await getLeagueMoneyBasis(leagueId);
  const budget = await fetchMeBudget(leagueId, { token });
  const myActual = budget.b;

  const tr = await fetchAllTransfers(leagueId, ownId, { token, since: trackingSince });
  const ownTransfers: TransferRow[] = parseTransfers(tr, leagueId, ownId);
  const myReconstructed = reconstructCash(ownTransfers, {
    startBudget: startBudget ?? START_BUDGET,
  });
  await upsertCalibration({
    league_id: leagueId,
    day,
    my_reconstructed: myReconstructed,
    my_actual: myActual,
    delta: myReconstructed - myActual,
  });
}
