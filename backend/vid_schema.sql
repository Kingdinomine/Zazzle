-- Supabase Video Player Schema
-- Implements: tmdb_titles, tmdb_episodes, media_sources, search_logs, user_watchlist, user_history
-- Includes indexes, constraints, and RLS policies per specification

begin;

-- 0) Types
-- Ensure type exists (idempotent)
do $$ begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'media_type' and n.nspname = 'public'
  ) then
    execute 'create type public.media_type as enum (''movie'',''tv'',''anime'')';
  end if;
end $$;

-- end 0) Types

-- 1) Tables
-- a) tmdb_titles
create table if not exists public.tmdb_titles (
  id                 bigserial primary key,
  tmdb_id            integer not null,
  type               public.media_type not null,
  imdb_id            text,
  title              text,
  original_title     text,
  overview           text,
  release_date       date,
  first_air_date     date,
  runtime            integer,
  genres             jsonb,
  rating             numeric,
  poster_url         text,
  backdrop_url       text,
  raw_tmdb           jsonb,
  last_refreshed_at  timestamptz,
  created_at         timestamptz not null default now(),
  constraint tmdb_titles_unique_tmdb_type unique (tmdb_id, type)
);

create index if not exists tmdb_titles_type_tmdb_idx on public.tmdb_titles using btree (type, tmdb_id);
create index if not exists tmdb_titles_raw_tmdb_gin on public.tmdb_titles using gin (raw_tmdb);

-- Ensure unique constraint exists for (tmdb_id, type) even if table pre-existed without it
do $$ begin
  if not exists (
    select 1 from pg_constraint c
    where c.conname = 'tmdb_titles_unique_tmdb_type'
      and c.conrelid = 'public.tmdb_titles'::regclass
  ) then
    alter table public.tmdb_titles add constraint tmdb_titles_unique_tmdb_type unique (tmdb_id, type);
  end if;
end $$;

-- b) tmdb_episodes
create table if not exists public.tmdb_episodes (
  id                 bigserial primary key,
  show_tmdb_id       integer not null,
  show_type          public.media_type not null default 'tv',
  season_number      integer not null,
  episode_number     integer not null,
  title              text,
  overview           text,
  still_url          text,
  runtime            integer,
  air_date           date,
  raw_tmdb           jsonb,
  last_refreshed_at  timestamptz,
  constraint tmdb_episodes_unique_episode unique (show_tmdb_id, season_number, episode_number),
  constraint tmdb_episodes_fk_show foreign key (show_tmdb_id, show_type) references public.tmdb_titles (tmdb_id, type) on update cascade on delete cascade
);

create index if not exists tmdb_episodes_show_season_idx on public.tmdb_episodes using btree (show_tmdb_id, season_number);

-- c) media_sources (cache of resolved playable sources)
create table if not exists public.media_sources (
  id               bigserial primary key,
  type             public.media_type not null,
  tmdb_id          integer not null,
  season_number    integer,
  episode_number   integer,
  provider         text not null,
  embed_url        text,
  resolved_m3u8    text,
  headers_needed   jsonb,
  expires_at       timestamptz,
  resolved_at      timestamptz not null default now()
);

create index if not exists media_sources_key_idx on public.media_sources using btree (type, tmdb_id, season_number, episode_number);
create unique index if not exists media_sources_unique_provider_idx on public.media_sources (type, tmdb_id, season_number, episode_number, provider);

-- c2) streams (cache of direct HLS stream URLs)
create table if not exists public.streams (
  id           bigserial primary key,
  type         public.media_type not null,
  tmdb_id      integer not null,
  season       integer,
  episode      integer,
  provider     text not null,
  stream_url   text not null,
  created_at   timestamptz not null default now()
);

create index if not exists streams_key_idx on public.streams using btree (type, tmdb_id, season, episode);
create unique index if not exists streams_unique_provider_idx on public.streams (type, tmdb_id, season, episode, provider);

-- d) search_logs
create table if not exists public.search_logs (
  id                  bigserial primary key,
  user_id             uuid,
  query               text not null,
  result_count        integer not null default 0,
  top_tmdb_ids        integer[] not null default '{}',
  created_at          timestamptz not null default now(),
  client_fingerprint  text
);

