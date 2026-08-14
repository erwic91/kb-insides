-- 0016: Ausgeblendete Manager (global, liga-übergreifend).
-- Anwendungsfall: Liga-Admins/„Karteileichen", die zwar Mitglied sind, aber nicht
-- aktiv mitspielen (keine Transfers/Boni). Ihre Daten werden weiter gesammelt,
-- aber sie werden aus Ranking, Ø-Werten und Insights ausgeblendet.
-- Die Manager-ID (Kickbase-User-ID) ist über alle Ligen hinweg gleich → global.
create table if not exists hidden_managers (
  manager_id text primary key,
  note       text,
  hidden_at  timestamptz not null default now()
);

alter table hidden_managers enable row level security;

drop policy if exists hidden_managers_read on hidden_managers;
create policy hidden_managers_read on hidden_managers
  for select to authenticated using (true);
