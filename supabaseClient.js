// Supabase client and helpers for zazzle
// Loads after the Supabase CDN script in HTML.

(() => {
  const SUPABASE_URL = 'https://iojzacztjbbjfhwbkvcq.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvanphY3p0amJiamZod2JrdmNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY3Njg1MzYsImV4cCI6MjA3MjM0NDUzNn0.dVCXF0SmKlajFy0A0iU7TusCpFIHPosaa62RvA-cWL0';
  const SDK_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';

  let client = null;
  let readyResolve = null;
  const readyPromise = new Promise((res) => { readyResolve = res; });

  function initClientIfPossible() {
    try {
      if (!client && window.supabase) {
        client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        try { if (window.SUPABASE) window.SUPABASE.client = client; } catch (_) {}
        try { readyResolve && readyResolve(); } catch (_) {}
        try { document.dispatchEvent(new Event('supabase:ready')); } catch (_) {}
      }
    } catch (_) {}
  }

  (function ensureSdk(){
    if (window.supabase) { initClientIfPossible(); return; }
    try {
      const s = document.createElement('script');
      s.src = SDK_CDN;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.referrerPolicy = 'strict-origin-when-cross-origin';
      s.onload = initClientIfPossible;
      s.onerror = () => {
        try {
          const f = document.createElement('script');
          f.src = 'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js';
          f.async = true;
          f.crossOrigin = 'anonymous';
          f.onload = initClientIfPossible;
          document.head.appendChild(f);
        } catch (_) {}
      };
      document.head.appendChild(s);
    } catch (_) {}
  })();

  // Generic fetch wrapper (no timeout/abort)
  async function fetchWithTimeout(url, init = {},timeoutMs = 30000) {
    
    // Keep signature stable so callers continue to work.
    return fetch(url, init || {});
  }
  
  

  // ----- Auth helpers -----
  const auth = {
    async getUser() {
      initClientIfPossible();
      if (!client) return { user: null, error: null };
      const { data, error } = await client.auth.getUser();
      if (error) return { user: null, error };
      return { user: data.user || null, error: null };
    },
    async signUp({ email, password, options = {} }) {
      initClientIfPossible();
      if (!client) throw new Error('Supabase unavailable');
      return client.auth.signUp({ email, password, options });
    },
    async signInWithOtp(email) {
      initClientIfPossible();
      if (!client) throw new Error('Supabase unavailable');
      return client.auth.signInWithOtp({ email });
    },
    async signInWithPassword({ email, password }) {
      initClientIfPossible();
      if (!client) throw new Error('Supabase unavailable');
      return client.auth.signInWithPassword({ email, password });
    },
    async resetPasswordForEmail(email, redirectTo) {
      initClientIfPossible();
      if (!client) throw new Error('Supabase unavailable');
      return client.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
    },
    async updateEmail(newEmail) {
      initClientIfPossible();
      if (!client) throw new Error('Supabase unavailable');
      return client.auth.updateUser({ email: newEmail });
    },
    async signOut() {
      initClientIfPossible();
      if (!client) return { error: null };
      return client.auth.signOut();
    },
    onAuthStateChange(callback) {
      initClientIfPossible();
      if (!client) return { data: { subscription: { unsubscribe(){} } }, error: null };
      return client.auth.onAuthStateChange(callback);
    },
  };

  // ----- Anonymous logs (works with search_logs table) -----
  function getFingerprint() {
    try {
      let id = localStorage.getItem('fp');
      if (!id) { id = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2)); localStorage.setItem('fp', id); }
      return id;
    } catch (_) { return 'anon'; }
  }
  const logs = {
    async search({ query, results = [], userId = null } = {}) {
      initClientIfPossible();
      if (!client) return { data: null, error: new Error('Supabase unavailable') };
      try {
        const topIds = Array.from(new Set((results || []).map(r => r && r.id).filter(Boolean))).slice(0, 25);
        const payload = {
          user_id: userId || null,
          query: String(query || ''),
          result_count: Array.isArray(results) ? results.length : 0,
          top_tmdb_ids: topIds,
          client_fingerprint: getFingerprint(),
        };
        const { data, error } = await client.from('search_logs').insert(payload).select();
        return { data, error };
      } catch (e) {
        return { data: null, error: e };
      }
    }
  };

  async function requireUser() {
    const { user, error } = await auth.getUser();
    if (error) throw error;
    if (!user) throw new Error('Not authenticated');
    return user;
  }

  // ----- Favorites helpers -----
  const favorites = {
    async list() {
      const user = await requireUser();
      const { data, error } = await client
        .from('favorites')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      return { data, error };
    },
    async save({ tmdb_id, media_type, title, poster_path, backdrop_path, overview, popularity }) {
      const user = await requireUser();
      const payload = {
        user_id: user.id,
        tmdb_id,
        media_type, // 'movie' | 'tv'
        title: title ?? null,
        poster_path: poster_path ?? null,
        backdrop_path: backdrop_path ?? null,
        overview: overview ?? null,
        popularity: typeof popularity === 'number' ? popularity : null,
      };
      const { data, error } = await client.from('favorites').upsert(payload, { onConflict: 'user_id,tmdb_id,media_type' }).select();
      return { data, error };
    },
    async remove({ tmdb_id, media_type }) {
      const user = await requireUser();
      const { data, error } = await client
        .from('favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('tmdb_id', tmdb_id)
        .eq('media_type', media_type);
      return { data, error };
    },
  };

  // ----- Watchlist helpers -----
  const watchlist = {
    async list() {
      const user = await requireUser();
      const { data, error } = await client
        .from('watchlist')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      return { data, error };
    },
    async add({ tmdb_id, media_type, title, poster_path, backdrop_path, overview }) {
      const user = await requireUser();
      const payload = {
        user_id: user.id,
        tmdb_id,
        media_type, // 'movie' | 'tv'
        title: title ?? null,
        poster_path: poster_path ?? null,
        backdrop_path: backdrop_path ?? null,
        overview: overview ?? null,
      };
      const { data, error } = await client.from('watchlist').upsert(payload, { onConflict: 'user_id,tmdb_id,media_type' }).select();
      return { data, error };
    },
    async remove({ tmdb_id, media_type }) {
      const user = await requireUser();
      const { data, error } = await client
        .from('watchlist')
        .delete()
        .eq('user_id', user.id)
        .eq('tmdb_id', tmdb_id)
        .eq('media_type', media_type);
      return { data, error };
    },
  };

  // ----- Search history helpers -----
  const searchHistory = {
    async record({ q, filter = null, page = null }) {
      const user = await requireUser();
      const payload = { user_id: user.id, q, filter, page };
      const { data, error } = await client.from('search_history').insert(payload).select();
      return { data, error };
    },
    async list({ limit = 20 } = {}) {
      const user = await requireUser();
      const { data, error } = await client
        .from('search_history')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      return { data, error };
    },
    async clear() {
      const user = await requireUser();
      const { data, error } = await client
        .from('search_history')
        .delete()
        .eq('user_id', user.id);
      return { data, error };
    }
  };

  // ----- Search results helpers -----
  const searchResults = {
    async store(query, results) {
      initClientIfPossible();
      if (!client) return { data: null, error: new Error('Supabase unavailable') };
      const user = await requireUser();
      const payload = results.map(item => ({
        user_id: user.id,
        query,
        tmdb_id: item.id,
        type: item.title ? 'movie' : 'tv',
        title: item.title || item.name,
        poster_path: item.poster_path,
        backdrop_path: item.backdrop_path,
        overview: item.overview,
        release_date: item.release_date || item.first_air_date,
        popularity: item.popularity,
        vote_average: item.vote_average
      }));
      
      // Clear existing results for this query first
      await client
        .from('search_results')
        .delete()
        .eq('user_id', user.id)
        .eq('query', query);
        
      const { data, error } = await client.from('search_results').insert(payload).select();
      return { data, error };
    },
    async get(query) {
      initClientIfPossible();
      if (!client) return { data: [], error: new Error('Supabase unavailable') };
      const user = await requireUser();
      const { data, error } = await client
        .from('search_results')
        .select('*')
        .eq('user_id', user.id)
        .eq('query', query)
        .order('created_at', { ascending: false });
      return { data, error };
    }
  };

  // ----- TMDB direct client (no Edge Function) -----
  const TMDB_API_KEY_PUBLIC = '668153cb301606fdc86fef072e7daf06';
  const TMDB_BASE = 'https://api.themoviedb.org/3';
  const TMDB_DEFAULT_LANGUAGE = 'en-US';
  const tmdbProxy = {
    async call(path, query = {}) {
      const qs = new URLSearchParams({ ...(query || {}), api_key: TMDB_API_KEY_PUBLIC, language: TMDB_DEFAULT_LANGUAGE });
      const url = `${TMDB_BASE}/${String(path || '').replace(/^\/+/, '')}?${qs.toString()}`;
      try {
        const res = await fetchWithTimeout(url, { headers: { 'Accept': 'application/json' } }, 12000);
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        let text = null; try { text = await res.text(); } catch {}
        const data = ct.includes('application/json') ? (text ? JSON.parse(text) : null) : text;
        if (!res.ok) return { data: null, error: new Error((data && data.status_message) || 'TMDB error') };
        return { data, error: null };
      } catch (e) {
        return { data: null, error: e };
      }
    },
  };

  // ingest-tmdb function has been removed; no client helper exported

  // ----- DB helpers: titles, episodes, streams -----
  const dbTitles = {
    async getByTmdbId(type, tmdb_id) {
      initClientIfPossible();
      if (!client) return { data: null, error: new Error('Supabase unavailable') };
      const { data, error } = await client
        .from('tmdb_titles')
        .select('*')
        .eq('type', type)
        .eq('tmdb_id', tmdb_id)
        .order('created_at', { ascending: false })
        .limit(1);
      return { data: Array.isArray(data) && data.length ? data[0] : null, error };
    },
    async upsertBasic(type, details = {}) {
      // Prefer Supabase Edge Function (service role) to satisfy RLS. Fall back to direct upsert if allowed.
      initClientIfPossible();
      if (!client) return { data: null, error: new Error('Supabase unavailable') };
      const tmdb_id = Number(details.id || details.tmdb_id || 0);
      if (!tmdb_id) return { data: null, error: new Error('Missing tmdb_id') };
      // Try edge function first (handles fetching/external_ids and service-role upsert)
      try {
        const isLocal = (typeof location !== 'undefined') && /^(localhost|127\.0\.0\.1)$/.test(location.hostname || '');
        if (isLocal) throw new Error('skip-edge-on-localhost');
        const fnUrl = `${SUPABASE_URL}/functions/v1/cache-title`;
        const res = await fetch(fnUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
          body: JSON.stringify({ type, tmdb_id })
        });
        if (res.ok) {
          const json = await res.json().catch(()=>null);
          return { data: json?.data || null, error: null };
        }
      } catch (_) {}
      // Fallback best-effort direct upsert (will be denied by RLS unless policies allow)
      try {
        const payload = {
          tmdb_id,
          type,
          imdb_id: details.imdb_id || null,
          title: details.title || details.name || null,
          original_title: details.original_title || details.original_name || null,
          overview: details.overview || null,
          release_date: details.release_date || null,
          first_air_date: details.first_air_date || null,
          rating: typeof details.vote_average === 'number' ? details.vote_average : null,
          raw_tmdb: details && typeof details === 'object' ? details : null,
          last_refreshed_at: new Date().toISOString(),
        };
        const { data, error } = await client
          .from('tmdb_titles')
          .upsert(payload, { onConflict: 'tmdb_id,type' })
          .select();
        return { data, error };
      } catch (e) {
        return { data: null, error: e };
      }
    },
  };

  const dbEpisodes = {
    async listSeason(show_tmdb_id, season_number) {
      initClientIfPossible();
      if (!client) return { data: [], error: new Error('Supabase unavailable') };
      const { data, error } = await client
        .from('tmdb_episodes')
        .select('season_number,episode_number,title,overview,still_url,runtime,air_date')
        .eq('show_tmdb_id', show_tmdb_id)
        .eq('season_number', season_number)
        .order('episode_number', { ascending: true });
      return { data: data || [], error };
    },
    async seasonNumbers(show_tmdb_id) {
      initClientIfPossible();
      if (!client) return { data: [], error: new Error('Supabase unavailable') };
      const { data, error } = await client
        .from('tmdb_episodes')
        .select('season_number')
        .eq('show_tmdb_id', show_tmdb_id);
      const nums = Array.isArray(data) ? Array.from(new Set(data.map(r => r.season_number))).sort((a,b)=>a-b) : [];
      return { data: nums, error };
    },
  };

  // ----- Profiles helper -----
  const profiles = {
    async get() {
      const user = await requireUser();
      const { data, error } = await client
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      return { data, error };
    },
    async update(fields = {}) {
      const user = await requireUser();
      const payload = { ...(fields || {}) };
      // Update-only to avoid INSERT path that can trip RLS when a row already exists
      const { data, error } = await client
        .from('profiles')
        .update(payload)
        .eq('id', user.id)
        .select()
        .maybeSingle();
      return { data, error };
    },
    async uploadAvatar(file) {
      const user = await requireUser();
      try {
        const fileExt = (file.name || 'jpg').split('.').pop();
        const path = `${user.id}/${Date.now()}.${fileExt}`;
        const { error: upErr } = await client.storage.from('avatars').upload(path, file, { upsert: true, cacheControl: '3600' });
        if (upErr) return { url: null, error: upErr };
        const { data } = client.storage.from('avatars').getPublicUrl(path);
        const url = data?.publicUrl || null;
        return { url, error: null };
      } catch (e) {
        return { url: null, error: e };
      }
    },
  };

  // ----- Watch Progress (Continue Watching) -----
  const watchProgress = {
    async upsert({ tmdb_id, media_type, season = null, episode = null, title = null, poster_path = null, backdrop_path = null, progress_seconds = 0, duration_seconds = 0 }) {
      const user = await requireUser();
      // Normalize season/episode: store 0 for movies so we can target with EQ and avoid NULL issues
      const s = media_type === 'tv' ? (Number.isFinite(season) ? Number(season) : null) : 0;
      const e = media_type === 'tv' ? (Number.isFinite(episode) ? Number(episode) : null) : 0;
      const nowIso = new Date().toISOString();
      const payload = {
        user_id: user.id,
        tmdb_id,
        media_type,
        season: s,
        episode: e,
        title,
        poster_path,
        backdrop_path,
        progress_seconds: Math.max(0, Math.floor(progress_seconds || 0)),
        duration_seconds: Math.max(0, Math.floor(duration_seconds || 0)),
        last_watched_at: nowIso,
      };
      // Try insert first, then update on duplicate
      let ins = await client.from('watch_progress').insert(payload).select();
      if (!ins.error) return ins;
      // If duplicate or conflict, update the existing row
      let q = client
        .from('watch_progress')
        .update({
          title: payload.title,
          poster_path: payload.poster_path,
          backdrop_path: payload.backdrop_path,
          progress_seconds: payload.progress_seconds,
          duration_seconds: payload.duration_seconds,
          last_watched_at: nowIso,
        })
        .eq('user_id', user.id)
        .eq('tmdb_id', tmdb_id)
        .eq('media_type', media_type);
      // Handle nullable season/episode for TV shows
      if (s === null) q = q.is('season', null); else q = q.eq('season', s);
      if (e === null) q = q.is('episode', null); else q = q.eq('episode', e);
      const upd = await q.select();
      return upd;
    },
    async listRecent(limit = 4) {
      const user = await requireUser();
      const { data, error } = await client
        .from('watch_progress')
        .select('*')
        .eq('user_id', user.id)
        .order('last_watched_at', { ascending: false })
        .limit(limit);
      return { data: data || [], error };
    },
    async touch({ tmdb_id, media_type, season = null, episode = null, title = null, poster_path = null, backdrop_path = null }) {
      return this.upsert({ tmdb_id, media_type, season, episode, title, poster_path, backdrop_path, progress_seconds: 0, duration_seconds: 0 });
    }
  };

  // Expose on window
  window.SUPABASE = {
    client,
    auth,
    favorites,
    watchlist,
    watchProgress,
    searchHistory,
    searchResults,
    tmdbProxy,
    dbTitles,
    dbEpisodes,
    profiles,
    logs,
    ready: () => readyPromise,
    isReady: () => { initClientIfPossible(); return !!client; },
  };
})();
