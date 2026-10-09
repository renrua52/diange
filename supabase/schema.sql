-- Run this once in Supabase Dashboard > SQL Editor.
create table if not exists public.song_requests (
  id uuid primary key default gen_random_uuid(),
  singer text not null check (char_length(singer) between 1 and 30),
  song text not null check (char_length(song) between 1 and 80),
  status text not null default 'waiting' check (status in ('waiting', 'singing', 'finished')),
  created_at timestamptz not null default now()
);

alter table public.song_requests enable row level security;

create policy "Anyone can view the queue"
on public.song_requests for select
to anon, authenticated
using (true);

create policy "Anyone can request a song"
on public.song_requests for insert
to anon, authenticated
with check (status = 'waiting');

alter publication supabase_realtime add table public.song_requests;
