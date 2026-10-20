create table liked_songs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) default auth.uid(),
  track_id text not null,
  name text not null,
  artist text,
  artwork text,
  preview_url text not null,
  created_at timestamptz default now(),
  unique (user_id, track_id)
);

alter table liked_songs enable row level security;

create policy "read own" on liked_songs for select using (auth.uid() = user_id);
create policy "add own" on liked_songs for insert with check (auth.uid() = user_id);
create policy "remove own" on liked_songs for delete using (auth.uid() = user_id);
