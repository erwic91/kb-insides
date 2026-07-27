# Build-Auftrag für Claude Code — „Ligamonitor"

**So nutzt du das:** Lege diese Datei zusammen mit `SPEC.md` und den fünf Prototyp-HTML-Dateien (`dashboard.html`, `liga.html`, `marktradar.html`, `manager.html`, `player.html`) ins Repo-Root. Starte Claude Code und gib als ersten (und einzigen) Auftrag: *„Lies `CLAUDE_CODE_PROMPT.md` und `SPEC.md` vollständig und arbeite die Meilensteine M0–M7 der Reihe nach ab. Halte nur an den mit 🔴 markierten HUMAN CHECKPOINTS an."*

---

## 0. Rolle & Ziel

Du baust „Ligamonitor" — ein Web-Tool, das eine Kickbase-Liga auswertet, um **maximal viele Insights über die Mitmanager** zu liefern (Kontostände, Maximalgebote, Overpay, Markt-Rückkehr-Prognosen). Es ist **kein** Analysetool für den eigenen Kader.

Die vollständige Fachlogik steht in **`SPEC.md`** — lies sie zuerst und behandle sie als verbindliche Quelle für Datenmodell, Formeln, Endpunkte und Verifikationsregeln. Dieses Dokument regelt Stack, Struktur, Arbeitsweise und Meilensteine.

## 1. Verbindlicher Tech-Stack (nicht abweichen)

- **Next.js** (App Router) mit **TypeScript**, deploybar auf **Vercel**.
- **Supabase** (Postgres) als Datenspeicher. Zugriff über `@supabase/supabase-js`, serverseitig mit Service-Role-Key.
- **Vercel Cron** für den täglichen Collector (geschützte Route `/api/cron/collect`).
- **zod** für Response-Validierung, **vitest** für Tests.
- Paketmanager: `pnpm`.

## 2. Verbindliche Regeln (Guardrails)

1. **Secrets niemals committen.** Zugangsdaten gehören in die **Vercel-Env-Variablen** (Project → Settings → Environment Variables) — das ist der maßgebliche Ort für Betrieb und Deployment. `.env*` gehört in `.gitignore`. Kein Passwort, Token oder Key im Code oder in Commits.
2. **Inoffizielle API respektvoll behandeln:** 1 Lauf/Tag, sequvia Requests mit kleiner Pause, exponentielles Backoff bei Fehlern, realistischer User-Agent, bei Sperr-/403-/429-Signalen abbrechen statt hämmern.
3. **Keine Fake-/Demo-Daten in Produktionspfaden.** Die Prototyp-Zahlen sind nur visuelle Referenz. Live-Daten kommen aus Supabase; Tests laufen gegen Fixtures.
4. **Nach jedem Meilenstein:** `pnpm typecheck`, `pnpm test`, dann committen mit aussagekräftiger Message. Erst dann weiter.
5. **Autonom arbeiten** — außer an den 🔴 HUMAN CHECKPOINTS. Dort anhalten, klar sagen was du vom Menschen brauchst, und warten.
6. **Aktuelle Doku prüfen:** Wenn du bei Vercel-Cron-, Supabase- oder Next.js-Konfiguration unsicher bist, konsultiere die offizielle Doku (Stand kann neuer sein als dein Training). Rate nicht bei Config.
7. **Idempotenz:** Der Collector muss mehrfach am selben Tag laufen können, ohne Daten zu duplizieren (Upserts auf die Primärschlüssel aus §5 der SPEC).

## 3. Umgebungsvariablen

```
# Kickbase (vom Menschen zu setzen)
KICKBASE_EMAIL=
KICKBASE_PASSWORD=
KICKBASE_LEAGUE_IDS=   # kommaseparierte Liste aller Ligen, z. B. 123,456,789

# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Cron-Schutz (Vercel setzt CRON_SECRET in Prod automatisch; lokal selbst setzen)
CRON_SECRET=
```

Lege eine `.env.example` mit allen Keys (ohne Werte) an.

**Wo die Werte hingehören (hosted-first):**
- Alle sechs Variablen werden in **Vercel** gesetzt (Project → Settings → Environment Variables), Scope Production (für den Cron) und Preview.
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` werden **in Supabase** abgelesen (Project Settings → API: „Project URL" bzw. „service_role"-Key) und nach Vercel kopiert. In Supabase selbst müssen keine App-Env-Variablen gesetzt werden (kein Edge-Function-Einsatz — der Server läuft als Next.js-Route auf Vercel).
- `CRON_SECRET` setzt Vercel für den Cron automatisch; für manuelles Auslösen geschützter Routen einen eigenen Wert vergeben.

## 4. Repo-Struktur (Vorschlag)

```
/app
  /(pages)/page.tsx            # Dashboard  (Route: /)
  /liga/page.tsx
  /markt/page.tsx
  /manager/[id]/page.tsx
  /player/[id]/page.tsx
  /api/cron/collect/route.ts   # Vercel-Cron-Ziel (GET)
