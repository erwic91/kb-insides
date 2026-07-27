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

## Umgebungsvariablen

`.env.example` → `.env.local` kopieren und ausfüllen. **Niemals `.env*` committen.**

| Variable | Zweck |
|---|---|
| `KICKBASE_EMAIL` / `KICKBASE_PASSWORD` | Login (E-Mail/PW müssen in der Kickbase-App gesetzt sein) |
| `KICKBASE_LEAGUE_IDS` | kommaseparierte Liga-IDs, z. B. `123,456` |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase-Zugriff (serverseitig) |
| `CRON_SECRET` | schützt `/api/cron/collect` (Vercel setzt es in Prod automatisch) |

## Datenbank

Migration: [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql)
— Schema aus SPEC §5, Multi-Liga (`league_id` im PK jeder Zeitreihe), RLS auf allen
Tabellen ohne öffentliche Policies.

## Projektstatus (Meilensteine)

- [x] **M0** — Projektgerüst (Next.js, Supabase-Client, vitest, vercel.json, Migration)
- [ ] **M1** — Kickbase-Auth + Smoke-Test
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
