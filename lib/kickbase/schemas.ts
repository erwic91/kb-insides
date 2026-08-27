import { z } from "zod";

/**
 * zod-Schemas für die Kickbase-v4-Antworten (verifiziert an den echten Fixtures
 * unter /fixtures, Checkpoint B). Kickbase nutzt kurze, kryptische Keys und
 * liefert je nach Manager-Aktivität unterschiedlich viele Felder — deshalb sind
 * fast alle Felder optional und die Objekte `.passthrough()` (unbekannte Felder
 * überleben, statt die Validierung zu sprengen).
 */

/** Ein Manager-Eintrag im Ranking (`us[]`). Inaktive Manager haben kein tv/sp. */
export const RankingUserSchema = z
  .object({
    i: z.string(), // Manager-/User-ID (in v4 global, aber je Liga eigene Daten)
    n: z.string().optional(), // Anzeigename
    // Zahlenfelder sind in der frühen Saison teils `null` (nicht nur abwesend) —
    // `nullish` akzeptiert number | null | undefined; der Parser macht `?? null`.
    tv: z.number().nullish(), // Kaderwert (Team Value)
    sp: z.number().nullish(), // Saisonpunkte
    spl: z.number().nullish(), // Saison-Platzierung
    mdp: z.number().nullish(), // Spieltagspunkte
    mdpl: z.number().nullish(), // Spieltags-Platzierung
    lp: z.array(z.number().nullable()).nullish(), // Punkte je Spieltag (Serie), früh mit null
    adm: z.boolean().optional(),
    uim: z.string().optional(),
  })
  .passthrough();
export type RankingUser = z.infer<typeof RankingUserSchema>;

/** Antwort von `/v4/leagues/{lid}/ranking`. */
export const RankingSchema = z
  .object({
    ti: z.string().optional(), // Liga-Titel
    day: z.number(), // aktueller Spieltag (dayNumber)
    sn: z.string().optional(), // Saison, z. B. "25/26"
    us: z.array(RankingUserSchema), // Manager
  })
  .passthrough();
export type Ranking = z.infer<typeof RankingSchema>;

/** Antwort von `/v4/leagues/{lid}/overview` (Teilmenge, die wir nutzen). */
export const OverviewSchema = z
  .object({
    i: z.string().optional(), // Liga-ID
    lnm: z.string().optional(), // Liga-Name
    cpn: z.string().optional(), // Wettbewerbsname ("Bundesliga")
    mgc: z.number().optional(), // Mitgliederzahl
  })
  .passthrough();
export type Overview = z.infer<typeof OverviewSchema>;

/** Antwort von `/v4/leagues/{lid}/me/budget` — exakter eigener Kontostand. */
export const MeBudgetSchema = z
  .object({
    b: z.number(), // Kontostand in ganzen Euro
  })
  .passthrough();
export type MeBudget = z.infer<typeof MeBudgetSchema>;

/**
 * Antwort von `/v4/leagues/{lid}/managers/{mid}/dashboard`.
 * Trägt Kaderwert + Punkte auch dann, wenn das Ranking sie (früh in der Saison)
 * nicht liefert. `prft` = Prämien/Gewinn (Checkpoint C), `ph` = Punkte-Historie.
 */
export const ManagerDashboardSchema = z
  .object({
    u: z.string().optional(), // Manager-ID
    tv: z.number().nullish(), // Kaderwert (Team Value)
    tp: z.number().nullish(), // Gesamtpunkte der Saison
    ap: z.number().nullish(), // Ø-Punkte
    pl: z.number().nullish(), // Platzierung
    mdw: z.number().nullish(), // Spieltagssiege
    prft: z.number().nullish(), // Prämien/Gewinn
    ph: z.array(z.number().nullable()).nullish(), // Punkte je Spieltag
  })
  .passthrough();
export type ManagerDashboard = z.infer<typeof ManagerDashboardSchema>;

/**
 * Ein Spieler im Kader (`squad.it[]`). Bewusst SEHR tolerant: die echte Shape
 * variiert (Feldtypen, null vs. fehlend), und wir brauchen nur Anzahl (Länge)
 * + Marktwert. Ein strenges Schema warf bei nicht-leeren Kadern → squad_size
 * blieb null. `coerce` + `nullish` + `passthrough` lässt reale Objekte durch.
 */
export const SquadPlayerSchema = z
  .object({
    pi: z.coerce.string().nullish(), // Spieler-ID (echtes Feld: `pi`, NICHT `i`)
    pn: z.coerce.string().nullish(), // Nachname (echtes Feld: `pn`, NICHT `n`)
    pos: z.coerce.number().nullish(), // Position
    mv: z.coerce.number().nullish(), // Marktwert
    st: z.coerce.number().nullish(), // Status (0 = fit; >0 = Ausfall/angeschlagen)
    lst: z.coerce.number().nullish(), // Aufstellungs-Status
    lo: z.coerce.number().nullish(), // Lineup-Order (0 = TW, 1..10 = Feld; fehlt = Bank)
    tid: z.coerce.string().nullish(), // Team-ID
    // Hinweis: Der Squad-Endpoint liefert KEINE Punkte (kein `p`/`ap`),
    // nur Marktwert-Felder (mvt/mvgl/sdmvt/…). Punkte kommen aus anderen Quellen.
  })
  .passthrough();

/** Antwort von `/v4/leagues/{lid}/managers/{mid}/squad`. */
export const SquadSchema = z
  .object({
    it: z.array(SquadPlayerSchema).default([]),
  })
  .passthrough();
