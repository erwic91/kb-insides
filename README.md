# Ligamonitor

Web-Tool, das eine **Kickbase-Liga** auswertet, um maximal viele Insights über die
**Mitmanager** zu liefern (Kontostände, Maximalgebote, Overpay, Markt-Rückkehr-Prognosen).
Kein Analysetool für den eigenen Kader.

Fachlogik: siehe [`SPEC.md`](./SPEC.md). Bau-Auftrag/Meilensteine: siehe
[`CLAUDE_CODE_PROMPT.md`](./CLAUDE_CODE_PROMPT.md).

## Stack

- **Next.js** (App Router) + **TypeScript**, deploybar auf **Vercel**
- **Supabase** (Postgres), Zugriff serverseitig über Service-Role-Key
- **Vercel Cron** → täglicher Collector (`/api/cron/collect`, CRON_SECRET-geschützt)
- **zod** (Response-Validierung), **vitest** (Tests), **pnpm**

## Entwicklung

```bash
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest
pnpm dev         # Next.js dev server
```

## Umgebungsvariablen (hosted-first)

Maßgeblicher Ort ist **Vercel** → Project → Settings → Environment Variables
(`.env.example` listet alle Keys). **Niemals `.env*` committen.**

| Variable | Zweck | Woher |
|---|---|---|
| `KICKBASE_EMAIL` / `KICKBASE_PASSWORD` | Login (E-Mail/PW müssen in der Kickbase-App gesetzt sein) | selbst vergeben |
| `KICKBASE_LEAGUE_IDS` | kommaseparierte Liga-IDs, z. B. `123,456` | selbst vergeben |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase-Zugriff (serverseitig) | Supabase → Settings → API |
| `CRON_SECRET` | schützt `/api/cron/collect` + `/api/dev/capture-fixtures` | Vercel setzt es in Prod automatisch; für manuelles Auslösen eigenen Wert vergeben |

> In **Supabase** selbst werden keine App-Env-Variablen gesetzt — dort nur das
> Projekt anlegen und `Project URL` + `service_role`-Key ablesen und nach Vercel kopieren.

### Fixture-Abgriff ohne lokalen Lauf (Checkpoint B)

Nach dem Deploy die geschützte Route einmal auslösen — läuft im Vercel-Deployment
mit den dort gesetzten Variablen:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://<deine-app>.vercel.app/api/dev/capture-fixtures
```

Die (token-redigierte) JSON-Antwort zeigt die echten Kickbase-Feldnamen und wird
zu den Dateien unter `/fixtures/` — Grundlage für die Parser ab M2. Alternativ
lokal: `pnpm capture-fixtures`.

**Discovery-Proben (Checkpoint C).** Derselbe Lauf greift zusätzlich Kandidaten
für die beiden offenen Blocker ab (Fehler landen als `{ error }` im Bundle,
genau ein Treffer zeigt die Wahrheit):

- **Erfolgsprämien:** `achievements`, `manager_profile`, `manager_performance`,
  `manager_dashboard` — welcher 200 liefert, ist der Prämien-Endpunkt.
- **Transfer-Paginierung:** `transfer?start=25` / `?max=100` / `?page=1`. Das Log
  markiert die wirksame Variante mit `→ PARAM WIRKT` (andere Item-Zahl als Basis).

Das Ergebnis landet in `app_settings.__dev_last_capture` (Supabase) — danach lassen
sich der Prämien-Ingest und die volle Transferhistorie an echten Shapes bauen.

## Datenbank

Migrationen (in Reihenfolge anwenden):
[`0001_init.sql`](./supabase/migrations/0001_init.sql) — Schema aus SPEC §5,
Multi-Liga (`league_id` im PK jeder Zeitreihe), RLS auf allen Tabellen ohne
öffentliche Policies · [`0002_market_owner.sql`](./supabase/migrations/0002_market_owner.sql)
— Anbieter + Marktwert am `market_log` (M6).

## Deployment & Betrieb (M7)

**Erstinbetriebnahme**

1. Supabase-Projekt anlegen, beide Migrationen aus `supabase/migrations/` anwenden.
2. In Vercel alle Variablen aus der Tabelle oben setzen (`Production` + `Preview`).
3. Deployen. Vercel liest `vercel.json` → legt den Cron automatisch an.
4. Einmal Fixtures/Discovery abgreifen (Abschnitt oben) — legt Ligen an und
   klärt die offenen Shapes.
5. Historie füllen: Backfill einmalig auslösen (unten), danach übernimmt der Cron.

**Automatischer Sammel-Lauf**

`vercel.json` triggert täglich **05:00 UTC** → `GET /api/cron/collect`. Vercel
sendet `Authorization: Bearer $CRON_SECRET`; die Route lehnt alles andere mit
`401` ab. Ein Lauf zieht pro Liga Ranking + Markt + eigenen Kontostand und
schreibt Snapshots/Transfers/Marktlistings idempotent (Upserts).

**Manuelle Trigger** (Operator mit `CRON_SECRET`):

```bash
# Regulärer Sammel-Lauf (wie der Cron)
curl -H "Authorization: Bearer $CRON_SECRET" https://<app>.vercel.app/api/cron/collect

# Backfill: alle Spieltage einer Liga rückwirkend
curl -H "Authorization: Bearer $CRON_SECRET" https://<app>.vercel.app/api/dev/backfill

