/* Results page controller for Movies, Series, and Animation
   - Prefers backend /api/search with Redis/ES, falls back to TMDB
   - Renders 12 items/page grid with pagination
   - Keeps URL (?q=, ?page=) in sync using pushState
*/
(function () {
  const grid = document.getElementById('results-grid');
  const sub = document.getElementById('results-sub');
  const featured = document.getElementById('results-featured');
  const pagination = document.getElementById('pagination');
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const pageInfo = document.getElementById('page-info');
  const filterBar = document.getElementById('filter-bar');

  if (!grid || !sub || !featured || !pagination || !prevBtn || !nextBtn || !pageInfo) return;

  const params = new URLSearchParams(location.search);
  const initialQuery = (params.get('q') || '').trim();
  const initialPage = Math.max(parseInt(params.get('page') || '1', 10) || 1, 1);
  const initialFilterParam = String(params.get('filter') || 'popular').toLowerCase();
  const allowedFilters = ['popular', 'top_rated', 'latest'];
  const initialFilter = allowedFilters.includes(initialFilterParam) ? initialFilterParam : 'popular';

  const path = location.pathname.toLowerCase();
  let pageKind = 'movie'; // movie | tv | animation
  if (path.endsWith('series.html')) pageKind = 'tv';
  else if (path.endsWith('animation.html')) pageKind = 'animation';

  const LIMIT = 12;

  const state = {
    q: initialQuery,
    page: initialPage,
    filter: initialFilter, // popular | top_rated | latest
    totalPages: 1,
    totalResults: 0,
    items: []
  };

  function setLoading(loading) {
    if (loading) {
      sub.textContent = state.q ? `Searching for "${state.q}"…` : 'Loading…';
      if (featured) featured.innerHTML = '';
      grid.innerHTML = '';
    }
  }

  function toCardHTML(item, idx) {
    const title = (item.title || item.name || 'Untitled').replace(/"/g, '&quot;');
    const year = (item.release_date || item.first_air_date || '').slice(0, 4);
    const img = item.poster_path ? `${TMDB_IMG}w342${item.poster_path}` : '';
    const imgTag = img ? `<img class="result-thumb" src="${img}" alt="${title}">` : `<div class="result-thumb placeholder" aria-hidden="true"></div>`;
    return `
      <article class="result-card" role="listitem" data-idx="${idx}">
        ${imgTag}
        <div class="result-actions">
          <button class="result-btn secondary" data-action="watch" data-idx="${idx}"><span>See More</span></button>
        </div>
        <div class="result-meta">
          <div class="result-title">${title}</div>
          <div class="result-sub">${year || ''}</div>
        </div>
      </article>
    `;
  }

  function toFeaturedHTML(item) {
    const title = (item.title || item.name || 'Untitled').replace(/"/g, '&quot;');
    const year = (item.release_date || item.first_air_date || '').slice(0, 4);
    const bg = item.backdrop_path ? `${TMDB_IMG}w780${item.backdrop_path}` : (item.poster_path ? `${TMDB_IMG}w500${item.poster_path}` : '');
    const imgTag = bg ? `<img class="featured-img" src="${bg}" alt="${title}">` : `<div class="featured-img placeholder" aria-hidden="true"></div>`;
    return `
      <article class="featured-card">
        ${imgTag}
        <div class="featured-overlay"></div>
        <div class="featured-meta">
          <h2 class="featured-title">${title}</h2>
          <div class="featured-sub">${year || ''}</div>
          <div class="featured-actions">
            <button class="featured-btn" data-action="watch" data-idx="0"><span>See More</span></button>
            <button class="featured-btn secondary" data-action="details"><i data-lucide="info"></i><span>Details</span></button>
          </div>
        </div>
      </article>
    `;
  }

  function render() {
    const showFeatured = state.page === 1 && state.items.length > 0;
    if (featured) {
      featured.innerHTML = showFeatured ? toFeaturedHTML(state.items[0]) : '';
    }
    grid.classList.add('masonry');
    const renderItems = showFeatured ? state.items.slice(1) : state.items;
    grid.innerHTML = renderItems.map((it, i) => toCardHTML(it, showFeatured ? i + 1 : i)).join('');

    // Sub header text
    const filterLabel = state.filter === 'popular' ? 'Popular' : state.filter === 'top_rated' ? 'Top Rated' : 'Latest';
    const kindLabel = pageKind === 'movie' ? 'Movies' : pageKind === 'tv' ? 'Series' : 'Animation';
    sub.textContent = state.q
      ? `${state.totalResults} results for "${state.q}" — page ${state.page} of ${state.totalPages}`
      : `${filterLabel} ${kindLabel}`;

    const disablePrev = state.page <= 1;
    const disableNext = state.page >= state.totalPages;
    prevBtn.disabled = disablePrev;
    nextBtn.disabled = disableNext;
    pagination.hidden = state.totalPages <= 1 && !state.q ? true : false;
    pageInfo.textContent = `Page ${state.page} / ${state.totalPages}`;

    try { if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons(); } catch (_) {}

    // Update filter tab active state
    if (filterBar) {
      const tabs = Array.from(filterBar.querySelectorAll('.filter-tab'));
      tabs.forEach(btn => {
        const isActive = btn.getAttribute('data-filter') === state.filter;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
    }
  }

  async function fetchBackend() {
    const type = pageKind === 'tv' ? 'tv' : 'movie';
    let url;
    if (state.q) {
      url = `/api/search?q=${encodeURIComponent(state.q)}&type=${encodeURIComponent(type)}&page=${state.page}&limit=${LIMIT}`;
    } else {
      if (pageKind === 'movie' || pageKind === 'tv') {
        if (state.filter === 'popular') {
          url = `/api/trending?type=${encodeURIComponent(type)}&page=${state.page}&limit=${LIMIT}`;
        } else if (state.filter === 'top_rated') {
          url = `/api/discover?type=${encodeURIComponent(type)}&sort_by=vote_average.desc&page=${state.page}&limit=${LIMIT}`;
        } else { // latest
          const sort = type === 'tv' ? 'first_air_date.desc' : 'primary_release_date.desc';
          url = `/api/discover?type=${encodeURIComponent(type)}&sort_by=${encodeURIComponent(sort)}&page=${state.page}&limit=${LIMIT}`;
        }
      } else {
        // animation category uses movie discover with animation genre
        const base = `/api/discover?type=movie&with_genres=16`;
        if (state.filter === 'popular') url = `${base}&sort_by=popularity.desc&page=${state.page}&limit=${LIMIT}`;
        else if (state.filter === 'top_rated') url = `${base}&sort_by=vote_average.desc&page=${state.page}&limit=${LIMIT}`;
        else url = `${base}&sort_by=primary_release_date.desc&page=${state.page}&limit=${LIMIT}`;
      }
    }

    const resp = await fetch(`${API_BASE}${url}`);
    if (!resp.ok) throw new Error('Backend unavailable');
    const data = await resp.json();

    // Support flexible shapes
    let items = [];
    let totalResults = 0;
    let totalPages = 1;

    if (Array.isArray(data.results)) {
      items = data.results;
      totalResults = data.total_results || data.total || items.length;
      totalPages = data.total_pages || Math.max(1, Math.ceil(totalResults / LIMIT));
    } else if (pageKind === 'tv' && Array.isArray(data.series)) {
      items = data.series;
      totalResults = data.seriesTotal || data.total || items.length;
      totalPages = data.total_pages || Math.max(1, Math.ceil(totalResults / LIMIT));
    } else if (Array.isArray(data.movies)) {
      items = data.movies;
      totalResults = data.movieTotal || data.total || items.length;
      totalPages = data.total_pages || Math.max(1, Math.ceil(totalResults / LIMIT));
    }

    return { items, totalResults, totalPages };
  }

  async function fetchFromTMDB() {
    if (state.q) {
      if (pageKind === 'movie') {
        const r = await fetch(`${TMDB_BASE}/search/movie?api_key=${TMDB_API_KEY}&language=en-US&include_adult=false&page=${state.page}&query=${encodeURIComponent(state.q)}`);
        const j = await r.json();
        return {
          items: (j.results || []).filter(Boolean),
          totalResults: j.total_results || 0,
          totalPages: j.total_pages || 1
        };
      } else if (pageKind === 'tv') {
        const r = await fetch(`${TMDB_BASE}/search/tv?api_key=${TMDB_API_KEY}&language=en-US&include_adult=false&page=${state.page}&query=${encodeURIComponent(state.q)}`);
        const j = await r.json();
        return {
          items: (j.results || []).filter(Boolean),
          totalResults: j.total_results || 0,
          totalPages: j.total_pages || 1
        };
      } else {
        // animation: search multi, then filter by genre 16 and exclude persons
        const r = await fetch(`${TMDB_BASE}/search/multi?api_key=${TMDB_API_KEY}&language=en-US&include_adult=false&page=${state.page}&query=${encodeURIComponent(state.q)}`);
        const j = await r.json();
        const filtered = (j.results || []).filter(x => x && x.media_type !== 'person' && Array.isArray(x.genre_ids) && x.genre_ids.includes(16));
        return {
          items: filtered,
          totalResults: filtered.length, // approximate for this page
          totalPages: j.total_pages || 1
        };
      }
    } else {
      // No query: respect selected filter for each page kind
      if (pageKind === 'movie') {
        let url;
        if (state.filter === 'popular') {
          url = `${TMDB_BASE}/discover/movie?api_key=${TMDB_API_KEY}&language=en-US&include_adult=false&sort_by=popularity.desc&page=${state.page}`;
        } else if (state.filter === 'top_rated') {
          url = `${TMDB_BASE}/discover/movie?api_key=${TMDB_API_KEY}&language=en-US&include_adult=false&sort_by=vote_average.desc&page=${state.page}`;
        } else {
          url = `${TMDB_BASE}/discover/movie?api_key=${TMDB_API_KEY}&language=en-US&include_adult=false&sort_by=primary_release_date.desc&page=${state.page}`;
        }
        const r = await fetch(url);
        const j = await r.json();
        return {
          items: (j.results || []).filter(Boolean),
          totalResults: j.total_results || 0,
          totalPages: j.total_pages || 1
        };
      } else if (pageKind === 'tv') {
        let url;
        if (state.filter === 'popular') {
          url = `${TMDB_BASE}/discover/tv?api_key=${TMDB_API_KEY}&language=en-US&include_adult=false&sort_by=popularity.desc&page=${state.page}`;
        } else if (state.filter === 'top_rated') {
          url = `${TMDB_BASE}/discover/tv?api_key=${TMDB_API_KEY}&language=en-US&include_adult=false&sort_by=vote_average.desc&page=${state.page}`;
        } else {
          url = `${TMDB_BASE}/discover/tv?api_key=${TMDB_API_KEY}&language=en-US&include_adult=false&sort_by=first_air_date.desc&page=${state.page}`;
        }
        const r = await fetch(url);
        const j = await r.json();
        return {
          items: (j.results || []).filter(Boolean),
          totalResults: j.total_results || 0,
          totalPages: j.total_pages || 1
        };
      } else {
        // Animation: discover movies constrained to animation genre
        const base = `${TMDB_BASE}/discover/movie?api_key=${TMDB_API_KEY}&language=en-US&include_adult=false&with_genres=16`;
        const sort = state.filter === 'popular'
          ? 'popularity.desc'
          : state.filter === 'top_rated'
            ? 'vote_average.desc'
            : 'primary_release_date.desc';
        const r = await fetch(`${base}&sort_by=${sort}&page=${state.page}`);
        const j = await r.json();
        return {
          items: (j.results || []).filter(Boolean),
          totalResults: j.total_results || 0,
          totalPages: j.total_pages || 1
        };
      }
    }
  }

  async function recordSearchIfSignedIn() {
    try {
      if (!state.q) return;
      if (window.SUPABASE && window.SUPABASE.auth && window.SUPABASE.searchHistory) {
        const { user } = await window.SUPABASE.auth.getUser();
        if (user) {
          await window.SUPABASE.searchHistory.record({ q: state.q, filter: state.filter, page: state.page });
        }
      }
    } catch (_) {}
  }

  async function load() {
    setLoading(true);
    try {
      let data;
      try {
        data = await fetchBackend();
      } catch (_) {
        data = await fetchFromTMDB();
      }

      // Normalize and clamp to 12 items per page for consistency
      state.items = (data.items || []).slice(0, LIMIT);
      state.totalResults = data.totalResults || state.items.length;
      state.totalPages = Math.max(1, data.totalPages || Math.ceil(state.totalResults / LIMIT));
      render();
      await recordSearchIfSignedIn();
    } catch (e) {
      if (featured) featured.innerHTML = '';
      grid.innerHTML = '<div style="padding:12px">Unable to load results.</div>';
      sub.textContent = 'An error occurred.';
      pagination.hidden = true;
    }
  }

  function goTo(page) {
    state.page = Math.max(1, Math.min(page, state.totalPages || 1));
    const nextParams = new URLSearchParams(location.search);
    if (state.q) nextParams.set('q', state.q); else nextParams.delete('q');
    nextParams.set('page', String(state.page));
    if (state.filter) nextParams.set('filter', state.filter);
    const newURL = `${location.pathname}?${nextParams.toString()}`;
    history.pushState({ page: state.page, q: state.q }, '', newURL);
    load();
  }

  // Wire pagination
  prevBtn.addEventListener('click', () => { if (state.page > 1) goTo(state.page - 1); });
  nextBtn.addEventListener('click', () => { if (state.page < state.totalPages) goTo(state.page + 1); });
  window.addEventListener('popstate', (ev) => {
    const p = new URLSearchParams(location.search);
    state.q = (p.get('q') || '').trim();
    state.page = Math.max(parseInt(p.get('page') || '1', 10) || 1, 1);
    const f = String(p.get('filter') || 'popular').toLowerCase();
    state.filter = ['popular','top_rated','latest'].includes(f) ? f : 'popular';
    load();
  });

  // Wire filter bar tabs
  if (filterBar) {
    filterBar.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-tab');
      if (!btn) return;
      const f = btn.getAttribute('data-filter');
      if (!f || f === state.filter) return;
      state.filter = f;
      state.page = 1;
      // Clear search query so filter applies to category feed
      if (state.q) state.q = '';
      // Update URL and reload
      const nextParams = new URLSearchParams(location.search);
      if (state.q) nextParams.set('q', state.q); else nextParams.delete('q');
      nextParams.set('page', '1');
      nextParams.set('filter', state.filter);
      const newURL = `${location.pathname}?${nextParams.toString()}`;
      history.pushState({ page: state.page, q: state.q, filter: state.filter }, '', newURL);
      load();
    });
  }

  // Delegate actions for cards
  if (grid) {
    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('.result-btn');
      if (!btn) return;
      const idx = parseInt(btn.getAttribute('data-idx') || '-1', 10);
      if (!(idx >= 0 && idx < state.items.length)) return;
      const item = state.items[idx];
      const action = btn.getAttribute('data-action');
      if (action === 'watch') {
        const destType = item.media_type ? (item.media_type === 'tv' ? 'tv' : 'movie') : (pageKind === 'tv' ? 'tv' : 'movie');
        window.location.href = `detail.html?id=${item.id}&type=${destType}`;
      } else if (action === 'trailer') {
        try { if (typeof openTrailerForItem === 'function') openTrailerForItem(item); } catch (_) {}
      }
    });
  }

  // Featured trailer button
  if (featured) {
    featured.addEventListener('click', (e) => {
      const btn = e.target.closest('.featured-btn');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      if (!state.items.length) return;
      const item = state.items[0];
      if (action === 'watch' || action === 'details') {
        const destType = item.media_type ? (item.media_type === 'tv' ? 'tv' : 'movie') : (pageKind === 'tv' ? 'tv' : 'movie');
        window.location.href = `detail.html?id=${item.id}&type=${destType}`;
      } else if (action === 'trailer') {
        try { if (typeof openTrailerForItem === 'function') openTrailerForItem(item); } catch (_) {}
      }
    });
  }

  // Kick off
  load();
})();
