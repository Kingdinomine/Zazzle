(() => {
  const $ = (s) => document.querySelector(s);
  const usp = new URLSearchParams(location.search);

  // Params
  const typeParam = (usp.get('type') || 'movie').toLowerCase();
  const type = (typeParam === 'tv' || typeParam === 'series' || typeParam === 'anime') ? (typeParam === 'anime' ? 'tv' : typeParam) : 'movie';
  const id = usp.get('id');
  const season = parseInt(usp.get('season') || '1', 10);
  const episode = parseInt(usp.get('episode') || '1', 10);
  let provider = (usp.get('provider') || 'auto').toLowerCase();

  // Worker base detection
  function getWorkerBase() {
    const fromQuery = usp.get('worker');
    if (fromQuery && /^https?:\/\//i.test(fromQuery)) {
      try { localStorage.setItem('HLS_WORKER_BASE', fromQuery.replace(/\/$/, '')); } catch {}
      return fromQuery.replace(/\/$/, '');
    }
    try {
      const saved = localStorage.getItem('HLS_WORKER_BASE');
      if (saved && /^https?:\/\//i.test(saved)) return saved.replace(/\/$/, '');
    } catch {}
    if (typeof window.HLS_WORKER_BASE === 'string' && /^https?:\/\//i.test(window.HLS_WORKER_BASE)) {
      return String(window.HLS_WORKER_BASE).replace(/\/$/, '');
    }
    return '';
  }

  const workerBase = getWorkerBase();
  const video = $('#video');
  const loading = $('#loading');
  const meta = $('#meta');
  const statusEl = $('#status');
  const banner = $('#banner');
  const btnPrev = $('#serverPrev');
  const btnNext = $('#serverNext');
  const qualityBtn = $('#qualityBtn');
  const qualityMenu = $('#qualityMenu');
  const resumeModal = $('#resumeModal');
  const resumeTimes = $('#resumeTimes');
  const resumeFill = $('#resumeFill');
  const resumeContinue = $('#resumeContinue');
  const resumeStart = $('#resumeStart');
  const preplayEl = $('#preplay');
  const preplayCountEl = $('#preplayCount');
  const preplayHeadingEl = $('#preplayHeading');
  const preplaySubEl = preplayEl ? preplayEl.querySelector('.preplay-sub') : null;
  const tryBackupBtn = $('#tryBackupBtn');
  // New cinematic page elements
  const titleEl = $('#watch-title');
  const overviewEl = $('#watch-overview');
  const bgImg = $('#watch-bg-img');
  const glowEl = $('#watch-glow');
  const recommendRow = $('#recommend-row');
  const episodesSection = $('#episodes-section');
  const seasonSelect = $('#season-select');
  const episodesGrid = $('#episodes-grid');
  const TMDB_IMG = 'https://image.tmdb.org/t/p/';
  let currentDetails = null; // for Continue Watching metadata

  const servers = ['auto', 'vidfast', 'videasy'];
  let serverIndex = Math.max(0, servers.indexOf(provider));
  let hlsInstance = null;
  let lastSavedSec = 0;
  let accentHex = null; // '#RRGGBB' computed from artwork
  let currentProvider = null; // tracks the provider currently in use ('videasy' | 'vidfast')
  const PROVIDER_ORIGIN = {
    videasy: 'https://player.videasy.net',
    vidfast: 'https://vidfast.pro'
  };

  // ---- Provider warmup & preference ----
  function addLink(rel, href, crossorigin) {
    try {
      const l = document.createElement('link');
      l.rel = rel; l.href = href; if (crossorigin) l.crossOrigin = 'anonymous';
      document.head.appendChild(l);
    } catch(_) {}
  }
  function warmProviders() {
    addLink('preconnect', PROVIDER_ORIGIN.vidfast, true);
    addLink('dns-prefetch', PROVIDER_ORIGIN.vidfast);
    addLink('preconnect', PROVIDER_ORIGIN.videasy, true);
    addLink('dns-prefetch', PROVIDER_ORIGIN.videasy);
  }
  warmProviders();

  // Robust Continue Watching recorder (used by attachFrame onload and as a backup on page hide)
  async function recordContinueWatching() {
    try {
      // Ensure Supabase is ready and a user is signed in
      try { await window.SUPABASE?.ready?.(); } catch(_) {}
      const { user } = await (window.SUPABASE?.auth?.getUser?.() || {});
      if (!user) return;
      const meta = currentDetails || {};
      const titleText = meta.title || meta.name || '';
      const poster = meta.poster_path ? `${TMDB_IMG}w342${meta.poster_path}` : null;
      const backdrop = meta.backdrop_path ? `${TMDB_IMG}w780${meta.backdrop_path}` : null;
      await window.SUPABASE?.watchProgress?.upsert?.({
        tmdb_id: Number(id),
        media_type: type === 'tv' ? 'tv' : 'movie',
        season: type === 'tv' ? Number(season) : null,
        episode: type === 'tv' ? Number(episode) : null,
        title: titleText,
        poster_path: poster,
        backdrop_path: backdrop,
        progress_seconds: 0,
        duration_seconds: 0,
      });
    } catch(_) {}
  }

  // Backup triggers to ensure last_watched_at is bumped even if onload timing varies
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { try { recordContinueWatching(); } catch(_) {} }
  });
  window.addEventListener('pagehide', () => { try { recordContinueWatching(); } catch(_) {} });

  async function probeProvider(p, budgetMs = 2000) {
    const origin = PROVIDER_ORIGIN[p];
    if (!origin) return Number.POSITIVE_INFINITY;
    const url = `${origin}/favicon.ico?ts=${Date.now()}`;
    const t0 = performance.now();
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), budgetMs);
      await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal });
      clearTimeout(tid);
      return performance.now() - t0;
    } catch (_) {
      return Number.POSITIVE_INFINITY;
    }
  }
  function getPreferredProvider() {
    try { return sessionStorage.getItem('PREFERRED_PROVIDER'); } catch(_) { return null; }
  }
  function setPreferredProvider(p) {
    try { sessionStorage.setItem('PREFERRED_PROVIDER', p); } catch(_) {}
  }
  async function chooseProviderAuto() {
    // Prefer Vidfast by default; Videasy will be used as fallback on errors/timeouts.
    setPreferredProvider('vidfast');
    return 'vidfast';
  }

  // ---- TMDB helper (use Supabase client direct-to-TMDB, fallback to direct key) ----
  const TMDB_API_KEY = '668153cb301606fdc86fef072e7daf06'; // fallback only
  const TMDB_BASE = 'https://api.themoviedb.org/3';
  async function tmdb(path, query = {}) {
    // Prefer the tmdbProxy client which already calls TMDB directly with API key
    try {
      if (window.SUPABASE?.tmdbProxy?.call) {
        const { data, error } = await window.SUPABASE.tmdbProxy.call(path, query);
        if (!error && data) return data;
      }
    } catch (_) {}
    // Fallback to direct
    try {
      const normalized = path.startsWith('/') ? path : `/${path}`;
      const url = new URL(`${TMDB_BASE}${normalized}`);
      url.searchParams.set('api_key', TMDB_API_KEY);
      url.searchParams.set('language', 'en-US');
      Object.entries(query || {}).forEach(([k, v]) => url.searchParams.set(k, v));
      const r = await fetch(url.toString());
      return await r.json();
    } catch (e) {
      return null;
    }
  }

  // ---- Accent color from image ----
  function setAccentFromRGB(r, g, b) {
    const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
    r = clamp(r); g = clamp(g); b = clamp(b);
    const toHex = (n) => n.toString(16).padStart(2, '0');
    const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    try {
      document.documentElement.style.setProperty('--accent', hex);
      document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
      accentHex = hex;
    } catch (_) {}
  }

  async function applyAccentFromImage(url) {
    if (!url) return;
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const load = new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
      img.src = url;
      await load;
      const w = 56, h = 56; // a bit more samples for better palette
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      let best = { weight: -1, r: 127, g: 90, b: 240 };
      for (let i = 0; i < data.length; i += 4) {
        const rr = data[i], gg = data[i+1], bb = data[i+2], aa = data[i+3];
        if (aa < 16) continue; // skip near-transparent
        const { h: _h, s, v } = rgbToHsv(rr, gg, bb);
        const weight = (s * s) * (0.6 + 0.4 * v); // favor saturated & bright pixels
        if (weight > best.weight) best = { weight, r: rr, g: gg, b: bb };
      }
      setAccentFromRGB(best.r, best.g, best.b);
    } catch (_) { /* ignore */ }
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
        case g: h = ((b - r) / d + 2); break;
        case b: h = ((r - g) / d + 4); break;
      }
      h /= 6;
    }
    const s = max === 0 ? 0 : d / max;
    const v = max;
    return { h, s, v };
  }

  // ---- Background, title, overview ----
  async function loadMetaAndBackground() {
    try {
      // Backend-first: try Supabase cache for title/overview/backdrop
      let details = null;
      try {
        if (window.SUPABASE?.dbTitles?.getByTmdbId) {
          const { data } = await window.SUPABASE.dbTitles.getByTmdbId(type, Number(id));
          if (data) {
            details = {
              id: Number(id),
              title: data.title || null,
              name: data.title || null,
              overview: data.overview || '',
              backdrop_path: data.backdrop_path || null,
              poster_path: data.poster_path || null,
            };
          }
        }
      } catch (_) {}
      if (!details) details = await tmdb(`/${type}/${id}`);
      // Augment with external_ids (imdb_id) for backend caching
      try {
        const ext = await tmdb(`/${type}/${id}/external_ids`);
        if (ext && typeof ext === 'object' && ('imdb_id' in ext)) {
          details.imdb_id = ext.imdb_id || null;
        }
      } catch (_) {}
      // Best-effort cache in Supabase (Edge Function preferred)
      try { await window.SUPABASE?.dbTitles?.upsertBasic(type, details); } catch (_) {}
      if (!details || details.success === false || details.status_code === 34) return;
      const title = details.title || details.name || '';
      const overview = details.overview || '';
      const art = details.backdrop_path || details.poster_path || '';
      if (titleEl) titleEl.textContent = title;
      if (overviewEl) overviewEl.textContent = overview;
      if (bgImg && art) {
        bgImg.src = `${TMDB_IMG}w1280${art}`;
        bgImg.srcset = `${TMDB_IMG}w780${art} 780w, ${TMDB_IMG}w1280${art} 1280w, ${TMDB_IMG}original${art} 1920w`;
        bgImg.sizes = '100vw';
        bgImg.alt = `${title} background`;
        try { bgImg.setAttribute('fetchpriority', 'high'); } catch(_){}
      }
      // Preplay overlay heading and background image (use provided artwork)
      if (preplayEl) {
        const h = (type === 'tv') ? `Loading ${title} S${season}E${episode}` : `Loading ${title}`;
        if (preplayHeadingEl) preplayHeadingEl.textContent = h;
        // Use the requested custom artwork for the loading overlay
        try { preplayEl.style.backgroundImage = `url('preplay.jpg')`; } catch(_){}
      }
      // Accent glow
      const accentSrc = art ? `${TMDB_IMG}w300${art}` : '';
      if (accentSrc) applyAccentFromImage(accentSrc);

      // Save for watch progress metadata
      currentDetails = details;

      // Episodes for TV
      if (type === 'tv') { setupSeasons(details); }

      // Recommendations
      renderRecommendations(type, details.id);
      try { if (window.lucide?.createIcons) window.lucide.createIcons(); } catch(_){}
    } catch (_) {}
  }

  // ---- Recommendations ----
  async function renderRecommendations(mediaType, tmdbId) {
    if (!recommendRow) return;
    try {
      const rec = await tmdb(`/${mediaType}/${tmdbId}/recommendations`, { page: 1 });
      const arr = Array.isArray(rec?.results) ? rec.results.slice(0, 18) : [];
      if (!arr.length) { recommendRow.innerHTML = ''; return; }
      recommendRow.innerHTML = arr.map(item => {
        const itType = item.title ? 'movie' : 'tv';
        const year = (item.release_date || item.first_air_date || '').slice(0,4);
        const rating = (item.vote_average ? `★ ${item.vote_average.toFixed(1)}` : '').trim();
        const sub = [year, rating].filter(Boolean).join(' • ');
        const poster = item.poster_path ? `${TMDB_IMG}w342${item.poster_path}` : '';
        const title = escapeHTML(item.title || item.name || 'Untitled');
        return `
          <article class="overlay-card glow-card" role="listitem" tabindex="0" data-type="${itType}" data-id="${item.id}">
            ${poster ? `<img class="overlay-thumb" loading="lazy" src="${poster}" alt="${title}">` : `<div class="overlay-thumb" style="background:rgba(255,255,255,.06);"></div>`}
            <div class="overlay-card-gradient"></div>
            <div class="overlay-card-meta">
              <div class="overlay-card-title">${title}</div>
              <div class="overlay-card-sub">${escapeHTML(sub)}</div>
            </div>
          </article>`;
      }).join('');
      Array.from(recommendRow.querySelectorAll('[data-id]')).forEach((el) => {
        el.addEventListener('click', () => {
          const tid = el.getAttribute('data-id');
          const ttype = el.getAttribute('data-type');
          // Navigate to detail page so user can preview info, then watch
          location.href = `detail.html?type=${encodeURIComponent(ttype)}&id=${encodeURIComponent(tid)}`;
        });
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
        });
      });
    } catch (_) {
      recommendRow.innerHTML = '';
    }
  }

  // ---- Episodes (TV) ----
  function setupSeasons(details) {
    if (!episodesSection || !seasonSelect || !episodesGrid) return;
    const seasons = Array.isArray(details.seasons) ? details.seasons.filter(s => s && s.season_number > 0 && s.episode_count > 0) : [];
    if (!seasons.length) { episodesSection.setAttribute('hidden', ''); return; }
    episodesSection.removeAttribute('hidden');
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
    if (!episodesGrid) return;
    try {
      const data = await tmdb(`/tv/${id}/season/${seasonNumber}`);
      const eps = Array.isArray(data?.episodes) ? data.episodes : [];
      if (!eps.length) { episodesGrid.innerHTML = '<div style="opacity:.8">No episodes found.</div>'; return; }
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

  function setControlsEnabled(enabled) {
    const attr = enabled ? 'removeAttribute' : 'setAttribute';
    btnPrev?.[attr]('disabled', 'true');
    btnNext?.[attr]('disabled', 'true');
    // qualityBtn is managed by playback mode, leave as-is here
  }

  function setStatus(msg) { if (statusEl) statusEl.textContent = msg || ''; }
  function showLoading(show) { if (loading) loading.style.display = show ? 'grid' : 'none'; }
  function showBanner(html) { if (!banner) return; banner.innerHTML = html || ''; banner.hidden = !html; }

  // Progress storage helpers (resume)
  function storeKey() {
    let k = `${type}:${id}`;
    if (type === 'tv') k += `:s${season}e${episode}`;
    return `WATCH_PROGRESS:${k}`;
  }
  function loadProgress() {
    try { const raw = localStorage.getItem(storeKey()); if (raw) return JSON.parse(raw); } catch {}
    return null;
  }
  function saveProgress(progressSec, durationSec) {
    try { localStorage.setItem(storeKey(), JSON.stringify({ progress: Math.floor(progressSec), duration: Math.floor(durationSec || 0) })); } catch {}
  }
  function clearProgress() { try { localStorage.removeItem(storeKey()); } catch {} }
  function toHHMMSS(total) {
    total = Math.max(0, Math.floor(total || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  function maybeShowResume() {
    if (!resumeModal || !video) return;
    const data = loadProgress();
    const dur = isFinite(video.duration) ? video.duration : 0;
    if (!data || !data.progress || !dur || data.progress < 10 || data.progress > dur - 15) return;
    resumeTimes.textContent = `${toHHMMSS(data.progress)} / ${toHHMMSS(dur)}`;
    const pct = Math.max(0, Math.min(100, Math.round((data.progress / dur) * 100)));
    if (resumeFill) resumeFill.style.width = `${pct}%`;
    try { video.pause(); } catch {}
    resumeModal.style.display = 'flex';
    const apply = (sec) => {
      resumeModal.style.display = 'none';
      try { if (sec) video.currentTime = sec; } catch {}
      try { video.play(); } catch {}
    };
    resumeContinue?.addEventListener('click', () => apply(data.progress), { once: true });
    resumeStart?.addEventListener('click', () => apply(0), { once: true });
  }

  // Quality menu helpers (Hls.js)
  function buildQualityMenu() {
    if (!qualityMenu) return;
    qualityMenu.innerHTML = '';
    if (!hlsInstance || !Array.isArray(hlsInstance.levels) || !hlsInstance.levels.length) {
      qualityMenu.hidden = true;
      return;
    }
    const mkBtn = (label, level) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.dataset.level = String(level);
      b.addEventListener('click', () => {
        try { hlsInstance.currentLevel = level; } catch {}
        qualityMenu.hidden = true;
        setStatus(level === -1 ? 'Quality: Auto' : `Quality: ${label}`);
      });
      return b;
    };
    qualityMenu.appendChild(mkBtn('Auto', -1));
    const levels = hlsInstance.levels
      .map((lvl, i) => ({ i, h: lvl.height || 0, br: lvl.bitrate || 0 }))
      .sort((a, b) => (b.h - a.h) || (b.br - a.br));
    const seen = new Set();
    for (const { i, h, br } of levels) {
      const key = h || Math.round((br || 0) / 1000);
      if (seen.has(key)) continue;
      seen.add(key);
      const label = h ? `${h}p` : `${Math.round((br || 0) / 1000)}k`;
      qualityMenu.appendChild(mkBtn(label, i));
    }
    qualityMenu.hidden = false;
  }
  function toggleQualityMenu() {
    if (!qualityMenu) return;
    if (qualityMenu.hidden) { buildQualityMenu(); qualityMenu.hidden = false; }
    else { qualityMenu.hidden = true; }
  }
  document.addEventListener('click', (e) => {
    if (!qualityMenu || qualityMenu.hidden) return;
    const within = qualityMenu.contains(e.target) || qualityBtn?.contains(e.target);
    if (!within) qualityMenu.hidden = true;
  });

  // Preplay overlay (non-glitchy, no countdown) shown while resolving stream
  let preplayShownAt = 0;
  function showPreplay(message = 'Loading…') {
    if (!preplayEl) return;
    try {
      if (preplayHeadingEl) preplayHeadingEl.textContent = String(message || 'Loading…');
      if (preplaySubEl) preplaySubEl.style.display = 'none';
      if (preplayCountEl) preplayCountEl.textContent = '';
    } catch(_) {}
    preplayShownAt = performance.now();
    preplayEl.style.display = 'flex';
  }
  function hidePreplay(minHoldMs = 350) {
    if (!preplayEl) return;
    const elapsed = performance.now() - preplayShownAt;
    const wait = Math.max(0, (minHoldMs || 0) - elapsed);
    setTimeout(() => { try { preplayEl.style.display = 'none'; } catch(_) {} }, wait);
  }

  function destroyHls() {
    if (hlsInstance) {
      try { hlsInstance.destroy(); } catch {}
      hlsInstance = null;
    }
    if (video) {
      try { video.pause(); } catch {}
      try { video.removeAttribute('src'); video.load(); } catch {}
    }
  }

  function updateMeta(p) {
    if (!meta) return; // HUD may be hidden; keep safe
    const parts = [];
    parts.push(type.toUpperCase());
    if (type === 'tv') parts.push(`S${season}E${episode}`);
    parts.push(`#${id}`);
    parts.push(`• ${labelFor(p)}`);
    meta.textContent = parts.join(' ');
  }

  function labelFor(p) {
    if (p === 'auto') return 'Auto';
    if (p === 'vidfast') return 'Server 1';
    if (p === 'videasy') return 'Server 2';
    return p;
  }

  // Build raw provider iframe URLs (no proxy)
  function rawEmbedUrl(p) {
    if (p === 'videasy') {
      const theme = (accentHex || '').replace('#', '');
      const themeParam = theme ? `&theme=${encodeURIComponent(theme)}` : '';
      if (type === 'movie') return `https://player.videasy.net/movie/${encodeURIComponent(id)}?autoPlay=true&hideServer=true${themeParam}`;
      return `https://player.videasy.net/tv/${encodeURIComponent(id)}/${encodeURIComponent(season)}/${encodeURIComponent(episode)}?autoPlay=true&hideServer=true${themeParam}`;
    }
    if (p === 'vidfast') {
      // Use vidfast.pro with autoplay + hideServer as per docs
      const theme = (accentHex || '').replace('#', '');
      const themeParam = theme ? `&theme=${encodeURIComponent(theme)}` : '';
      if (type === 'movie') return `https://vidfast.pro/movie/${encodeURIComponent(id)}?autoPlay=true&hideServer=true${themeParam}`;
      return `https://vidfast.pro/tv/${encodeURIComponent(id)}/${encodeURIComponent(season)}/${encodeURIComponent(episode)}?autoPlay=true&hideServer=true${themeParam}`;
    }
    return '';
  }
  // Drop all resolve/proxy/HLS helpers; iframe-only playback now

  function attachFrame(frameUrl, { timeoutMs = 6000 } = {}) {
    const iframe = document.getElementById('frame');
    if (!iframe) throw new Error('No frame element');
    // Hide HLS video for iframe mode
    if (video) video.hidden = true;
    iframe.hidden = false;
    try { qualityBtn?.setAttribute('disabled', 'true'); } catch {}
    return new Promise((resolve, reject) => {
      let done = false;
      const onload = async () => {
        if (done) return; done = true; cleanup();
        try { await recordContinueWatching(); } catch(_) {}
        resolve();
      };
      const onerror = () => { if (done) return; done = true; cleanup(); reject(new Error('iframe load error')); };
      const cleanup = () => {
        iframe.removeEventListener('load', onload);
        iframe.removeEventListener('error', onerror);
      };
      iframe.addEventListener('load', onload);
      iframe.addEventListener('error', onerror);
      iframe.src = frameUrl;
      setTimeout(() => { if (!done) { done = true; cleanup(); resolve(); } }, timeoutMs);
    });
  }

  async function playWith(p, opts = {}) {
    provider = p;
    serverIndex = Math.max(0, servers.indexOf(p));
    const primary = (p === 'auto') ? (await chooseProviderAuto()) : (p === 'videasy' ? 'videasy' : p);
    currentProvider = primary;
    updateMeta(primary);
    showBanner('');
    destroyHls();
    const heading = (() => {
      if (opts && opts.message) return opts.message;
      const t = (currentDetails && (currentDetails.title || currentDetails.name)) || '';
      if (t) return type === 'tv' ? `Loading ${t} S${season}E${episode}` : `Loading ${t}`;
      return 'Loading…';
    })();
    showPreplay(heading);
    try {
      const url = rawEmbedUrl(primary);
      if (!url) throw new Error('No embed URL');
      await attachFrame(url);
      hidePreplay();
    } catch (_) {
      // In case failure happens before overlay is hidden, show quick retry overlay then hide
      try { await showPreplay('Loading…'); } catch {}
      hidePreplay();
      showBanner(`<div class="err">Unable to load player. Try Backup below.</div>`);
    }
  }

  function nextServer() {
    serverIndex = (serverIndex + 1) % servers.length;
    return servers[serverIndex];
  }
  function prevServer() {
    serverIndex = (serverIndex - 1 + servers.length) % servers.length;
    return servers[serverIndex];
  }

  // HUD controls removed on watch page (providers supply their own UI)

  // Progress save / resume events
  video?.addEventListener('loadedmetadata', () => maybeShowResume());
  video?.addEventListener('timeupdate', () => {
    if (!video || !isFinite(video.duration)) return;
    const cur = Math.floor(video.currentTime || 0);
    if (Math.abs(cur - lastSavedSec) >= 2) {
      saveProgress(cur, video.duration || 0);
      lastSavedSec = cur;
    }
  });
  video?.addEventListener('ended', () => clearProgress());

  // Boot
  if (!id) {
    showBanner('<div class="err">Missing id parameter</div>');
    return;
  }
  // For raw iframe test: no Worker required
  setControlsEnabled(true);

  // Load cinematic metadata first, then play (so preplay shows proper title)
  loadMetaAndBackground().finally(() => {
    // Initial play (with non-glitchy overlay)
    playWith(provider);
  });

  // Manual backup switch button
  tryBackupBtn?.addEventListener('click', () => {
    const next = (currentProvider === 'videasy') ? 'vidfast' : 'videasy';
    playWith(next, { message: 'Switching to backup…' });
  });

  // --- Utilities ---
  function escapeHTML(s) {
    return String(s || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  // Minimal nav (hamburger + drawer) copied from detail page
  (function initNavMinimal(){
    const hamb = document.querySelector('.hamburger');
    const drawer = document.querySelector('#mobile-drawer');
    const overlay = document.querySelector('.drawer-overlay');
    if (!hamb || !drawer || !overlay) return;
    const open = () => { drawer.removeAttribute('aria-hidden'); overlay.hidden = false; document.body.style.overflow = 'hidden'; hamb.setAttribute('aria-expanded','true'); };
    const close = () => { drawer.setAttribute('aria-hidden','true'); overlay.hidden = true; document.body.style.overflow = ''; hamb.setAttribute('aria-expanded','false'); };
    hamb.addEventListener('click', () => { const expanded = hamb.getAttribute('aria-expanded') === 'true'; expanded ? close() : open(); });
    overlay.addEventListener('click', close);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  })();

  // Back button click handler
  (function initBackBtn(){
    try {
      const backBtn = document.getElementById('back-btn');
      backBtn?.addEventListener('click', () => {
        try {
          if (document.referrer && document.referrer !== location.href) history.back();
          else location.href = 'index.html';
        } catch(_) { location.href = 'index.html'; }
      });
    } catch(_) {}
  })();
})();