/lib
  /kickbase/                   # API-Client: login, refresh, typed endpoints, zod-Schemas
  /db/                         # supabase-Client (server), Query-Helfer
  /compute/                    # Rekonstruktion, Maximalgebot, Overpay, Prognose, Kalibrierung
  /design/                     # aus dem Prototyp portierte CSS-Tokens + Chart-Funktionen
/supabase/migrations/          # SQL-Migrationen (Schema aus §5 SPEC)
/fixtures/                     # echte, einmalig abgegriffene JSON-Antworten
/scripts/capture-fixtures.sh   # greift mit Token alle Endpunkte einmal ab
vercel.json
```

## 5. Datenmodell (Supabase-Migration)

Setze das Schema aus **SPEC §5** als Postgres-Migration um (`/supabase/migrations/0001_init.sql`). Postgres-Umsetzung:

- Tabellen: `players`, `managers`, `manager_snapshots`, `player_mv`, `transfers`, `market_log`, `prizes`, `kb_auth`, `app_settings`, `calibration`.
- Zeitreihen (`manager_snapshots`, `player_mv`, `market_log`) mit zusammengesetzten Primärschlüsseln für Upsert-Idempotenz (siehe SPEC §5).
- `kb_auth` (eine Zeile) speichert Access-/Refresh-Token + Ablaufzeit — der Collector liest/aktualisiert sie hier, damit Tokens Cron-Läufe überdauern.
- **Mehrere Ligen:** Setze das erweiterte Schema aus SPEC §5 um — `leagues`-Tabelle, und `league_id` im Primärschlüssel aller Zeitreihen-/Transaktionstabellen. Manager- und Spieler-IDs sind ligaspezifisch (siehe SPEC). Kein DB-Query ohne Liga-Scope.
- **RLS** auf allen Tabellen aktivieren, **keine** öffentlichen Policies. Aller Zugriff läuft serverseitig über den Service-Role-Key. (Das Tool ist privat.)

## 6. Kickbase-Client (`/lib/kickbase`)

- Basis-URL `https://api.kickbase.com`. Bearer-Auth.
- `login()` → `POST /v4/user/login` mit `{ em, pass, loy:false, rep:{} }`; speichert Access-/Refresh-Token in `kb_auth`.
- `ensureToken()` → refresht via `/v4/user/refreshtokens`, bevor das Token (≈7 Tage) abläuft; nur bei Bedarf.
- Typisierte, zod-validierte Wrapper für die Endpunkte aus **SPEC §6**: `overview`, `ranking(dayNumber)`, `managerTransfers(mid)`, `managerSquad(mid)`, `playerMarketValue(pid, tf)`, `market()`, `meBudget()`, `achievements`.
- Jeder Wrapper: Fixture-fähig (in Tests aus `/fixtures` lesen statt Netz).

## 7. Collector (`/api/cron/collect`)

- **Vercel-Cron-Konfiguration** in `vercel.json`:
  ```json
  { "$schema": "https://openapi.vercel.sh/vercel.json",
    "crons": [ { "path": "/api/cron/collect", "schedule": "0 5 * * *" } ] }
  ```
  (Täglich 05:00 UTC. Hobby-Plan erlaubt genau tägliche Frequenz — passt. Cron läuft nur auf Production-Deployments, UTC.)
- **Auth der Route:** Vercel sendet `Authorization: Bearer <CRON_SECRET>`. Prüfe den Header gegen `process.env.CRON_SECRET`, sonst `401`. Ohne diese Prüfung könnte jeder die Route auslösen.
- Setze `maxDuration` der Route angemessen (z. B. `export const maxDuration = 120`), da ~20–25 sequentielle Requests anfallen; Node-Runtime verwenden.
- **Über alle Ligen iterieren:** Lies `KICKBASE_LEAGUE_IDS`, befülle `leagues` (Namen via User-Liga-Listing), und führe den kompletten Poll-/Compute-Zyklus **pro Liga** aus, jede Zeile mit `league_id`.
- **Ablauf pro Lauf:** `ensureToken` → pro Endpunkt aus SPEC §6 pollen → in Supabase upserten → Berechnungen (§8) → `calibration`-Zeile schreiben. Idempotent.
- Einmaliger **Backfill** aller Spieltage von `/ranking?dayNumber=X` als separates Skript/Route (`/api/cron/backfill`, manuell auslösbar, ebenfalls CRON_SECRET-geschützt).

