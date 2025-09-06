// Watch page controller for Next.js (public/watch.js)
// - Registers Service Worker
// - Resolves HLS from VidFast/Videasy via /api/proxy on Vercel
// - Plays with Hls.js + Plyr UI
(() => {
  const qs = (s) => document.querySelector(s);
  const qsa = (s) => Array.from(document.querySelectorAll(s));

  const params = new URLSearchParams(location.search);
  const typeParam = (params.get('type') || 'movie').toLowerCase();
  const type = (['tv','series','anime'].includes(typeParam)) ? 'tv' : 'movie';
  const tmdb_id = parseInt(params.get('id') || '0', 10);
  const initialSeason = params.has('season') ? parseInt(params.get('season'), 10) : undefined;
  const initialEpisode = params.has('episode') ? parseInt(params.get('episode'), 10) : undefined;
  let preferredProvider = params.get('provider') || 'vidfast';
  const disableSW = params.has('nosw') || params.get('sw') === 'off' || params.get('sw') === '0';
  const useProxy = (params.get('proxy') === '1' || params.get('proxy') === 'true' || params.get('proxy') === 'yes' || params.get('proxy') === 'on') || disableSW;

  const page = qs('#page');
  const bgImg = qs('#bg-img');
  const titleEl = qs('#title');
  const badges = qs('#badges');
  const overview = qs('#overview');
  const tvControls = qs('#tv-controls');
  const seasonSelect = qs('#season-select');
  const episodeCount = qs('#episode-count');
  const episodesWrap = qs('#episodes');
  const episodesGrid = qs('#episodes-grid');
  const recs = qs('#recs');
  const recsRow = qs('#recs-row');
  const providerSwitch = qs('#provider-switch');
  const sourceMeta = qs('#source-meta');
  const buffering = qs('#buffering');
  const errorCard = qs('#error');
  const btnRetry = qs('#btn-retry');

  const TMDB_IMG = 'https://image.tmdb.org/t/p/';
  const TMDB_BASE = 'https://api.themoviedb.org/3';
  const TMDB_API_KEY = '668153cb301606fdc86fef072e7daf06'; // public v3 key

  async function tmdb(path, query = {}) {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${TMDB_BASE}${normalized}`);
    url.searchParams.set('api_key', TMDB_API_KEY);
    url.searchParams.set('language', 'en-US');
    Object.entries(query || {}).forEach(([k, v]) => url.searchParams.set(k, v));
    const r = await fetch(url.toString());
    return await r.json();
  }

  async function getExternalIds() {
    try {
      const path = (type === 'tv') ? `/tv/${tmdb_id}/external_ids` : `/movie/${tmdb_id}/external_ids`;
      const d = await tmdb(path, {});
      return d || {};
    } catch { return {}; }
  }

  if (!(tmdb_id > 0)) {
    showError('Missing or invalid id');
    return;
  }

  registerServiceWorker().then(init).catch(init);

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      if (disableSW) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister()));
        } catch {}
        return;
      }
      const existingVer = String(localStorage.getItem('sw_v') || '');
      const nextVer = existingVer || String(Date.now());
      if (!existingVer) {
        try { localStorage.setItem('sw_v', String(nextVer)); } catch {}
      }
      const swUrl = `/service-worker.js?v=${encodeURIComponent(String(localStorage.getItem('sw_v') || nextVer))}`;
      const reg = await navigator.serviceWorker.register(swUrl, { scope: '/' });
      try { await reg.update(); } catch {}
    } catch (e) {
      console.warn('SW register failed', e);
    }
  }

  let metaDetails = null;

  async function init() {
    fadeIn();
    wireProviderSwitch();
    wireRetry();

    const meta = await loadMetadata();
    metaDetails = meta;
    if (type === 'tv') {
      await loadSeasons(meta);
      const s = initialSeason || 1;
      await selectEpisode(s, initialEpisode || 1);
    } else {
      episodesWrap?.classList.add('hidden');
      recs?.classList.remove('hidden');
      await loadRecommendations();
      await resolveAndPlay({ type, tmdb_id, provider: preferredProvider });
    }
  }

  function fadeIn() { try { page.style.opacity = '1'; } catch {} }
  function setBuffering(on) { buffering?.classList.toggle('hidden', !on); buffering?.classList.toggle('flex', !!on); }

  async function loadMetadata() {
    try {
      const d = await tmdb(type === 'tv' ? `/tv/${tmdb_id}` : `/${type}/${tmdb_id}`, {}) || {};
      const title = d.title || d.name || 'Untitled';
      if (titleEl) titleEl.textContent = title;
      const bd = d.backdrop_path || d.poster_path || '';
      if (bd && bgImg) bgImg.src = `${TMDB_IMG}w1280${bd}`;
      if (overview) overview.textContent = d.overview || '';
      if (badges) badges.innerHTML = renderBadges(d);
      if (type === 'tv') tvControls?.classList.remove('hidden');
      return d;
    } catch (e) {
      return {};
    }
  }

  function renderBadges(d) {
    const arr = [];
    const year = (d.release_date || d.first_air_date || '').slice(0, 4);
    if (year) arr.push(year);
    const ratingVal = (typeof d.vote_average === 'number') ? d.vote_average : null;
    if (ratingVal) arr.push(`★ ${Number(ratingVal).toFixed(1)}`);
    const genres = Array.isArray(d.genres) ? d.genres.map(g => g.name).slice(0, 3).join(', ') : '';
    if (genres) arr.push(genres);
    return arr.map(x => `<span class="px-2 py-1 rounded-full bg-white/10">${escapeHTML(x)}</span>`).join('');
  }

  async function loadSeasons(details) {
    if (!seasonSelect || !episodesGrid) return;
    const seasons = Array.isArray(details?.seasons) ? details.seasons.filter(s => s.season_number > 0) : [];
    const seasonNumbers = seasons.map(s => s.season_number);
    seasonSelect.innerHTML = seasonNumbers.map(sn => `<option value="${sn}">S${sn}</option>`).join('');
    seasonSelect.addEventListener('change', async () => {
      const sn = parseInt(seasonSelect.value, 10) || seasonNumbers[0] || 1;
      await populateEpisodes(sn);
      await selectEpisode(sn, 1);
    });
    await populateEpisodes(initialSeason || seasonNumbers[0] || 1);
  }

  async function populateEpisodes(seasonNumber) {
    try {
      const data = await tmdb(`/tv/${tmdb_id}/season/${seasonNumber}`, {});
      const eps = Array.isArray(data?.episodes) ? data.episodes : [];
      if (episodeCount) episodeCount.textContent = `${eps.length} episodes`;
      episodesGrid.innerHTML = eps.map(e => {
        const still = e.still_path ? `${TMDB_IMG}w300${e.still_path}` : '';
        const title = `${e.episode_number ? 'E' + e.episode_number + ' • ' : ''}${e.name || ''}`;
        return `<article class="group relative rounded-xl overflow-hidden cursor-pointer ring-1 ring-white/10 hover:ring-white/20 transition" data-episode="${e.episode_number}">
          ${still ? `<img class="w-full aspect-video object-cover" src="${still}" alt="${escapeHTML(title)}">` : `<div class="w-full aspect-video bg-white/5"></div>`}
          <div class="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/60 to-transparent text-sm">${escapeHTML(title)}</div>
        </article>`;
      }).join('');
      qsa('#episodes-grid [data-episode]').forEach(card => {
        card.addEventListener('click', async () => {
          const ep = parseInt(card.getAttribute('data-episode'), 10);
          await selectEpisode(seasonNumber, ep);
        });
      });
      episodesWrap?.classList.remove('hidden');
    } catch (e) {
      episodesGrid.innerHTML = '<div class="text-white/70">Unable to load episodes.</div>';
    }
  }

  async function loadRecommendations() {
    try {
      const data = await tmdb(`/movie/${tmdb_id}/recommendations`, {});
      const results = Array.isArray(data?.results) ? data.results.slice(0, 12) : [];
      recsRow.innerHTML = results.map(r => {
        const img = r.backdrop_path ? `${TMDB_IMG}w300${r.backdrop_path}` : '';
        const url = `/detail?type=${r.title ? 'movie' : 'tv'}&id=${r.id}`;
        return `<a href="${url}" class="snap-start block rounded-xl overflow-hidden ring-1 ring-white/10 hover:ring-white/20">
          ${img ? `<img src="${img}" alt="${escapeHTML(r.title || r.name || '')}" class="w-[260px] h-[146px] object-cover"/>` : `<div class="w-[260px] h-[146px] bg-white/5"></div>`}
        </a>`;
      }).join('');
    } catch {}
  }

  function wireProviderSwitch() {
    providerSwitch?.querySelectorAll('button[data-provider]')?.forEach(btn => {
      btn.addEventListener('click', async () => {
        preferredProvider = btn.getAttribute('data-provider') || 'vidfast';
        await resolveAndPlay({ type, tmdb_id, provider: preferredProvider, season: current.season, episode: current.episode });
      });
    });
  }

  function wireRetry() {
    btnRetry?.addEventListener('click', async () => {
      hideError();
      await resolveAndPlay({ type, tmdb_id, provider: preferredProvider, season: current.season, episode: current.episode });
    });
  }

  function showError(msg) {
    if (!errorCard) return;
    try {
      const text = document.getElementById('error-text');
      if (text && msg) text.textContent = String(msg);
    } catch {}
    errorCard.classList.remove('hidden');
  }
  function hideError() { errorCard?.classList.add('hidden'); }

  const current = { season: initialSeason, episode: initialEpisode, expiresAt: null };

  async function selectEpisode(season, episode) {
    current.season = season; current.episode = episode;
    await resolveAndPlay({ type: 'tv', tmdb_id, season, episode, provider: preferredProvider });
  }

  // ---- Plyr + Hls.js playback helpers ----
  let hls = null;
  let plyr = null;

  function getVideoEl() { return document.getElementById('vjs-player'); }

  function getOrInitPlyr(video) {
    try {
      if (!window.Plyr) return null;
      if (!plyr || plyr.media !== video) {
        try { plyr?.destroy(); } catch {}
        plyr = new window.Plyr(video, {
          controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'settings', 'pip', 'airplay', 'fullscreen'],
          ratio: '16:9',
          clickToPlay: true,
          keyboard: { focused: true, global: true },
          tooltips: { controls: true, seek: true },
        });
        window.__plyr = plyr;
      }
      return plyr;
    } catch { return null; }
  }

  function loadHlsJs() {
    return new Promise((resolve, reject) => {
      if (window.Hls) return resolve(window.Hls);
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.14/dist/hls.min.js';
      s.async = true;
      s.onload = () => resolve(window.Hls);
      s.onerror = () => reject(new Error('Failed to load Hls.js'));
      document.head.appendChild(s);
    });
  }

  async function playWithHls(url, opts = {}) {
    const video = getVideoEl();
    if (!video) throw new Error('Video element not found');
    try { video.setAttribute('playsinline', ''); } catch {}
    video.playsInline = true; video.muted = true; video.controls = true;

    const HlsCtor = await loadHlsJs().catch(() => window.Hls);
    if (HlsCtor && HlsCtor.isSupported()) {
      try { hls?.destroy(); } catch {}
      hls = new HlsCtor({ lowLatencyMode: true, backBufferLength: 90 });
      hls.loadSource(url);
      hls.attachMedia(video);
      getOrInitPlyr(video);
      return new Promise((resolve) => {
        let settled = false;
        const settle = () => { if (settled) return; settled = true; resolve(); };
        const onParsed = () => {
          hls?.off(HlsCtor.Events.MANIFEST_PARSED, onParsed);
          try { hls?.off(HlsCtor.Events.ERROR, onErr); } catch {}
          video.play().catch(() => {});
          settle();
        };
        const onErr = (evt, data) => {
          try { opts.onError?.(data); } catch {}
          try { hls?.off(HlsCtor.Events.MANIFEST_PARSED, onParsed); } catch {}
          try { hls?.off(HlsCtor.Events.ERROR, onErr); } catch {}
          settle();
        };
        hls.on(HlsCtor.Events.MANIFEST_PARSED, onParsed);
        hls.on(HlsCtor.Events.ERROR, onErr);
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      return new Promise((resolve) => {
        video.src = url;
        getOrInitPlyr(video);
        video.addEventListener('loadedmetadata', () => { video.play().catch(() => {}); resolve(); }, { once: true });
      });
    } else {
      throw new Error('HLS not supported in this browser');
    }
  }

  async function resolveAndPlay({ type, tmdb_id, season, episode, provider }) {
    setBuffering(true); hideError();
    const video = getVideoEl();
    if (!video) throw new Error('Player unavailable');
    try {
      // Override final m3u8 via query
      const override = params.get('src') || params.get('m3u8');
      const overrideRef = params.get('ref') || params.get('referer') || '';
      const overrideOrg = params.get('org') || params.get('origin') || '';
      if (override) {
        const headersNeeded = (overrideRef || overrideOrg)
          ? { ...(overrideRef ? { Referer: overrideRef } : {}), ...(overrideOrg ? { Origin: overrideOrg } : {}) }
          : { Referer: 'https://vidfast.pro', Origin: 'https://vidfast.pro' };
        let finalUrl = override;
        if (useProxy) {
          const refQ = headersNeeded.Referer ? `&referer=${encodeURIComponent(headersNeeded.Referer)}` : '';
          const orgQ = headersNeeded.Origin ? `&origin=${encodeURIComponent(headersNeeded.Origin)}` : '';
          finalUrl = `/api/proxy?url=${encodeURIComponent(override)}${refQ}${orgQ}`;
        } else {
          try { navigator.serviceWorker.controller?.postMessage({ t: 'set-headers', forUrl: override, headers: headersNeeded, ttl: 14400 }); } catch {}
        }
        let fellBack = false;
        await playWithHls(finalUrl, {
          onError: async () => {
            if (fellBack || useProxy) return; fellBack = true;
            const refQ = headersNeeded.Referer ? `&referer=${encodeURIComponent(headersNeeded.Referer)}` : '';
            const orgQ = headersNeeded.Origin ? `&origin=${encodeURIComponent(headersNeeded.Origin)}` : '';
            const proxied = `/api/proxy?url=${encodeURIComponent(override)}${refQ}${orgQ}`;
            await playWithHls(proxied);
            sourceMeta?.classList.remove('hidden');
            if (sourceMeta) sourceMeta.textContent = `Direct • HLS (proxied)`;
          }
        });
        current.expiresAt = null;
        sourceMeta?.classList.remove('hidden');
        if (sourceMeta) sourceMeta.textContent = `Direct • HLS${useProxy ? ' (proxied)' : ''}`;
        return;
      }

      function headersFor(pv) {
        if (pv === 'vidfast') return { Referer: 'https://vidfast.pro', Origin: 'https://vidfast.pro' };
        if (pv === 'videasy') return { Referer: 'https://player.videasy.net', Origin: 'https://player.videasy.net' };
        return {};
      }

      function embedCandidates(pv, t, id, sn, ep, imdbId) {
        const s = sn ?? 1; const e = ep ?? 1;
        const list = [];
        if (pv === 'vidfast') {
          // Known patterns for vidfast.pro
          list.push(
            t === 'movie' ? `https://vidfast.pro/movie/${id}?autoPlay=true` : null,
            t === 'tv' ? `https://vidfast.pro/tv/${id}/${s}/${e}?autoPlay=true` : null,
            t === 'movie' ? `https://vidfast.pro/embed/movie/${id}` : `https://vidfast.pro/embed/tv/${id}/${s}/${e}`,
            t === 'movie' ? `https://vidfast.pro/watch/movie/${id}` : `https://vidfast.pro/watch/tv/${id}/${s}/${e}`,
            t === 'movie' ? `https://vidfast.pro/movie/${id}?tmdb=${id}&autoPlay=true` : `https://vidfast.pro/tv/${id}/${s}/${e}?tmdb=${id}&autoPlay=true`
          );
        }
        if (pv === 'videasy') {
          // Known patterns for player.videasy.net
          list.push(
            t === 'movie' ? `https://player.videasy.net/movie/${id}` : null,
            t === 'tv' ? `https://player.videasy.net/tv/${id}/${s}/${e}` : null,
            t === 'movie' ? `https://player.videasy.net/embed/movie/${id}` : `https://player.videasy.net/embed/tv/${id}/${s}/${e}`,
            t === 'movie' ? `https://player.videasy.net/e/movie/${id}` : `https://player.videasy.net/e/tv/${id}/${s}/${e}`,
            t === 'movie' ? `https://player.videasy.net/movie/${id}?tmdb=${id}` : `https://player.videasy.net/tv/${id}/${s}/${e}?tmdb=${id}`
          );
        }
        return Array.from(new Set(list.filter(Boolean)));
      }

      function proxyUrl(target, hdrs) {
        const ref = hdrs?.Referer || '';
        const org = hdrs?.Origin || '';
        const refQ = ref ? `&referer=${encodeURIComponent(ref)}` : '';
        const orgQ = org ? `&origin=${encodeURIComponent(org)}` : '';
        return `/api/proxy?url=${encodeURIComponent(target)}${refQ}${orgQ}`;
      }
      function toAbs(url, base) { try { return new URL(url, base).toString(); } catch { return url; } }
      function findM3U8(html, base) {
        let m = html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/i);
        if (m) return toAbs(m[0], base);
        m = html.match(/https?:\\\/\\\/[^"'\s]+\.m3u8[^"'\s]*/i);
        if (m) return toAbs(m[0].replace(/\\\//g, '/'), base);
        m = html.match(/["']([^"']+\.m3u8[^"']*)["']/i);
        if (m) return toAbs(m[1], base);
        return null;
      }
      function extractIframesAndSrcdoc(html, base) {
        const urls = []; const srcdocs = [];
        const re1 = /<iframe[^>]+src=["']([^"']+)["'][^>]*>/gi; let m;
        while ((m = re1.exec(html))) urls.push(toAbs(m[1], base));
        const re2 = /<iframe[^>]+data-src=["']([^"']+)["'][^>]*>/gi; let m2;
        while ((m2 = re2.exec(html))) urls.push(toAbs(m2[1], base));
        const re3 = /<iframe[^>]+srcdoc=["']([^"']+)["'][^>]*>/gi; let m3;
        while ((m3 = re3.exec(html))) srcdocs.push(m3[1]);
        return { urls, srcdocs };
      }
      function extractLinks(html, base) {
        const links = []; const re = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi; let m;
        while ((m = re.exec(html))) links.push(toAbs(m[1], base));
        return links;
      }
      function allowedHostsFor(pv) {
        if (pv === 'vidfast') return ['vidfast.pro'];
        if (pv === 'videasy') return ['videasy.net'];
        return [];
      }
      async function fetchWithTimeout(input, init = {}) {
        const timeoutMs = Math.max(1000, init.timeoutMs ?? 12000);
        const ac = new AbortController();
        const id = setTimeout(() => ac.abort(), timeoutMs);
        try {
          const { timeoutMs: _t, proxyHeaders, preferProxy, ...rest } = init;
          const merged = { ...rest, signal: ac.signal, headers: (rest.headers || { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }) };
          let target = input;
          if (typeof target === 'string' && proxyHeaders && (preferProxy ?? true)) {
            const t = String(target);
            const alreadyProxied = t.startsWith('/api/proxy?') || t.includes('/api/proxy?url=') || (t.startsWith(location.origin) && t.includes('/api/proxy?url='));
            if (!alreadyProxied) target = proxyUrl(t, proxyHeaders);
          }
          return await fetch(target, merged);
        } finally { clearTimeout(id); }
      }
      async function crawlForM3u8(startUrl, maxDepth = 4, proxyHeaders = {}, hostAllow = []) {
        const startHost = (() => { try { return new URL(startUrl).hostname; } catch { return ''; } })();
        const chain = [startUrl];
        const visited = new Set();
        const queue = [{ url: startUrl, depth: 0 }];
        const isAllowed = (u) => {
          try {
            const h = new URL(u).hostname;
            if (hostAllow.length) return hostAllow.some(suf => h === suf || h.endsWith('.' + suf));
            return h === startHost;
          } catch { return false; }
        };
        while (queue.length) {
          const { url: cur, depth } = queue.shift();
          if (visited.has(cur) || depth > maxDepth) continue;
          visited.add(cur);
          const r = await fetchWithTimeout(cur, { timeoutMs: 15000, proxyHeaders, preferProxy: true });
          let text = '';
          try { text = await r.text(); } catch { text = ''; }
          let m3u8 = text ? findM3U8(text, cur) : null;
          if (m3u8) return { m3u8, chain };
          const { urls, srcdocs } = text ? extractIframesAndSrcdoc(text, cur) : { urls: [], srcdocs: [] };
          for (const sd of srcdocs) {
            const found = findM3U8(sd, cur);
            if (found) return { m3u8: found, chain };
          }
          const anchors = text ? extractLinks(text, cur) : [];
          const nexts = [...urls, ...anchors]
            .filter(u => isAllowed(u))
            .filter(u => !visited.has(u))
            .filter(u => /(?:embed|watch|play|video|movie|tv)/i.test(u));
          for (const n of nexts) { queue.push({ url: n, depth: depth + 1 }); chain.push(n); }
        }
        return { m3u8: null, chain };
      }
      async function resolveProvider(pv) {
        const hdrs = headersFor(pv);
        let imdbId = '';
        try { const ext = await getExternalIds(); imdbId = ext?.imdb_id || ''; } catch {}
        const candidates = embedCandidates(pv, type, tmdb_id, season, episode, imdbId);
        let lastChain = [];
        for (const embed of candidates) {
          console.debug('[watch] resolveProvider try', { pv, embed });
          const { m3u8, chain } = await crawlForM3u8(embed, 4, hdrs, allowedHostsFor(pv));
          console.debug('[watch] crawl chain', chain);
          lastChain = chain;
          if (m3u8) {
            try {
              const checkUrl = proxyUrl(m3u8, hdrs);
              const head = await fetch(checkUrl, { method: 'HEAD' });
              if (!head.ok) { await fetch(checkUrl, { headers: { Range: 'bytes=0-1023' } }).catch(() => {}); }
            } catch {}
            console.debug('[watch] resolved m3u8', m3u8);
            return m3u8;
          }
        }
        console.warn('[watch] no stream found for provider', pv, 'lastChain=', lastChain);
        throw new Error('Stream not found');
      }

      let chosen = provider;
      let streamUrl = null;
      try {
        streamUrl = await resolveProvider(provider);
      } catch (e1) {
        const alt = provider === 'vidfast' ? 'videasy' : 'vidfast';
        try {
          streamUrl = await resolveProvider(alt);
          chosen = alt;
        } catch (e2) {
          throw e1 || e2 || new Error('Failed to resolve stream');
        }
      }

      const headersNeeded = headersFor(chosen);
      let finalUrl = streamUrl;
      if (useProxy) {
        const ref = headersNeeded.Referer || '';
        const org = headersNeeded.Origin || '';
        const refQ = ref ? `&referer=${encodeURIComponent(ref)}` : '';
        const orgQ = org ? `&origin=${encodeURIComponent(org)}` : '';
        finalUrl = `/api/proxy?url=${encodeURIComponent(streamUrl)}${refQ}${orgQ}`;
      } else {
        try { navigator.serviceWorker.controller?.postMessage({ t: 'set-headers', forUrl: streamUrl, headers: headersNeeded, ttl: 14400 }); } catch {}
      }
      let didFallback = false;
      async function doFallback() {
        if (didFallback || useProxy) return;
        didFallback = true;
        try {
          const proxied = proxyUrl(streamUrl, headersNeeded);
          await playWithHls(proxied);
          sourceMeta?.classList.remove('hidden');
          if (sourceMeta) sourceMeta.textContent = `${chosen} • HLS (proxied)`;
        } catch (_) {}
      }
      if (!useProxy) { video.addEventListener('error', () => { doFallback(); }, { once: true }); }
      await playWithHls(finalUrl, { onError: () => { doFallback(); } });
      current.expiresAt = null;
      sourceMeta?.classList.remove('hidden');
      if (sourceMeta) sourceMeta.textContent = `${chosen} • HLS`;
    } catch (e) {
      console.error('[watch] resolve/play failed', e);
      showError(`Failed to play: ${e?.message || e}`);
    } finally {
      setBuffering(false);
    }
  }

  function escapeHTML(s) {
    return String(s || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }
})();
