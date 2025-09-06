// Supabase client and helpers for zazzle
// Loads after the Supabase CDN script in HTML.

(() => {
  const SUPABASE_URL = 'https://iojzacztjbbjfhwbkvcq.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvanphY3p0amJiamZod2JrdmNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY3Njg1MzYsImV4cCI6MjA3MjM0NDUzNn0.dVCXF0SmKlajFy0A0iU7TusCpFIHPosaa62RvA-cWL0';

  const hasSdk = !!window.supabase;
  if (!hasSdk) {
    console.warn('Supabase SDK not found. Running in degraded (no-auth) mode.');
  }

  // Supabase client (no Edge Functions usage)
  const client = hasSdk ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

  // Generic fetch wrapper (no timeout/abort)
  async function fetchWithTimeout(url, init = {},timeoutMs = 30000) {
    
    // Keep signature stable so callers continue to work.
    return fetch(url, init || {});
  }
  
  

  // ----- Auth helpers -----
  const auth = {
    async getUser() {
      if (!client) return { user: null, error: null };
      const { data, error } = await client.auth.getUser();
      if (error) return { user: null, error };
      return { user: data.user || null, error: null };
    },
    async signInWithOtp(email) {
      if (!client) throw new Error('Supabase unavailable');
      return client.auth.signInWithOtp({ email });
    },
    async signInWithPassword({ email, password }) {
      if (!client) throw new Error('Supabase unavailable');
      return client.auth.signInWithPassword({ email, password });
    },
    async signOut() {
      if (!client) return { error: null };
      return client.auth.signOut();
    },
    onAuthStateChange(callback) {
      if (!client) return { data: { subscription: { unsubscribe(){} } }, error: null };
      return client.auth.onAuthStateChange(callback);
    },
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
      const { data, error } = await client
        .from('tmdb_titles')
        .select('*')
        .eq('type', type)
        .eq('tmdb_id', tmdb_id)
        .order('created_at', { ascending: false })
        .limit(1);
      return { data: Array.isArray(data) && data.length ? data[0] : null, error };
    },
  };

  const dbEpisodes = {
    async listSeason(show_tmdb_id, season_number) {
      const { data, error } = await client
        .from('tmdb_episodes')
        .select('season_number,episode_number,title,overview,still_url,runtime,air_date')
        .eq('show_tmdb_id', show_tmdb_id)
        .eq('season_number', season_number)
        .order('episode_number', { ascending: true });
      return { data: data || [], error };
    },
    async seasonNumbers(show_tmdb_id) {
      const { data, error } = await client
        .from('tmdb_episodes')
        .select('season_number')
        .eq('show_tmdb_id', show_tmdb_id);
      const nums = Array.isArray(data) ? Array.from(new Set(data.map(r => r.season_number))).sort((a,b)=>a-b) : [];
      return { data: nums, error };
    },
  };

  

  // Expose on window
  window.SUPABASE = {
    client,
    auth,
    favorites,
    watchlist,
    searchHistory,
    searchResults,
    tmdbProxy,
    dbTitles,
    dbEpisodes,
  };
})();
