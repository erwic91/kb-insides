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
- [x] **M1 (Code)** — Kickbase-Auth-Client + `scripts/smoke.ts` + Fixture-Capture
  (`lib/kickbase/captureFixtures.ts`, geteilt von Skript und Route)
  — **offen (Checkpoint B):** In Vercel Env-Variablen setzen + deployen, dann
  `GET /api/dev/capture-fixtures` einmal auslösen und die JSON-Antwort committen.
- [ ] **M2** — Schema-Ingest (Ranking → manager_snapshots)
- [ ] **M3** — Backfill aller Spieltage
- [ ] **M4** — Transfers + Kontorekonstruktion + Kalibrierung
- [ ] **M4b** — Multi-Liga-Fundament
- [ ] **M5** — Frontend an Supabase (Dashboard/Liga/Manager)
- [ ] **M6** — Markt + Prognose + Favoriten
- [ ] **M7** — Cron + Deploy + Doku

> **Hinweis:** Die fünf Prototyp-HTML-Dateien (`dashboard.html`, `liga.html`,
> `marktradar.html`, `manager.html`, `player.html`) sind die visuelle Referenz für
> M5/M6 und liegen aktuell **nicht** im Repo — sie werden für das Frontend benötigt.

## Offene Kalibrierungspunkte (SPEC §12)

Durch echte Daten zu klären, hier zu dokumentieren sobald bekannt:

- Liefert `achievements` **fremde** Erfolgsprämien? (sonst Schätzposten)
- `tty`-Mapping: welcher Wert = Kauf / Verkauf?
- Maximalgebot-Faktor: 33 % exakt oder ⅓ (33,33 %)?
- Maximalgebot: Kaderwert **vor** oder **nach** dem gedachten Kauf?
- `tv` bei historischem `dayNumber`: damaliger oder aktueller Wert?