## 8. Berechnungen (`/lib/compute`) — Formeln aus SPEC §7/§8

- **Kontorekonstruktion:** `Konto = 200_000_000 − Σ Käufe + Σ Verkäufe + Σ Erfolgsprämien`. (Auflaufprämie in dieser Liga deaktiviert → 0; als abschaltbares Flag in `app_settings` vorsehen.)
- **Maximalgebot:** `maxBid = cash + 0.33 * (teamValue + Math.min(cash, 0))`. Konstante `0.33` als benannte, leicht änderbare Konstante (Kalibrierung 0.33 vs. 1/3 offen).
- **Overpay je Kauf:** `price − mv_at_time`; Manager-Kennzahl = Durchschnitt.
- **Realisierter Gewinn:** Kauf/Verkauf desselben `player_id` paaren, **FIFO**; `Verkaufspreis − Einkaufspreis`. Trefferquote = Anteil Gewinn-Verkäufe.
- **Liquidität:** `cash / total`.
- **Markt-Rückkehr-Prognose:** aus `market_log` je Spieler `lastSeenOnMarket`; `nextAppearance = lastSeen + Kadenz` (Kadenz aus `app_settings`, Default 14). Konfidenz aus Anzahl Auftritte + „gerade an Markt verkauft" (aus `transfers`). „Jetzt am Markt" exakt aus aktuellem `market()`.
- **Kalibrierung:** eigene Rekonstruktion vs. `meBudget()`; Delta in `calibration`. Fachliche Bedeutung + Status-Badges: siehe **SPEC §8**. UI-Status pro Zahl: `exakt` / `bestätigt` / `geschätzt`.

## 9. Frontend (Next.js, Design aus dem Prototyp)

- Die fünf Prototyp-HTML-Dateien sind die **visuelle Referenz**. Reproduziere ihr Aussehen **exakt**: CSS-Variablen/Design-Tokens (Farben `--ink/--chalk/--signal/--gain/--loss`, Fonts **Archivo** + **IBM Plex Sans/Mono**), Layout, das Marktband, die SVG-Charts (Area-, Bars-, Line-, Sparkline). Übernimm die CSS und die Chart-Funktionen 1:1 nach `/lib/design`, ersetze nur die hartkodierten Demo-Arrays durch **Live-Daten aus Supabase**.
- Routen: `/` (Dashboard, gegner-zentriert, sortierbare Manager-Tabelle inkl. **Maximalgebot**-Spalte + Insight-Kacheln), `/liga`, `/markt`, `/manager/[id]`, `/player/[id]`. Inhalte je Seite exakt wie in SPEC §9.
- Datenzugriff **serverseitig** (Server Components / Route Handler) über Supabase Service-Role. Kein Service-Key im Client.
- Favoriten & Kadenz-Einstellung in `app_settings` persistieren.
- **Globaler Liga-Switch** in der Topbar auf jeder Seite (SPEC §9): aktive Liga in URL `?league=…` + Default in `app_settings`; jede Query auf `league_id` gefiltert. Beim Wechsel zurück aufs Dashboard der neuen Liga — nie eine ID über Ligen mitnehmen.
- App privat halten (Vercel Deployment Protection oder simple Passwortschranke).

## 10. Meilensteine (autonom abarbeiten, an 🔴 anhalten)