# Einzelner Ad-hoc-Sammel-Lauf (Dev)
curl -H "Authorization: Bearer $CRON_SECRET" https://<app>.vercel.app/api/dev/collect
```

**Monitoring.** Erfolg = HTTP 200 mit `{ ok: true, ... }`. Vercel → Deployments →
Functions zeigt Cron-Logs; bei `ok:false` steht die Ursache im `error`-Feld.
Der Sammel-Lauf ist idempotent — ein verpasster Tag wird beim nächsten Lauf bzw.
per Backfill nachgeholt.

## Projektstatus (Meilensteine)

- [x] **M0** — Projektgerüst (Next.js, Supabase-Client, vitest, vercel.json, Migration)
- [x] **M1** — Kickbase-Auth-Client + Smoke + Fixture-Capture
- [x] **Checkpoint B** — echte Fixtures unter `/fixtures` (ranking/overview/
  me_budget/leagues_selection/manager_transfers), Token/E-Mail redigiert.
- [x] **M2** — Ranking-Ingest → `leagues`/`managers`/`manager_snapshots`
  (`lib/ingest/ranking.ts`, `/api/cron/collect` + `/api/dev/collect`).
- [x] **M3** — Backfill aller Spieltage (`lib/ingest/backfill.ts`,
  `/api/dev/backfill`); `parseRanking` mit `dayOverride`.
- [x] **M4** — Transfer-Ingest (`lib/ingest/transfers.ts`) + Rechenlogik
  (`lib/compute/reconstruct.ts`: Rekonstruktion, Maximalgebot, Overpay,
  FIFO-Gewinn). An echten Daten getestet.
- [~] **Checkpoint C** — Selbstkalibrierung schreibt jetzt eine `calibration`-Zeile
  (Rekonstruktion vs. `/me/budget`) und zeigt sie als Statuszeile im Dashboard.
  Euro-genau (Δ = 0) erst mit Erfolgsprämien + vollständigen Transfers +
  laufender Saison; `achievements` ist im Capture angebunden (Pfad-Annahme).
- [x] **M5** — Frontend an Supabase: eigenes Dark-Theme-Designsystem
  (`app/globals.css`), globaler Liga-Switch (`components/`), Read-Layer
  (`lib/db/queries.ts`) und die Seiten Dashboard, Liga/Analyse, Manager-Detail.
- [x] **M4b** — Multi-Liga: `/selection`-Ingest (`lib/ingest/leaguesSelection.ts`)
  füllt **alle** Ligen des Nutzers → der Liga-Switch hat jetzt echte Optionen.
- [x] **M6** — Markt-Ingest (`lib/ingest/market.ts` → players/market_log/player_mv),
  Marktradar (Jetzt-am-Markt, Overpay-vs-MV, Favoriten via localStorage,
  Kadenz-Regler) und Spieler-Detail (MV-Verlauf, ligaweite Besitzhistorie).
- [x] **M7** — Cron (`vercel.json`, tägl. 05:00 UTC), `CRON_SECRET`-Schutz,
  Backfill-/Collect-Trigger und Betriebs-Runbook (Abschnitt „Deployment & Betrieb").
- [~] **Discovery-Capture** — ein Live-Lauf probt jetzt Prämien-Endpunkt-Kandidaten
  + Transfer-Paginierungs-Parameter (Abschnitt oben), um Checkpoint C zu entsperren.

> **Hinweis:** Die fünf Prototyp-HTML-Dateien (`dashboard.html`, `liga.html`,
> `marktradar.html`, `manager.html`, `player.html`) sind die visuelle Referenz für
> M5/M6 und liegen aktuell **nicht** im Repo — sie werden für das Frontend benötigt.

## Offene Kalibrierungspunkte (SPEC §12 / Checkpoint C)

An echten Daten geklärt:

- ✅ **`tty`-Mapping:** `1` = Kauf, `2` = Verkauf. Verifiziert daran, dass bei
  jedem gekauften **und** verkauften Spieler `tty=1` zeitlich vor `tty=2` liegt.

Noch offen (blockieren die euro-genaue Kalibrierung, Checkpoint C):

- **Transfer-Liste gedeckelt (~25 Einträge).** Bei langer Historie fehlen ältere
  Transfers → Rekonstruktion unvollständig. Zu klären: Paginierung/Parameter, um
  die volle Historie zu ziehen.
- **Erfolgsprämien noch nicht ingested.** Im eigenen Testfall klafft eine Lücke
  von ~33,0 Mio zwischen Rekonstruktion (167,2 Mio) und `me/budget` — das ist der
  erwartete Prämien-Posten. `achievements`-Endpunkt (`er`) muss noch abgegriffen
  werden; offen, ob er **fremde** Prämien liefert (sonst Schätzposten).
- **Saison-Reset.** Aktuelle Daten stammen aus der abgelaufenen Saison 25/26;
  `me/budget` zeigt bereits den zurückgesetzten Kontostand. Euro-genaue
  Kalibrierung ist erst **während einer laufenden Saison** möglich.
- Maximalgebot-Faktor: 33 % exakt oder ⅓ (33,33 %)? (Konstante `MAX_BID_FACTOR`.)
- Maximalgebot: Kaderwert **vor** oder **nach** dem gedachten Kauf?
- `tv` bei historischem `dayNumber`: damaliger oder aktueller Wert?
