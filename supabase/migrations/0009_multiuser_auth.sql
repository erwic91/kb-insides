-- Multi-User Phase 1 — Auth-Fundament. Rein ADDITIV: bestehende Tabellen bleiben
-- unangetastet, die Single-User-App läuft unverändert weiter. Siehe
-- docs/MULTI_USER_DESIGN.md §4.

-- Optionales Profil je App-Nutzer (Identität kommt aus auth.users).
create table if not exists profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

-- Kickbase-Verbindung je App-Nutzer (1:1). Tokens VERSCHLÜSSELT (AES-GCM,
-- App-seitiger Schlüssel) — nur Chiffrat + IV + Tag (jeweils base64) liegen in
-- der DB.
create table if not exists kb_connections (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  kb_user_id          text not null,
  access_token        text not null,   -- base64(AES-GCM Chiffrat)
  refresh_token       text,            -- base64(AES-GCM Chiffrat)
  token_iv            text not null,   -- base64(Nonce/IV)
  token_tag           text not null,   -- base64(GCM Auth-Tag)
  expires_at          timestamptz,
  status              text not null default 'active', -- active | needs_reconnect
  active_league_id    text,
  league_activated_at timestamptz,
  connected_at        timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Welche Nutzer dürfen welche Liga sehen (RLS-Grundlage). Höchstens EINE Zeile
-- je Nutzer (= aktive Liga).
create table if not exists league_access (
  user_id       uuid not null references auth.users(id) on delete cascade,
  league_id     text not null,
  kb_manager_id text not null,
  primary key (user_id, league_id)
);

-- Nutzer-privater exakter Kontostand (nur der Betroffene darf ihn sehen).
create table if not exists user_budget (
  user_id     uuid not null references auth.users(id) on delete cascade,
  league_id   text not null,
  day         integer not null,
  cash_actual bigint,
  updated_at  timestamptz not null default now(),
  primary key (user_id, league_id, day)
);

-- Minimaler Sperr-Marker gegen Umgehung der 7-Tage-Wechselsperre (überlebt das
-- Trennen der Connection; enthält keine Tokens).
create table if not exists league_switch_lock (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  last_league_id text not null,
  activated_at   timestamptz not null
);

alter table profiles           enable row level security;
alter table kb_connections     enable row level security;
alter table league_access      enable row level security;
alter table user_budget        enable row level security;
alter table league_switch_lock enable row level security;

-- Profil: Nutzer verwaltet die eigene Zeile.
create policy own_profile on profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Die folgenden Tabellen werden ausschließlich server-seitig (Service-Role,
-- RLS-Bypass) geschrieben; Nutzer dürfen nur die EIGENEN Zeilen LESEN. Die
-- Token-Spalten sind Chiffrat und ohne KB_TOKEN_ENC_KEY wertlos.
create policy own_connection_read on kb_connections
  for select using (user_id = auth.uid());
create policy own_access_read on league_access
  for select using (user_id = auth.uid());
create policy own_budget_read on user_budget
  for select using (user_id = auth.uid());
create policy own_lock_read on league_switch_lock
  for select using (user_id = auth.uid());
