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

## Datenbank

Migration: [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql)
— Schema aus SPEC §5, Multi-Liga (`league_id` im PK jeder Zeitreihe), RLS auf allen
Tabellen ohne öffentliche Policies.

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
- [ ] **Checkpoint C** — euro-genaue Kalibrierung (siehe unten): braucht
  laufende Saison + vollständige Transfers + Erfolgsprämien.
- [x] **M5** — Frontend an Supabase: eigenes Dark-Theme-Designsystem
  (`app/globals.css`), globaler Liga-Switch (`components/`), Read-Layer
  (`lib/db/queries.ts`) und die Seiten Dashboard, Liga/Analyse, Manager-Detail
  (Kaderwert/Punkte, Kontorekonstruktion, Handelsbilanz, Transferhistorie).
- [ ] **M4b** — Multi-Liga-Fundament (Grundlage steht: alles ligagebunden)
- [ ] **M6** — Marktradar + Spieler-Detail + Prognose + Favoriten
- [ ] **M7** — Cron + Deploy + Doku

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
