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
| `KICKBASE_LEAGUE_IDS` | **optional.** Der Collector greift automatisch alle Ligen aus `/selection` ab; diese Variable ist nur noch ein Zusatz/Override (kommasepariert, z. B. `123,456`) | selbst vergeben |
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
- [~] **Checkpoint C** — Selbstkalibrierung schreibt eine `calibration`-Zeile
  (Rekonstruktion vs. `/me/budget`) + Statuszeile im Dashboard. Volle Transfers
  ✅, Prämien-Endpunkt gefunden (`dashboard.prft`) — nur noch die `prft`-Bedeutung
  + euro-genaues Δ = 0 fehlen, beides braucht eine **laufende Saison**.
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
- [x] **Discovery-Capture** — Live-Lauf ausgewertet: Paginierung = `start`-Offset
  (umgesetzt), Prämien-Endpunkt = `manager_dashboard` (`prft`). Siehe „Offene
  Kalibrierungspunkte".

> **Hinweis:** Die fünf Prototyp-HTML-Dateien (`dashboard.html`, `liga.html`,
> `marktradar.html`, `manager.html`, `player.html`) sind die visuelle Referenz für
> M5/M6 und liegen aktuell **nicht** im Repo — sie werden für das Frontend benötigt.

## Offene Kalibrierungspunkte (SPEC §12 / Checkpoint C)

An echten Daten geklärt:

- ✅ **`tty`-Mapping:** `1` = Kauf, `2` = Verkauf. Verifiziert daran, dass bei
  jedem gekauften **und** verkauften Spieler `tty=1` zeitlich vor `tty=2` liegt.
- ✅ **Transfer-Paginierung (Discovery-Lauf):** Parameter ist **`start`** (Offset,
  Seitengröße 25). `?start=25` liefert Einträge 26–50 (ältere `dt`); `?page=` und
  `?max=` werden ignoriert. Umgesetzt in `fetchAllTransfers` (loopt bis <25) +
  `paginateTransfers` (getestet). Die Rekonstruktion nutzt jetzt die **volle**
  Historie statt der ersten 25.
- ✅ **Prämien-Endpunkt (Discovery-Lauf):** `achievements` und `manager_profile`
  liefern **404**; `manager_performance` (leer post-Reset) und
  **`manager_dashboard`** liefern 200. Der Prämien-Wert steckt in
  `dashboard.prft` (+ `mds`/`mdw` je Spieltag). Alle Werte aktuell **0** (Reset).

Noch offen (blockieren die euro-genaue Kalibrierung, Checkpoint C):

- **Bedeutung von `prft` klären.** Feld gefunden, aber post-Reset 0 → unklar, ob
  `prft` = Erfolgsprämien oder = Handelsgewinn (Doppelzählungs-Gefahr). Deshalb
  **noch nicht** in die Geldformel verdrahtet. In laufender Saison an `me/budget`
  gegenprüfen, dann `prizes` in `reconstructCash` speisen. `mds`-Item-Shape ist
  post-Reset (leeres Array) ebenfalls erst dann sichtbar.
- **Start-Budget-Semantik (neuer Fund an der aktiven Liga FFL).** In `/selection`
  ist `b` das **aktuelle Guthaben**, nicht das Startbudget: FFL hat `b=52,8 Mio`
  (aktuell) bei `overview.b=50 Mio` (Konfig-Start). Für reset-Ligen fallen beide
  zusammen, für aktive nicht. `reconstructCash` braucht das **echte** Startbudget
  je Liga → an FFLs Transfers + `me/budget` empirisch bestimmen (welcher Wert
  macht Δ = `prft`?), dann per-Liga statt globaler `START_BUDGET`-Konstante.
- **Saison-Reset (KBLux/FLF).** Deren Daten stammen aus der abgelaufenen Saison
  25/26; `me/budget` zeigt den zurückgesetzten Kontostand. Euro-genaue
  Kalibrierung dort erst in der nächsten laufenden Saison — **FFL läuft aber
  jetzt** und ist damit der Testfall für Checkpoint C.
- Maximalgebot-Faktor: 33 % exakt oder ⅓ (33,33 %)? (Konstante `MAX_BID_FACTOR`.)
- Maximalgebot: Kaderwert **vor** oder **nach** dem gedachten Kauf?
- `tv` bei historischem `dayNumber`: damaliger oder aktueller Wert?
