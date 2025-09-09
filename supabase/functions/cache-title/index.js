// Supabase Edge Function: cache-title (JavaScript version)
// Fetch TMDB details + external_ids and upsert into tmdb_titles using service role
// RLS: tmdb_titles is service-role write only per vid_schema.sql

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const TMDB_KEY = Deno.env.get("TMDB_API_KEY") || Deno.env.get("TMDB_API_KEY_PUBLIC") || "";
const TMDB_BASE = "https://api.themoviedb.org/3";
const EDGE_TIMEOUT_MS = Number(Deno.env.get("EDGE_TIMEOUT_MS") || 14000);

function withTimeout(promise, ms = EDGE_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  // If the provided promise is a fetch, the caller can pass signal separately; this just bounds time.
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error("edge-timeout")), ms + 50)),
  ]).finally(() => clearTimeout(t));
}

async function tmdb(path, query = {}) {
  const u = new URL(`${TMDB_BASE}/${String(path).replace(/^\/+/, "")}`);
  u.searchParams.set("api_key", TMDB_KEY);
  u.searchParams.set("language", "en-US");
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, String(v));
  const res = await withTimeout(fetch(u.toString(), { headers: { Accept: "application/json" } }));
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error((data && data.status_message) || "tmdb-error");
  return data;
}

function mapTitlePayload(type, details, external) {
  const imdb_id = (external && external.imdb_id) || (details && details.imdb_id) || null;
  const poster_url = details?.poster_path ? `https://image.tmdb.org/t/p/original${details.poster_path}` : null;
  const backdrop_url = details?.backdrop_path ? `https://image.tmdb.org/t/p/original${details.backdrop_path}` : null;
  const genres = Array.isArray(details?.genres) ? details.genres : null;
  const payload = {
    tmdb_id: Number(details?.id || 0),
    type,
    imdb_id,
    title: details?.title || details?.name || null,
    original_title: details?.original_title || details?.original_name || null,
    overview: details?.overview || null,
    release_date: details?.release_date || null,
    first_air_date: details?.first_air_date || null,
    runtime: typeof details?.runtime === "number" ? details.runtime : null,
    genres: genres ? JSON.stringify(genres) : null,
    rating: typeof details?.vote_average === "number" ? details.vote_average : null,
    poster_url,
    backdrop_url,
    raw_tmdb: details || null,
    last_refreshed_at: new Date().toISOString(),
  };
  return payload;
}

serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
    "Cache-Control": "no-store",
  };
  if (req.method === "OPTIONS") return new Response("", { headers: cors });
  try {
    const start = Date.now();
    const body = await req.json().catch(() => ({}));
    const type = body?.type;
    const tmdb_id = body?.tmdb_id;
    if (!type || !tmdb_id) {
      return new Response(JSON.stringify({ error: "Missing type or tmdb_id" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const details = await tmdb(`${type}/${tmdb_id}`);
    const external = await tmdb(`${type}/${tmdb_id}/external_ids`).catch(() => ({}));
    const payload = mapTitlePayload(type, details, external);
    const { data, error } = await supabase.from("tmdb_titles").upsert(payload, { onConflict: "tmdb_id,type" }).select();
    if (error) throw error;
    const end = Date.now();
    return new Response(JSON.stringify({ ok: true, ms: end - start, data }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e && e.message) || e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
