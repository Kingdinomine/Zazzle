// Cinematic Detail Page Controller
(() => {
  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));

  // Elements (must be defined before any usage in renderNotFound or elsewhere)
  const bgImg = qs('#detail-bg-img');
  const titleEl = qs('#detail-title');
  const overviewEl = qs('#detail-overview');
  const castScroller = qs('#cast-scroller');
  const castCreator = qs('#cast-creator');
  const castStars = qs('#cast-stars');
  const watchBtn = qs('#watch-btn');
  const watchlistBtn = qs('#watchlist-btn');
  const trailerSection = qs('#trailer-section');
  const trailerCard = qs('#trailer-card');
  const trailerThumb = qs('#trailer-thumb');
  const episodesSection = qs('#episodes-section');
  const seasonSelect = qs('#season-select');
  const episodesGrid = qs('#episodes-grid');

  // TMDB base helpers (prefer Supabase Edge Function proxy; fallback to direct API)
  const TMDB_BASE = 'https://api.themoviedb.org/3';
  const TMDB_IMG = 'https://image.tmdb.org/t/p/';
  const TMDB_API_KEY = '668153cb301606fdc86fef072e7daf06'; // fallback only

  async function tmdb(path, query = {}) {
    const tryProxy = async (p) => {
      try {
        if (!window.SUPABASE?.tmdbProxy) return null;
        const { data, error } = await window.SUPABASE.tmdbProxy.call(p, query);
        // If Edge Function returns a TMDB error payload, treat it as failure so we can fallback
        if (error || !data || data.success === false || typeof data.status_code === 'number') {
          console.warn('TMDB proxy returned error payload, falling back to direct:', { p, error, data });
          return null;
        }
        return data;
      } catch (_) { return null; }
    };

    // Try proxy with given path, then without leading slash
    let data = await tryProxy(path);
    if (!data && path.startsWith('/')) data = await tryProxy(path.slice(1));

    // Fallback: direct TMDB
    if (!data) {
      const normalized = path.startsWith('/') ? path : `/${path}`;
      const url = new URL(`${TMDB_BASE}${normalized}`);
      url.searchParams.set('api_key', TMDB_API_KEY);
      url.searchParams.set('language', 'en-US');
      Object.entries(query || {}).forEach(([k, v]) => url.searchParams.set(k, v));
      const r = await fetch(url.toString());
      data = await r.json();
    }

    // Debug logging for series issues
    if (String(path).includes('/tv/') && data && data.success === false) {
      console.error('TMDB API Error for TV series:', data);
    }
    return data;
  }

  // URL params
  const params = new URLSearchParams(location.search);
  const id = parseInt(params.get('id') || '0', 10);
  const typeParam = (params.get('type') || 'movie').toLowerCase();
  const type = (typeParam === 'tv' || typeParam === 'series') ? 'tv' : 'movie';
  
  console.log('Detail page params:', { id, type, typeParam });

  if (!(id > 0)) {
    renderNotFound();
    return;
  }

  // Trailer overlay elements
  const trailerOverlay = qs('#trailer-overlay');
  const trailerCloseBtn = qs('.trailer-close');
  const trailerFrame = qs('#trailer-frame');

  // Page init
  initNavMinimal();
  loadDetail().then(() => initAnimations());

  // ----- Rendering -----
  async function loadDetail() {
    try {
      const [details, credits, videos] = await Promise.all([
        tmdb(`/${type}/${id}`),
        tmdb(`/${type}/${id}/credits`),
        tmdb(`/${type}/${id}/videos`)
      ]);

      if (!details || details.success === false || details.status_code === 34) {
        console.error('Failed to load details:', details);
        renderNotFound();
        return;
      }

      const title = details.title || details.name || 'Untitled';
      const overview = details.overview || '';
      const backdrop = details.backdrop_path || details.poster_path || '';

      // Background
      if (bgImg && backdrop) {
        bgImg.src = `${TMDB_IMG}w1280${backdrop}`;
        bgImg.srcset = `${TMDB_IMG}w780${backdrop} 780w, ${TMDB_IMG}w1280${backdrop} 1280w, ${TMDB_IMG}original${backdrop} 1920w`;
        bgImg.sizes = '100vw';
        bgImg.alt = `${title} background`;
        try { bgImg.setAttribute('fetchpriority', 'high'); } catch (_) {}
        try { bgImg.decoding = 'async'; } catch (_) {}
      }

      // Title & overview
      if (titleEl) titleEl.textContent = title;
      if (overviewEl) overviewEl.textContent = overview;

      // Cast
      renderCast(credits);

      // Trailer (card) and Watch button routing
      const key = extractTrailerKey(videos);
      if (key) {
        setTrailerThumb(key, backdrop);
        trailerCard?.addEventListener('click', () => openTrailer(key));
      } else {
        // Set still as trailer thumb if available
        if (trailerSection && trailerThumb && backdrop) {
          trailerThumb.src = `${TMDB_IMG}w780${backdrop}`;
        } else {
          trailerSection?.setAttribute('hidden', '');
        }
      }

      // Watch button navigates to player page
      watchBtn?.addEventListener('click', () => {
        if (type === 'tv') {
          const s = 1; const e = 1; // default start
          location.href = `watch.html?type=tv&id=${id}&season=${s}&episode=${e}`;
        } else {
          location.href = `watch.html?type=movie&id=${id}`;
        }
      });

      // Watchlist
      setupWatchlist(watchlistBtn, details, type);

      // Episodes (TV)
      if (type === 'tv') {
        episodesSection?.removeAttribute('hidden');
        setupSeasons(details);
      } else {
        // Hide episodes section and season selector for movies
        episodesSection?.setAttribute('hidden', '');
        const seasonSelector = document.querySelector('.season-selector');
        if (seasonSelector) seasonSelector.style.display = 'none';
      }

      // Icons
      try { if (window.lucide?.createIcons) window.lucide.createIcons(); } catch (_) {}
    } catch (e) {
      console.error('Error loading detail:', e);
      renderNotFound();
    }
  }

  function buildMeta(details, type) {
    const items = [];
    const year = (details.release_date || details.first_air_date || '').slice(0, 4);
    if (year) items.push(year);

    if (type === 'movie') {
      const mins = Number(details.runtime) || 0;
      if (mins) items.push(`${mins}m`);
    } else {
      const seasons = details.number_of_seasons || 0;
      if (seasons) items.push(`${seasons} season${seasons > 1 ? 's' : ''}`);
      const eps = details.number_of_episodes || 0;
      if (eps) items.push(`${eps} ep${eps > 1 ? 's' : ''}`);
    }

    const rating = details.vote_average ? `★ ${details.vote_average.toFixed(1)}` : null;
    if (rating) items.push(rating);

    const genres = Array.isArray(details.genres) ? details.genres.map(g => g.name).slice(0, 3).join(', ') : '';
    if (genres) items.push(genres);

    return items.map(x => `<span>${escapeHTML(x)}</span>`).join('<span class="dot">•</span>');
  }

  function renderCast(credits) {
    if (!castScroller) return;
    const cast = Array.isArray(credits?.cast) ? credits.cast.filter(c => c && c.profile_path).slice(0, 10) : [];
    const crew = Array.isArray(credits?.crew) ? credits.crew : [];
    
    // Find creator/director info
    const creator = crew.find(c => c.job === 'Creator' || c.job === 'Executive Producer') || crew.find(c => c.job === 'Director');
    if (creator && castCreator) {
      castCreator.textContent = `Creator: ${creator.name}`;
    }
    
    // Show main stars
    if (cast.length && castStars) {
      const stars = cast.slice(0, 3).map(c => c.name).join(', ');
      castStars.textContent = `Stars: ${stars}`;
    }
    
    if (!cast.length) {
      castScroller.innerHTML = '<div style="opacity:.8">No cast found.</div>';
      return;
    }
    
    castScroller.innerHTML = cast.map(p => {
      const img = `${TMDB_IMG}w185${p.profile_path}`;
      const name = escapeHTML(p.name || '');
      const role = escapeHTML(p.character || p.roles?.[0]?.character || '');
      return `
        <div class="cast-member" role="listitem">
          <img class="cast-photo" loading="lazy" src="${img}" alt="${name}">
          <div class="cast-details">
            <div class="cast-name">${name}</div>
            <div class="cast-role">${role}</div>
          </div>
        </div>`;
    }).join('');
  }

  function extractTrailerKey(videos) {
    const arr = Array.isArray(videos?.results) ? videos.results : [];
    const yt = arr.find(v => v.site === 'YouTube' && v.type === 'Trailer')
             || arr.find(v => v.site === 'YouTube' && v.type === 'Teaser')
             || arr.find(v => v.site === 'YouTube');
    return yt ? yt.key : '';
  }

  function setTrailerThumb(key, fallbackBackdrop) {
    if (!trailerThumb) return;
    const thumb = key ? `https://img.youtube.com/vi/${key}/hqdefault.jpg` : (fallbackBackdrop ? `${TMDB_IMG}w780${fallbackBackdrop}` : '');
    if (thumb) trailerThumb.src = thumb;
  }

  // ----- Episodes for TV -----
  function setupSeasons(details) {
    if (!seasonSelect || !episodesGrid) return;
    const seasons = Array.isArray(details.seasons) ? details.seasons.filter(s => s && s.season_number > 0 && s.episode_count > 0) : [];
    if (!seasons.length) { episodesSection?.setAttribute('hidden', ''); return; }

    seasonSelect.innerHTML = seasons.map(s => `<option value="${s.season_number}">S${s.season_number} — ${escapeHTML(s.name || 'Season')}</option>`).join('');
    seasonSelect.addEventListener('change', () => {
      const sn = parseInt(seasonSelect.value, 10) || seasons[0].season_number;
      loadSeason(sn);
    });
    const initial = seasons[0].season_number;
    seasonSelect.value = String(initial);
    loadSeason(initial);
  }

  async function loadSeason(seasonNumber) {
    try {
      const data = await tmdb(`/tv/${id}/season/${seasonNumber}`);
      const eps = Array.isArray(data?.episodes) ? data.episodes : [];
      if (!eps.length) { 
        episodesGrid.innerHTML = '<div style="opacity:.8">No episodes found.</div>'; 
        return; 
      }
      episodesGrid.innerHTML = eps.map(e => {
        const still = e.still_path ? `${TMDB_IMG}w300${e.still_path}` : '';
        const title = escapeHTML(`${e.episode_number ? 'E' + e.episode_number + ' — ' : ''}${e.name || ''}`);
        const air = (e.air_date || '').slice(0, 10);
        return `
          <article class="episode-card" role="listitem" data-episode="${e.episode_number}">
            ${still ? `<img class="episode-thumb" loading="lazy" src="${still}" alt="${title}">` : `<div class="episode-thumb" style="background:rgba(255,255,255,.04)"></div>`}
            <div class="episode-meta">
              <div class="episode-title">${title}</div>
              <div>${air}</div>
            </div>
          </article>`;
      }).join('');
      // Wire navigation to watch page per-episode
      Array.from(episodesGrid.querySelectorAll('[data-episode]')).forEach((el) => {
        el.addEventListener('click', () => {
          const ep = parseInt(el.getAttribute('data-episode'), 10) || 1;
          location.href = `watch.html?type=tv&id=${id}&season=${seasonNumber}&episode=${ep}`;
        });
      });
    } catch (_) {
      episodesGrid.innerHTML = '<div style="opacity:.8">Unable to load episodes.</div>';
    }
  }

  // ----- Watchlist -----
  async function setupWatchlist(btn, details, type) {
    if (!btn || !window.SUPABASE) return;

    let added = false;
    try {
      // Attempt to check if in watchlist
      const { user } = await window.SUPABASE.auth.getUser();
      if (user) {
        const { data } = await window.SUPABASE.watchlist.list();
        added = Array.isArray(data) && data.some(r => r && r.tmdb_id === id && r.media_type === type);
      }
    } catch (_) {}

    setWatchlistBtnState(btn, added);

    btn.addEventListener('click', async () => {
      try {
        const payload = {
          tmdb_id: id,
          media_type: type,
          title: details.title || details.name || '',
          poster_path: details.poster_path || null,
          backdrop_path: details.backdrop_path || null,
          overview: details.overview || null,
        };
        if (!added) {
          const { error } = await window.SUPABASE.watchlist.add(payload);
          if (error) throw error;
          added = true;
          setWatchlistBtnState(btn, true);
        } else {
          const { error } = await window.SUPABASE.watchlist.remove({ tmdb_id: id, media_type: type });
          if (error) throw error;
          added = false;
          setWatchlistBtnState(btn, false);
        }
      } catch (e) {
        showToast('Please sign in to use your watchlist');
      }
    });
  }

  function setWatchlistBtnState(btn, added) {
    btn.classList.toggle('is-added', !!added);
    const span = btn.querySelector('span');
    const icon = btn.querySelector('i');
    if (span) span.textContent = added ? 'Added' : 'Add to Watchlist';
    if (icon) icon.setAttribute('data-lucide', added ? 'check' : 'plus');
    try { if (window.lucide?.createIcons) window.lucide.createIcons(); } catch (_) {}
  }

  // ----- Trailer Overlay -----
  function openTrailer(key) {
    if (!key || !trailerOverlay || !trailerFrame) return;
    const src = `https://www.youtube.com/embed/${key}?autoplay=1&rel=0`;
    trailerOverlay.setAttribute('aria-hidden', 'false');
    trailerOverlay.classList.add('active');
    trailerFrame.src = src;
    document.body.style.overflow = 'hidden';
  }

  function closeTrailer() {
    if (!trailerOverlay || !trailerFrame) return;
    trailerOverlay.classList.remove('active');
    trailerOverlay.setAttribute('aria-hidden', 'true');
    trailerFrame.src = '';
    document.body.style.overflow = '';
  }

  trailerCloseBtn?.addEventListener('click', closeTrailer);
  trailerOverlay?.addEventListener('click', (e) => { if (e.target === trailerOverlay) closeTrailer(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTrailer(); });

  // ----- Minimal Nav (hamburger + drawer) -----
  function initNavMinimal() {
    const hamb = qs('.hamburger');
    const drawer = qs('#mobile-drawer');
    const overlay = qs('.drawer-overlay');
    if (!hamb || !drawer || !overlay) return;

    const open = () => {
      drawer.removeAttribute('aria-hidden');
      overlay.hidden = false;
      document.body.style.overflow = 'hidden';
      hamb.setAttribute('aria-expanded', 'true');
    };
    const close = () => {
      drawer.setAttribute('aria-hidden', 'true');
      overlay.hidden = true;
      document.body.style.overflow = '';
      hamb.setAttribute('aria-expanded', 'false');
    };

    hamb.addEventListener('click', () => {
      const expanded = hamb.getAttribute('aria-expanded') === 'true';
      expanded ? close() : open();
    });
    overlay.addEventListener('click', close);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  }

  // ----- Animations -----
  function initAnimations() {
    try {
      if (!window.gsap) return;
      gsap.from('.detail-left', { opacity: 0, y: 20, duration: 0.6, ease: 'power2.out' });
      gsap.from('.detail-right', { opacity: 0, y: 20, duration: 0.6, delay: 0.08, ease: 'power2.out' });
    } catch (_) {}
  }

  function renderNotFound() {
    if (titleEl) titleEl.textContent = 'Not Found';
    if (overviewEl) overviewEl.textContent = 'We could not load this title.';
    if (castScroller) castScroller.innerHTML = '';
    episodesSection?.setAttribute('hidden', '');
    trailerSection?.setAttribute('hidden', '');
  }

  function escapeHTML(s) {
    return String(s || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function showToast(msg) {
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = `
      position: fixed; top: 90px; right: 20px; z-index: 3000;
      background: rgba(0,0,0,0.6); color: #fff; padding: 10px 12px; border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.12); backdrop-filter: blur(6px);
      transform: translateX(120%); opacity: 0; transition: all .4s ease;
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.transform = 'translateX(0)'; el.style.opacity = '1'; });
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(120%)'; setTimeout(() => el.remove(), 350); }, 2800);
  }
})();
