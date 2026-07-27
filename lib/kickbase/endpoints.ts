import { kbFetch, politeDelay, type KbFetchOptions } from "./http";
import { paginateTransfers } from "../ingest/transfers";
import {
  RankingSchema,
  OverviewSchema,
  MeBudgetSchema,
  TransfersSchema,
  LeaguesSelectionSchema,
  MarketSchema,
  ManagerDashboardSchema,
  SquadSchema,
  PlayerMarketValueSchema,
  type Ranking,
  type Overview,
  type MeBudget,
  type Transfers,
  type LeaguesSelection,
  type Market,
  type ManagerDashboard,
  type Squad,
  type PlayerMarketValue,
} from "./schemas";

/**
 * Typisierte, zod-validierte Wrapper für die ligagebundenen Endpunkte (SPEC §6).
 * Feldnamen sind an den echten Fixtures (Checkpoint B) verifiziert.
 */

interface EndpointOptions extends KbFetchOptions {
  token: string;
}

/** `/v4/leagues/{lid}/ranking` — optional für einen bestimmten Spieltag. */
export async function fetchRanking(
  leagueId: string,
  opts: EndpointOptions & { dayNumber?: number },
): Promise<Ranking> {
  const { dayNumber, ...fetchOpts } = opts;
  const path =
    dayNumber != null
      ? `/v4/leagues/${leagueId}/ranking?dayNumber=${dayNumber}`
      : `/v4/leagues/${leagueId}/ranking`;
  const raw = await kbFetch<unknown>(path, fetchOpts);
  return RankingSchema.parse(raw);
}

/** `/v4/leagues/{lid}/overview` — Liga-Metadaten. */
export async function fetchOverview(leagueId: string, opts: EndpointOptions): Promise<Overview> {
  const raw = await kbFetch<unknown>(`/v4/leagues/${leagueId}/overview`, opts);
  return OverviewSchema.parse(raw);
}

/** `/v4/leagues/{lid}/me/budget` — exakter eigener Kontostand. */
export async function fetchMeBudget(leagueId: string, opts: EndpointOptions): Promise<MeBudget> {
  const raw = await kbFetch<unknown>(`/v4/leagues/${leagueId}/me/budget`, opts);
  return MeBudgetSchema.parse(raw);
}

/** `/v4/leagues/{lid}/managers/{mid}/transfer` — Transfers eines Managers. */
export async function fetchTransfers(
  leagueId: string,
  managerId: string,
  opts: EndpointOptions,
): Promise<Transfers> {
  const raw = await kbFetch<unknown>(
    `/v4/leagues/${leagueId}/managers/${managerId}/transfer`,
    opts,
  );
  return TransfersSchema.parse(raw);
}

/**
 * Volle Transferhistorie eines Managers — paginiert über den `start`-Offset
 * (Seitengröße 25). Für die vollständige Kontorekonstruktion nötig, sobald ein
 * Manager mehr als 25 Transfers hat.
 */
export async function fetchAllTransfers(
  leagueId: string,
  managerId: string,
  opts: EndpointOptions & { maxPages?: number; since?: string | null },
): Promise<Transfers> {
  const { maxPages, since, ...fetchOpts } = opts;
  const sinceMs = since ? Date.parse(since) : null;
  const olderThanCutoff = (dt?: string) =>
    sinceMs != null && dt != null && Date.parse(dt) < sinceMs;

  const items = await paginateTransfers(
    async (start) => {
      const q = start > 0 ? `?start=${start}` : "";
      const raw = await kbFetch<unknown>(
        `/v4/leagues/${leagueId}/managers/${managerId}/transfer${q}`,
        fetchOpts,
      );
      return TransfersSchema.parse(raw).it;
    },
    {
      maxPages,
      onPage: politeDelay,
      // Transfers sind absteigend (neu → alt). Ist der letzte Eintrag einer
      // Seite älter als der Tracking-Start, gibt es davor nichts Relevantes mehr.
      stopAfter:
        sinceMs == null ? undefined : (page) => olderThanCutoff(page[page.length - 1]?.dt),
    },
  );

  const filtered = sinceMs == null ? items : items.filter((t) => !olderThanCutoff(t.dt));
  return { u: managerId, it: filtered };
}

/** `/v4/leagues/selection` — alle Ligen des Nutzers. */
export async function fetchLeaguesSelection(
  opts: EndpointOptions,
): Promise<LeaguesSelection> {
  const raw = await kbFetch<unknown>(`/v4/leagues/selection`, opts);
  return LeaguesSelectionSchema.parse(raw);
}

/**
 * `/v4/leagues/{lid}/managers/{mid}/dashboard` — Kaderwert (`tv`), Gesamtpunkte
 * (`tp`) und Prämien (`prft`) eines Managers. Quelle für den Kaderwert, wenn das
 * Ranking ihn (früh in der Saison) noch nicht führt.
 */
export async function fetchManagerDashboard(
  leagueId: string,
  managerId: string,
  opts: EndpointOptions,
): Promise<ManagerDashboard> {
  const raw = await kbFetch<unknown>(
    `/v4/leagues/${leagueId}/managers/${managerId}/dashboard`,
    opts,
  );
  return ManagerDashboardSchema.parse(raw);
}

/** `/v4/leagues/{lid}/managers/{mid}/squad` — Kader eines Managers (für Kadergröße + Spielerstatus). */
export async function fetchManagerSquad(
  leagueId: string,
  managerId: string,
  opts: EndpointOptions,
): Promise<Squad> {
  const raw = await kbFetch<unknown>(
    `/v4/leagues/${leagueId}/managers/${managerId}/squad`,
    opts,
  );
  return SquadSchema.parse(raw);
}

/** `/v4/leagues/{lid}/market` — aktuelles Marktangebot. */
export async function fetchMarket(leagueId: string, opts: EndpointOptions): Promise<Market> {
  const raw = await kbFetch<unknown>(`/v4/leagues/${leagueId}/market`, opts);
  return MarketSchema.parse(raw);
}

/**
 * `/v4/leagues/{lid}/players/{pid}/marketvalue/{timeframe}` — Marktwert-Kurve
 * eines Spielers über den angegebenen Zeitraum (z. B. "365" Tage). Punkte in
 * `it[]` mit `dt` (epoch-Tage) und `mv`, dazu Low/High/Trend.
 */
export async function fetchPlayerMarketValue(
  leagueId: string,
  playerId: string,
  timeframe: string,
  opts: EndpointOptions,
): Promise<PlayerMarketValue> {
  const raw = await kbFetch<unknown>(
    `/v4/leagues/${leagueId}/players/${playerId}/marketvalue/${timeframe}`,
    opts,
  );
  return PlayerMarketValueSchema.parse(raw);
}