export type Squad = z.infer<typeof SquadSchema>;
export type SquadPlayer = z.infer<typeof SquadPlayerSchema>;

/** Ein Transfer (`it[]`) aus `/v4/leagues/{lid}/managers/{mid}/transfer`. */
export const TransferItemSchema = z
  .object({
    dt: z.string(), // Zeitpunkt (ISO)
    pi: z.string(), // Spieler-ID
    pn: z.string().optional(), // Spielername
    tid: z.string().optional(), // Team-ID
    trp: z.number(), // Transferpreis in ganzen Euro
    tty: z.number(), // Typ: 1 = Kauf, 2 = Verkauf (verifiziert, SPEC §12)
  })
  .passthrough();
export type TransferItem = z.infer<typeof TransferItemSchema>;

/** Antwort von `/v4/leagues/{lid}/managers/{mid}/transfer`. */
export const TransfersSchema = z
  .object({
    u: z.string().optional(), // Manager-/User-ID
    it: z.array(TransferItemSchema), // Transfers (i. d. R. auf die letzten ~25 begrenzt)
  })
  .passthrough();
export type Transfers = z.infer<typeof TransfersSchema>;

/** Eine Liga aus `/v4/leagues/selection` (`it[]`). */
export const LeagueSelectionItemSchema = z
  .object({
    i: z.string(), // Liga-ID
    n: z.string(), // Name
    b: z.number().optional(), // eigenes Budget in dieser Liga
    idf: z.boolean().optional(), // is default league
    gpm: z.number().optional(), // Spielmodus: 2 = Manager-Liga, 1 = Classic/Public
  })
  .passthrough();

/** Antwort von `/v4/leagues/selection` — alle Ligen des Nutzers. */
export const LeaguesSelectionSchema = z
  .object({
    it: z.array(LeagueSelectionItemSchema),
  })
  .passthrough();
export type LeaguesSelection = z.infer<typeof LeaguesSelectionSchema>;

/** Ein Marktangebot (`it[]`) aus `/v4/leagues/{lid}/market`. */
export const MarketItemSchema = z
  .object({
    i: z.string(), // Spieler-ID
    n: z.string().optional(), // Nachname
    fn: z.string().optional(), // Vorname
    p: z.number().optional(), // Punkte
    pos: z.number().optional(), // Position (1 TW .. 4 ANG)
    tid: z.string().optional(), // Team-ID
    mv: z.number().optional(), // Marktwert
    prc: z.number().optional(), // Preis / Angebotspreis
    mvt: z.number().optional(), // Marktwert-Trend (1 steigt, 2 fällt)
    dt: z.string().optional(), // Ablauf des Listings (Listing-Identität)
    u: z
      .object({ i: z.string(), n: z.string().optional() })
      .passthrough()
      .optional(), // Anbieter (Manager); fehlt = Kickbase/Computer
  })
  .passthrough();
export type MarketItem = z.infer<typeof MarketItemSchema>;

/** Antwort von `/v4/leagues/{lid}/market`. */
export const MarketSchema = z
  .object({
    day: z.number().optional(),
    dt: z.string().optional(),
    it: z.array(MarketItemSchema),
  })
  .passthrough();
export type Market = z.infer<typeof MarketSchema>;

/**
 * Ein Marktwert-Punkt (`it[]`) aus
 * `/v4/leagues/{lid}/players/{pid}/marketvalue/{timeframe}`.
 * Bewusst SEHR tolerant (analog zu `SquadPlayerSchema`): die reale Shape variiert
 * (Feldtypen, null vs. fehlend). `dt` sind Tage seit 1970-01-01 (epoch-Tage) —
 * Date = `new Date(dt * 86_400_000)`; `mv` ist der Marktwert an diesem Tag.
 */
export const MarketValuePointSchema = z
  .object({
    dt: z.coerce.number().nullish(), // Zeitpunkt in epoch-Tagen
    mv: z.coerce.number().nullish(), // Marktwert
  })
  .passthrough();
export type MarketValuePoint = z.infer<typeof MarketValuePointSchema>;

/** Antwort von `/v4/leagues/{lid}/players/{pid}/marketvalue/{timeframe}`. */
export const PlayerMarketValueSchema = z
  .object({
    it: z.array(MarketValuePointSchema).default([]), // Punkte (aufsteigend)
    lmv: z.coerce.number().nullish(), // niedrigster Marktwert im Zeitraum
    hmv: z.coerce.number().nullish(), // höchster Marktwert im Zeitraum
    trp: z.coerce.number().nullish(), // Trend-/Prozentwert
  })
  .passthrough();
export type PlayerMarketValue = z.infer<typeof PlayerMarketValueSchema>;

/** Ein Spieler im Team-Profil (`it[]`) — nur die für den Pool nötigen Felder. */
export const TeamProfilePlayerSchema = z
  .object({
    i: z.string(), // Spieler-ID
    mv: z.coerce.number().nullish(), // Marktwert
  })
  .passthrough();

/** Antwort von `/v4/competitions/{cid}/teams/{teamId}/teamprofile`. */
export const TeamProfileSchema = z
  .object({
    tid: z.string().nullish(), // Team-ID
    tn: z.string().nullish(), // Teamname
    tv: z.coerce.number().nullish(), // Teamwert (Σ MV)
    it: z.array(TeamProfilePlayerSchema).default([]), // Spieler
  })
  .passthrough();
export type TeamProfile = z.infer<typeof TeamProfileSchema>;
