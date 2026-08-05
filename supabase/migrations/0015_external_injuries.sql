-- 0015: Externe Ausfälle (api-football) — Bundesliga-weit, quellenübergreifend.
-- Wird im Sammel-Lauf befüllt (Freshness-Guard schont das API-Tageslimit).
-- Öffentliche Fußballdaten → für alle angemeldeten Nutzer lesbar (RLS).
create table if not exists external_injuries (
  id            bigint generated always as identity primary key,
  source        text not null default 'api-football',
  player_ext_id bigint,              -- Spieler-ID der externen Quelle
  player_name   text,
  team_ext_id   bigint,
  team_name     text,
  type          text,                -- z. B. „Missing Fixture"
  reason        text,                -- z. B. „Injury", „Suspended"
  fixture_date  timestamptz,
  kb_player_id  text,                -- best-effort Zuordnung zu players.id
  updated_at    timestamptz not null default now()
);

create index if not exists external_injuries_source_idx on external_injuries (source);

alter table external_injuries enable row level security;

drop policy if exists external_injuries_read on external_injuries;
create policy external_injuries_read on external_injuries
  for select to authenticated using (true);
