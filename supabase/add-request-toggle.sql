-- Run once in Supabase SQL Editor for an existing installation.
-- This migration does not change the shared administrator password.

create table if not exists public.event_settings (
  id boolean primary key default true check (id),
  requests_open boolean not null default true
);

insert into public.event_settings (id, requests_open)
values (true, true)
on conflict (id) do nothing;

alter table public.event_settings enable row level security;

drop policy if exists "Anyone can view event settings" on public.event_settings;
create policy "Anyone can view event settings"
on public.event_settings for select
to anon, authenticated
using (true);

revoke insert, update, delete on public.event_settings from anon, authenticated;
grant select on public.event_settings to anon, authenticated;

drop policy if exists "Anyone can request a song" on public.song_requests;
create policy "Anyone can request a song"
on public.song_requests for insert
to anon, authenticated
with check (
  status = 'pending'
  and exists (
    select 1 from public.event_settings
    where id = true and requests_open = true
  )
);

create or replace function public.admin_set_requests_open(
  next_open boolean,
  shared_password text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.verify_admin_password(shared_password) then
    raise exception '管理员密码错误' using errcode = '42501';
  end if;

  update public.event_settings
  set requests_open = next_open
  where id = true;
end;
$$;

revoke all on function public.admin_set_requests_open(boolean, text) from public;
grant execute on function public.admin_set_requests_open(boolean, text) to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_settings'
  ) then
    execute 'alter publication supabase_realtime add table public.event_settings';
  end if;
end;
$$;
