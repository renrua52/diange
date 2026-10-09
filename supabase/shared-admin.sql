-- Run this in Supabase SQL Editor after replacing the password below.
-- Re-run the file at any time to change the shared administrator password.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.admin_config (
  id boolean primary key default true check (id),
  password_hash text not null
);

alter table public.admin_config enable row level security;

drop policy if exists "Signed-in admins can update songs" on public.song_requests;
drop policy if exists "Signed-in admins can delete songs" on public.song_requests;
revoke update, delete on public.song_requests from anon, authenticated;

insert into public.admin_config (id, password_hash)
values (
  true,
  extensions.crypt($password$REPLACE_WITH_YOUR_SHARED_PASSWORD$password$, extensions.gen_salt('bf'))
)
on conflict (id) do update
set password_hash = excluded.password_hash;

create or replace function public.verify_admin_password(shared_password text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select coalesce((
    select extensions.crypt(shared_password, password_hash) = password_hash
    from public.admin_config
    where id = true
  ), false);
$$;

create or replace function public.admin_set_song_status(
  request_id uuid,
  next_status text,
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

  if next_status not in ('singing', 'finished') then
    raise exception '无效的歌曲状态';
  end if;

  if next_status = 'singing' then
    update public.song_requests set status = 'finished' where status = 'singing';
  end if;

  update public.song_requests set status = next_status where id = request_id;
  if not found then
    raise exception '歌曲不存在';
  end if;
end;
$$;

create or replace function public.admin_delete_song(
  request_id uuid,
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

  delete from public.song_requests where id = request_id;
end;
$$;

create or replace function public.admin_clear_finished(shared_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.verify_admin_password(shared_password) then
    raise exception '管理员密码错误' using errcode = '42501';
  end if;

  delete from public.song_requests where status = 'finished';
end;
$$;

revoke all on function public.verify_admin_password(text) from public;
revoke all on function public.admin_set_song_status(uuid, text, text) from public;
revoke all on function public.admin_delete_song(uuid, text) from public;
revoke all on function public.admin_clear_finished(text) from public;

grant execute on function public.verify_admin_password(text) to anon, authenticated;
grant execute on function public.admin_set_song_status(uuid, text, text) to anon, authenticated;
grant execute on function public.admin_delete_song(uuid, text) to anon, authenticated;
grant execute on function public.admin_clear_finished(text) to anon, authenticated;
