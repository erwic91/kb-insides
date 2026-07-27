-- Ligamonitor — initial schema (SPEC §5, Postgres-Umsetzung mit Multi-Liga + RLS)
--
-- Konventionen:
--  * Externe IDs (Kickbase league/manager/player/transfer) sind TEXT — Kickbase
--    liefert numerische Strings; TEXT vermeidet Overflow/Leading-Zero-Probleme.
--  * Geldbeträge sind BIGINT in ganzen Euro (Kickbase liefert Integer).
--  * `day` = Kickbase dayNumber (Spieltag), INTEGER.
--  * `ts`  = Beobachtungs-/Ereigniszeitpunkt, TIMESTAMPTZ.
--  * Jede Zeitreihen-/Transaktionstabelle traegt `league_id` im Primaerschluessel
--    (Multi-Liga-Trennung, SPEC §5). Kein Query ohne Liga-Scope.
--  * RLS ist auf allen Tabellen aktiv, OHNE Policies. Aller Zugriff laeuft
--    serverseitig ueber den Service-Role-Key (das Tool ist privat).

-- ---------------------------------------------------------------------------
-- Stammdaten
-- ---------------------------------------------------------------------------

create table if not exists leagues (
  id                text primary key,
  name              text not null,
  start_budget      bigint not null default 200000000,
  has_matchday_bonus boolean not null default false,  -- Auflaufpraemie (diese Liga: aus)
  is_default        boolean not null default false,
  created_at        timestamptz not null default now()
);

-- Spieler-Stammdaten liga-uebergreifend (SPEC §5).
create table if not exists players (
  id        text primary key,
  name      text,
  team      text,
  position  text
);

-- Manager-IDs sind LIGASPEZIFISCH: derselbe Mensch hat je Liga eine andere id.
create table if not exists managers (
  league_id text not null references leagues(id) on delete cascade,
  id        text not null,
  name      text,
  is_me     boolean not null default false,
  primary key (league_id, id)
);

-- ---------------------------------------------------------------------------
-- Zeitreihen
-- ---------------------------------------------------------------------------

create table if not exists manager_snapshots (
  league_id          text not null,
  manager_id         text not null,
  day                integer not null,
  ts                 timestamptz not null default now(),
  team_value         bigint,
  cash_reconstructed bigint,             -- rekonstruiert (§7)
  cash_actual        bigint,             -- nur is_me, aus /me/budget
  points             integer,
  streak             integer,
  squad_size         integer,
  primary key (league_id, manager_id, day),
  foreign key (league_id, manager_id) references managers(league_id, id) on delete cascade
);

create table if not exists player_mv (
  league_id    text not null,
  player_id    text not null references players(id) on delete cascade,
  day          integer not null,
  ts           timestamptz not null default now(),
  market_value bigint,
  primary key (league_id, player_id, day)
);
create index if not exists player_mv_league_day_idx on player_mv (league_id, day);

-- ---------------------------------------------------------------------------
-- Transaktionen
-- ---------------------------------------------------------------------------

-- direction: 'buy' | 'sell' (aus Managersicht). from_manager NULL = vom Markt,
-- to_manager NULL = an den Markt.
create table if not exists transfers (
  league_id    text not null,
  id           text not null,
  player_id    text not null,
  from_manager text,                     -- NULL = Markt
  to_manager   text,                     -- NULL = Markt
  direction    text,
  day          integer,
  ts           timestamptz,
  price        bigint,
  mv_at_time   bigint,                   -- Marktwert zum Transferzeitpunkt (Overpay-Basis)
  primary key (league_id, id)
);
create index if not exists transfers_league_player_idx on transfers (league_id, player_id);
create index if not exists transfers_league_from_idx   on transfers (league_id, from_manager);
create index if not exists transfers_league_to_idx     on transfers (league_id, to_manager);

-- market_log: eine Zeile pro Marktauftritt (Listing) je Spieler.
-- ABWEICHUNG vom SPEC-PK (league_id, player_id, ts): wir schluesseln auf
-- `expiry_ts` statt Beobachtungs-`ts`. Grund: (1) Idempotenz — mehrere Polls
-- desselben Listings am selben Tag upserten dieselbe Zeile statt zu duplizieren
-- (Guardrail §7); (2) die Rueckkehr-Prognose zaehlt DISTINKTE Auftritte — ein
-- Listing = eine Zeile bildet das direkt ab. Kehrt der Spieler spaeter mit neuem
-- Ablauf an den Markt zurueck, ist das ein neuer Auftritt = neue Zeile.
create table if not exists market_log (
  league_id text not null,
  player_id text not null references players(id) on delete cascade,
  expiry_ts timestamptz not null,        -- Ablauf des Listings = Listing-Identitaet
  ts        timestamptz not null,        -- letzte Beobachtung dieses Listings
  day       integer,
  on_market boolean not null default true,
  price     bigint,
  primary key (league_id, player_id, expiry_ts)
);
create index if not exists market_log_league_player_idx on market_log (league_id, player_id);

create table if not exists prizes (
  league_id  text not null,
  manager_id text not null,
  day        integer not null,
  type       text not null,              -- z. B. 'achievement'
  amount     bigint not null,
  primary key (league_id, manager_id, day, type)
);

-- ---------------------------------------------------------------------------
-- Auth, Settings, Kalibrierung
-- ---------------------------------------------------------------------------

-- Eine Zeile. Speichert Access-/Refresh-Token, damit Tokens Cron-Laeufe
-- ueberdauern (Prompt §5). id via CHECK auf 1 fixiert.
create table if not exists kb_auth (
  id            integer primary key default 1,
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  updated_at    timestamptz not null default now(),
  constraint kb_auth_singleton check (id = 1)
);

-- Global: aktive/zuletzt gewaehlte Liga, Bonus-Flag, etc.
create table if not exists app_settings (
  key   text primary key,
  value text
);

-- Je Liga: Favoriten, Kadenz.
create table if not exists league_settings (
  league_id text not null references leagues(id) on delete cascade,
  key       text not null,
  value     text,
  primary key (league_id, key)
);

create table if not exists calibration (
  league_id       text not null,
  day             integer not null,
  my_reconstructed bigint,
  my_actual        bigint,
  delta            bigint,               -- my_reconstructed - my_actual
  ts               timestamptz not null default now(),
  primary key (league_id, day)
);

-- ---------------------------------------------------------------------------
-- RLS: auf allen Tabellen aktivieren, KEINE Policies (nur Service-Role-Zugriff)
-- ---------------------------------------------------------------------------

alter table leagues          enable row level security;
alter table players          enable row level security;
alter table managers         enable row level security;
alter table manager_snapshots enable row level security;
alter table player_mv        enable row level security;
alter table transfers        enable row level security;
alter table market_log       enable row level security;
alter table prizes           enable row level security;
alter table kb_auth          enable row level security;
alter table app_settings     enable row level security;
alter table league_settings  enable row level security;
alter table calibration      enable row level security;
