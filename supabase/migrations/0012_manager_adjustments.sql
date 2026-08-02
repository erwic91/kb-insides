-- Manuelle Kontostand-Korrekturen je Manager (z. B. Admin-Strafen/-Boni, die
-- man in Kickbase im Aktivitäten-Feed sieht, aber nicht über die API abrufbar
-- sind). Signierter Betrag (negativ = Strafe, positiv = Bonus). Die Summe je
-- Manager fließt in die Rekonstruktion des Gegner-Kontos. Liga-geteilt: jedes
-- verbundene Mitglied sieht/pflegt sie (wie die Liga-Einstellungen).

create table if not exists manager_adjustments (
  id         uuid primary key default gen_random_uuid(),
  league_id  text not null,
  manager_id text not null,
  amount     bigint not null,               -- signiert: − = Strafe, + = Bonus
  note       text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists manager_adjustments_league_mgr
  on manager_adjustments (league_id, manager_id);

alter table manager_adjustments enable row level security;

-- Lesen: Mitglieder der Liga (league_access). Schreiben nur server-seitig
-- (Service-Role) nach Zugriffsprüfung.
create policy read_adjustments on manager_adjustments for select
  using (exists (select 1 from league_access la
                 where la.user_id = auth.uid() and la.league_id = manager_adjustments.league_id));
