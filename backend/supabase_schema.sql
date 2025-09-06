-- Supabase schema for zazzle
-- Run this in the Supabase SQL editor (connected as service role) once.

-- 1) Media type enum (movie, tv)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'media_type') THEN
    CREATE TYPE public.media_type AS ENUM ('movie', 'tv');
  END IF;
END$$;

-- 2) Profiles table (linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);

-- Helper trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create a profile row after a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO UPDATE SET updated_at = now();
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3) Favorites table (per-user saved titles)
CREATE TABLE IF NOT EXISTS public.favorites (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tmdb_id BIGINT NOT NULL,
  media_type public.media_type NOT NULL,
  title TEXT,
  poster_path TEXT,
  backdrop_path TEXT,
  overview TEXT,
  popularity NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, tmdb_id, media_type)
);
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON public.favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user_tmdb ON public.favorites(user_id, tmdb_id, media_type);

-- 4) Watchlist table (per-user to-watch list)
CREATE TABLE IF NOT EXISTS public.watchlist (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tmdb_id BIGINT NOT NULL,
  media_type public.media_type NOT NULL,
  title TEXT,
  poster_path TEXT,
  backdrop_path TEXT,
  overview TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, tmdb_id, media_type)
);
CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON public.watchlist(user_id);

-- 5) Ratings table (optional per-user ratings/reviews)
CREATE TABLE IF NOT EXISTS public.ratings (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tmdb_id BIGINT NOT NULL,
  media_type public.media_type NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 10),
  review TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, tmdb_id, media_type)
);
DROP TRIGGER IF EXISTS set_ratings_updated_at ON public.ratings;
CREATE TRIGGER set_ratings_updated_at
BEFORE UPDATE ON public.ratings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_ratings_user_id ON public.ratings(user_id);

-- 6) Search history (optional; per-user)
CREATE TABLE IF NOT EXISTS public.search_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  q TEXT NOT NULL,
  filter TEXT,
  page INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_search_history_user_id_created_at ON public.search_history(user_id, created_at DESC);

-- 7) Enable Row Level Security
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;

-- 8) Grants (privileges) — use RLS to restrict rows; only authenticated users may write
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlist TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ratings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_history TO authenticated;

-- 9) RLS Policies
-- Profiles: owner can read/update/insert their own
DROP POLICY IF EXISTS "Profiles are viewable by owner" ON public.profiles;
CREATE POLICY "Profiles are viewable by owner"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Profiles can be updated by owner" ON public.profiles;
CREATE POLICY "Profiles can be updated by owner"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Profiles can be inserted by owner" ON public.profiles;
CREATE POLICY "Profiles can be inserted by owner"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Favorites: only owner can read/write their rows
DROP POLICY IF EXISTS "Favorites are viewable by owner" ON public.favorites;
CREATE POLICY "Favorites are viewable by owner"
  ON public.favorites FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Favorites can be inserted by owner" ON public.favorites;
CREATE POLICY "Favorites can be inserted by owner"
  ON public.favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Favorites can be updated by owner" ON public.favorites;
CREATE POLICY "Favorites can be updated by owner"
  ON public.favorites FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Favorites can be deleted by owner" ON public.favorites;
CREATE POLICY "Favorites can be deleted by owner"
  ON public.favorites FOR DELETE
  USING (auth.uid() = user_id);

-- Watchlist: only owner can read/write their rows
DROP POLICY IF EXISTS "Watchlist viewable by owner" ON public.watchlist;
CREATE POLICY "Watchlist viewable by owner"
  ON public.watchlist FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Watchlist can be inserted by owner" ON public.watchlist;
CREATE POLICY "Watchlist can be inserted by owner"
  ON public.watchlist FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Watchlist can be updated by owner" ON public.watchlist;
CREATE POLICY "Watchlist can be updated by owner"
  ON public.watchlist FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Watchlist can be deleted by owner" ON public.watchlist;
CREATE POLICY "Watchlist can be deleted by owner"
  ON public.watchlist FOR DELETE
  USING (auth.uid() = user_id);

-- Ratings: only owner can read/write their rows
DROP POLICY IF EXISTS "Ratings viewable by owner" ON public.ratings;
CREATE POLICY "Ratings viewable by owner"
  ON public.ratings FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Ratings can be inserted by owner" ON public.ratings;
CREATE POLICY "Ratings can be inserted by owner"
  ON public.ratings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Ratings can be updated by owner" ON public.ratings;
CREATE POLICY "Ratings can be updated by owner"
  ON public.ratings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Ratings can be deleted by owner" ON public.ratings;
CREATE POLICY "Ratings can be deleted by owner"
  ON public.ratings FOR DELETE
  USING (auth.uid() = user_id);

-- Search history: only owner can read/write their rows
DROP POLICY IF EXISTS "Search history viewable by owner" ON public.search_history;
CREATE POLICY "Search history viewable by owner"
  ON public.search_history FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Search history can be inserted by owner" ON public.search_history;
CREATE POLICY "Search history can be inserted by owner"
  ON public.search_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Search history can be deleted by owner" ON public.search_history;
CREATE POLICY "Search history can be deleted by owner"
  ON public.search_history FOR DELETE
  USING (auth.uid() = user_id);

-- 10) Search results table (stores all search results with type column)
CREATE TABLE IF NOT EXISTS public.search_results (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  tmdb_id BIGINT NOT NULL,
  type public.media_type NOT NULL,
  title TEXT,
  poster_path TEXT,
  backdrop_path TEXT,
  overview TEXT,
  release_date DATE,
  popularity NUMERIC,
  vote_average NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_search_results_user_query ON public.search_results(user_id, query);
CREATE INDEX IF NOT EXISTS idx_search_results_user_id ON public.search_results(user_id);

-- Search results: only owner can read/write their rows
DROP POLICY IF EXISTS "Search results viewable by owner" ON public.search_results;
CREATE POLICY "Search results viewable by owner"
  ON public.search_results FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Search results can be inserted by owner" ON public.search_results;
CREATE POLICY "Search results can be inserted by owner"
  ON public.search_results FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Search results can be deleted by owner" ON public.search_results;
CREATE POLICY "Search results can be deleted by owner"
  ON public.search_results FOR DELETE
  USING (auth. uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_results TO authenticated;