**M0 — Projektgerüst.** Next.js + TS + pnpm, Supabase-Client, `.env.example`, `.gitignore`, `vercel.json`, vitest. `pnpm typecheck` grün. Commit.
🔴 **HUMAN CHECKPOINT A:** Bitte den Menschen, ein **Supabase-Projekt** anzulegen und die sechs Env-Variablen in **Vercel** (Project → Settings → Environment Variables) zu setzen: Kickbase-Zugangsdaten, `KICKBASE_LEAGUE_IDS`, `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (aus Supabase → Settings → API), `CRON_SECRET`. Warte auf Bestätigung.

**M1 — Auth + Smoke-Test.** Kickbase-`login`/`refresh`, Token-Persistenz in `kb_auth`. Smoke-Skript: einloggen, `/me` bzw. `overview` abrufen, Liga-ID + Startbudget ausgeben. Akzeptanz: echter Login liefert Token, Liga-ID stimmt.
🔴 **HUMAN CHECKPOINT B:** Fixture-Abgriff — **hosted, ohne lokalen Lauf.** Nach dem Vercel-Deploy löst der Mensch die geschützte Route `GET /api/dev/capture-fixtures` einmal aus (mit `CRON_SECRET`) und schickt die JSON-Antwort zurück; Claude schreibt daraus die (token-redigierten) Dateien unter `/fixtures/` und committet sie. Alternativ lokal via `pnpm capture-fixtures` (nutzt dieselbe Logik in `lib/kickbase/captureFixtures.ts`). Danach baust du alle Parser/Tests gegen diese Fixtures.

**M2 — Schema + Ranking-Ingest.** Migration aus §5 anwenden. `/ranking` für den aktuellen Spieltag holen, Manager + `manager_snapshots` (Kaderwert, Punkte, Kadergröße) upserten. Tests gegen Fixture. Commit.

**M3 — Backfill.** Alle Spieltage von `/ranking?dayNumber=X` nachladen → Kaderwert-/Punkte-Historie. Idempotent. Commit.

**M4 — Transfers + Rekonstruktion + Kalibrierung.** Transfers ingesten, Kontorekonstruktion + Maximalgebot + Overpay rechnen, `calibration` schreiben. Akzeptanz: **eigene** Rekonstruktion == `meBudget()` auf den Euro.
🔴 **HUMAN CHECKPOINT C:** Zeig dem Menschen das Kalibrierungs-Delta. Erst wenn es 0 (bzw. erklärbar) ist, weitermachen — sonst fehlt ein Einnahmeposten (prüfe: fremde Erfolgsprämien lesbar? `tty`-Mapping? — siehe SPEC §12).

**M4b — Multi-Liga-Fundament.** Stelle sicher, dass `leagues` befüllt ist und der Collector alle Ligen aus `KICKBASE_LEAGUE_IDS` verarbeitet. Verifiziere an zwei Ligen, dass Zeitreihen sauber per `league_id` getrennt liegen (keine Vermischung von Managern/Transfers). Commit.

**M5 — data-Layer → Frontend.** Dashboard + Liga + Manager-Detail an Supabase anschließen, exakt im Prototyp-Design. Maximalgebot-Spalte, sortierbare Tabelle, Insight-Kacheln, **globaler Liga-Switch** (URL + Default). Commit.

**M6 — Markt + Prognose + Favoriten.** `market_log`-Ingest, Rückkehr-Prognose, Marktradar-Seite, Spieler-Detail, Favoriten/Kadenz in `app_settings`. Commit.

**M7 — Cron + Deploy.** `vercel.json`-Cron, CRON_SECRET-Schutz, `maxDuration`, Statusfeld „letzter Lauf". Deploy-Anleitung (Vercel-Env-Variablen, Supabase-Projekt, Deployment Protection) in `README.md`. Commit.

## 11. Definition of Done

- Collector läuft idempotent per Vercel-Cron, schreibt Zeitreihen nach Supabase.
- Eigene Kontorekonstruktion == `/me/budget`; Fremdzahlen tragen korrekten Status (`exakt`/`bestätigt`/`geschätzt`).
- Alle fünf Seiten live aus Supabase, im Design des Prototyps, Maximalgebot nach `cash + 0.33*(tv + min(cash,0))`.
- Keine Secrets im Repo. Tests grün. README erklärt Setup + die offenen Kalibrierungspunkte (SPEC §12).

## 12. Wichtige Domänenfakten (Kurzreferenz — Details in SPEC)

- Startbudget **200 Mio.**, Start mit **0 Spielern**. Liga **ohne Auflaufprämie**.
- Maximalgebot-Regel (offiziell): max. **33 %** des Kaderwerts (bei Minuskonto um die Schuld gekürzt) **plus** Kontostand. Die „30 %" sind ein Irrtum.
- **Mehrere Ligen gleichzeitig:** alle Daten `league_id`-gebunden; ein globaler Switch wählt die aktive Liga. Manager-/Spieler-IDs sind ligaspezifisch.
- Unofficial API: kann sich ändern, Zugänge sperrbar. Defensiv pollen.
- Offen (durch echte Daten zu klären, in README dokumentieren): fremde Erfolgsprämien lesbar? `tty` Kauf/Verkauf? 33 % vs. ⅓? Kaderwert vor/nach Kauf beim Maximalgebot?
