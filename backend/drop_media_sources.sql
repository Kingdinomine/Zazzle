-- Migration: Drop deprecated media_sources table and related policies
-- Safe to run multiple times (idempotent)

begin;

-- Drop policies if table exists
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='media_sources') then
    -- Policies are dropped automatically with table when using DROP TABLE ... CASCADE
    execute 'drop table if exists public.media_sources cascade';
  end if;
end $$;

commit;
