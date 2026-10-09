-- Run once in Supabase SQL Editor for an existing installation.
-- This migration does not change the shared administrator password.

create or replace function public.admin_clear_all(shared_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.verify_admin_password(shared_password) then
    raise exception '管理员密码错误' using errcode = '42501';
  end if;

  delete from public.song_requests where id is not null;
end;
$$;

revoke all on function public.admin_clear_all(text) from public;
grant execute on function public.admin_clear_all(text) to anon, authenticated;
