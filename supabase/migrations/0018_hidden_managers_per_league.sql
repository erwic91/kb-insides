-- 0018: Ausgeblendete Manager PRO LIGA statt global.
-- Grund: dieselbe Person kann in Liga A (nicht mitspielender) Admin sein, in
-- Liga B aber normaler Manager. Das Ausblenden muss daher ligaspezifisch sein.
-- Bestehende globale Einträge werden auf alle Ligen expandiert, in denen der
-- Manager vorkommt (bleiben also zunächst überall ausgeblendet).
alter table hidden_managers add column if not exists league_id text;
alter table hidden_managers drop constraint if exists hidden_managers_pkey;

insert into hidden_managers (league_id, manager_id, note, hidden_at)
select distinct m.league_id, h.manager_id, h.note, h.hidden_at
from hidden_managers h
join managers m on m.id = h.manager_id
where h.league_id is null;

delete from hidden_managers where league_id is null;

alter table hidden_managers alter column league_id set not null;
alter table hidden_managers add primary key (league_id, manager_id);