-- e) user_watchlist
create table if not exists public.user_watchlist (
  id               bigserial primary key,
  user_id          uuid not null,
  type             public.media_type not null,
  tmdb_id          integer not null,
  season_number    integer,
  episode_number   integer,
  created_at       timestamptz not null default now(),
  constraint user_watchlist_unique unique (user_id, type, tmdb_id, season_number, episode_number)
);

-- f) user_history
create table if not exists public.user_history (
  id                 bigserial primary key,
  user_id            uuid not null,
  type               public.media_type not null,
  tmdb_id            integer not null,
  season_number      integer,
  episode_number     integer,
  position_seconds   integer not null default 0,
  completed          boolean not null default false,
  updated_at         timestamptz not null default now()
);

create index if not exists user_history_user_updated_idx on public.user_history (user_id, updated_at desc);

-- 2) Row Level Security (RLS)
-- Enable RLS on all tables
alter table public.tmdb_titles enable row level security;
alter table public.tmdb_episodes enable row level security;
alter table public.media_sources enable row level security;
alter table public.streams enable row level security;
alter table public.search_logs enable row level security;
alter table public.user_watchlist enable row level security;
alter table public.user_history enable row level security;

-- Helper: drop existing policies if needed (idempotent)
-- Note: CREATE POLICY IF NOT EXISTS isn't available in all PG versions; use conditional drops to be safe.
do $$ begin
  -- tmdb_titles
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tmdb_titles' and policyname = 'tmdb_titles_public_read') then
    execute 'drop policy tmdb_titles_public_read on public.tmdb_titles';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tmdb_titles' and policyname = 'tmdb_titles_service_insert') then
    execute 'drop policy tmdb_titles_service_insert on public.tmdb_titles';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tmdb_titles' and policyname = 'tmdb_titles_service_update') then
    execute 'drop policy tmdb_titles_service_update on public.tmdb_titles';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tmdb_titles' and policyname = 'tmdb_titles_service_delete') then
    execute 'drop policy tmdb_titles_service_delete on public.tmdb_titles';
  end if;

  -- tmdb_episodes
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tmdb_episodes' and policyname = 'tmdb_episodes_public_read') then
    execute 'drop policy tmdb_episodes_public_read on public.tmdb_episodes';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tmdb_episodes' and policyname = 'tmdb_episodes_service_insert') then
    execute 'drop policy tmdb_episodes_service_insert on public.tmdb_episodes';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tmdb_episodes' and policyname = 'tmdb_episodes_service_update') then
    execute 'drop policy tmdb_episodes_service_update on public.tmdb_episodes';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tmdb_episodes' and policyname = 'tmdb_episodes_service_delete') then
    execute 'drop policy tmdb_episodes_service_delete on public.tmdb_episodes';
  end if;

  -- media_sources
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'media_sources' and policyname = 'media_sources_public_read') then
    execute 'drop policy media_sources_public_read on public.media_sources';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'media_sources' and policyname = 'media_sources_service_insert') then
    execute 'drop policy media_sources_service_insert on public.media_sources';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'media_sources' and policyname = 'media_sources_service_update') then
    execute 'drop policy media_sources_service_update on public.media_sources';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'media_sources' and policyname = 'media_sources_service_delete') then
    execute 'drop policy media_sources_service_delete on public.media_sources';
  end if;

  -- streams
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'streams' and policyname = 'streams_public_read') then
    execute 'drop policy streams_public_read on public.streams';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'streams' and policyname = 'streams_service_insert') then
    execute 'drop policy streams_service_insert on public.streams';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'streams' and policyname = 'streams_service_update') then
    execute 'drop policy streams_service_update on public.streams';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'streams' and policyname = 'streams_service_delete') then
    execute 'drop policy streams_service_delete on public.streams';
  end if;

  -- search_logs
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'search_logs' and policyname = 'search_logs_insert_public') then
    execute 'drop policy search_logs_insert_public on public.search_logs';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'search_logs' and policyname = 'search_logs_select_service') then
    execute 'drop policy search_logs_select_service on public.search_logs';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'search_logs' and policyname = 'search_logs_update_service') then
    execute 'drop policy search_logs_update_service on public.search_logs';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'search_logs' and policyname = 'search_logs_delete_service') then
    execute 'drop policy search_logs_delete_service on public.search_logs';
  end if;

  -- user_watchlist
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_watchlist' and policyname = 'user_watchlist_select_own') then
    execute 'drop policy user_watchlist_select_own on public.user_watchlist';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_watchlist' and policyname = 'user_watchlist_insert_own') then
    execute 'drop policy user_watchlist_insert_own on public.user_watchlist';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_watchlist' and policyname = 'user_watchlist_update_own') then
    execute 'drop policy user_watchlist_update_own on public.user_watchlist';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_watchlist' and policyname = 'user_watchlist_delete_own') then
    execute 'drop policy user_watchlist_delete_own on public.user_watchlist';
  end if;

  -- user_history
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_history' and policyname = 'user_history_select_own') then
    execute 'drop policy user_history_select_own on public.user_history';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_history' and policyname = 'user_history_insert_own') then
    execute 'drop policy user_history_insert_own on public.user_history';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_history' and policyname = 'user_history_update_own') then
    execute 'drop policy user_history_update_own on public.user_history';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_history' and policyname = 'user_history_delete_own') then
    execute 'drop policy user_history_delete_own on public.user_history';
  end if;
