-- Run once in Supabase SQL Editor for an existing installation.
-- Existing waiting, singing, and finished records keep their current status.

alter table public.song_requests
drop constraint if exists song_requests_status_check;

alter table public.song_requests
alter column status set default 'pending';

alter table public.song_requests
add constraint song_requests_status_check
check (status in ('pending', 'waiting', 'singing', 'finished'));

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

  if next_status not in ('waiting', 'singing', 'finished') then
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

revoke all on function public.admin_set_song_status(uuid, text, text) from public;
grant execute on function public.admin_set_song_status(uuid, text, text) to anon, authenticated;