end $$;

-- Policies: tmdb_titles
create policy tmdb_titles_public_read on public.tmdb_titles for select using (true);
create policy tmdb_titles_service_insert on public.tmdb_titles for insert with check (auth.role() = 'service_role');
create policy tmdb_titles_service_update on public.tmdb_titles for update using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy tmdb_titles_service_delete on public.tmdb_titles for delete using (auth.role() = 'service_role');

-- Policies: tmdb_episodes
create policy tmdb_episodes_public_read on public.tmdb_episodes for select using (true);
create policy tmdb_episodes_service_insert on public.tmdb_episodes for insert with check (auth.role() = 'service_role');
create policy tmdb_episodes_service_update on public.tmdb_episodes for update using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy tmdb_episodes_service_delete on public.tmdb_episodes for delete using (auth.role() = 'service_role');

-- Policies: media_sources
create policy media_sources_public_read on public.media_sources for select using (true);
create policy media_sources_service_insert on public.media_sources for insert with check (auth.role() = 'service_role');
create policy media_sources_service_update on public.media_sources for update using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy media_sources_service_delete on public.media_sources for delete using (auth.role() = 'service_role');

-- Policies: streams
create policy streams_public_read on public.streams for select using (true);
create policy streams_service_insert on public.streams for insert with check (auth.role() = 'service_role');
create policy streams_service_update on public.streams for update using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy streams_service_delete on public.streams for delete using (auth.role() = 'service_role');

-- Policies: search_logs
-- Allow anonymous and authenticated to insert basic logs
create policy search_logs_insert_public on public.search_logs for insert with check (true);
-- Restrict select to service role (analytics)
create policy search_logs_select_service on public.search_logs for select using (auth.role() = 'service_role');
-- Update/Delete only by service role
create policy search_logs_update_service on public.search_logs for update using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy search_logs_delete_service on public.search_logs for delete using (auth.role() = 'service_role');

-- Policies: user_watchlist (owner-only)
create policy user_watchlist_select_own on public.user_watchlist for select using (auth.uid() = user_id);
create policy user_watchlist_insert_own on public.user_watchlist for insert with check (auth.uid() = user_id);
create policy user_watchlist_update_own on public.user_watchlist for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy user_watchlist_delete_own on public.user_watchlist for delete using (auth.uid() = user_id);

-- Policies: user_history (owner-only)
create policy user_history_select_own on public.user_history for select using (auth.uid() = user_id);
create policy user_history_insert_own on public.user_history for insert with check (auth.uid() = user_id);
create policy user_history_update_own on public.user_history for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy user_history_delete_own on public.user_history for delete using (auth.uid() = user_id);

commit;
