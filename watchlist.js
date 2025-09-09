// watchlist.js - Lists and manages user's watchlist
(() => {
  const grid = document.getElementById('wl-grid');
  const sub = document.getElementById('results-sub');
  const TMDB_IMG = 'https://image.tmdb.org/t/p/';

  function pngify(url) {
    if (!url) return '';
    try {
      const clean = String(url).replace(/^https?:\/\//, '');
      return `https://images.weserv.nl/?url=${encodeURIComponent(clean)}&output=png`;
    } catch { return url; }
  }
  function tmdbImg(path, size = 'w780') {
    if (!path) return '';
    if (/^https?:/i.test(path)) return pngify(path);
    return pngify(`${TMDB_IMG}${size}${path}`);
  }

  async function ensureAuth() {
    await window.SUPABASE?.ready?.();
    const { user } = await window.SUPABASE.auth.getUser();
    if (!user) {
      if (sub) sub.textContent = 'Please sign in to view Watchlist';
      setTimeout(() => location.href = 'sign-in.html', 900);
      throw new Error('not-signed-in');
    }
    return user;
  }

  function cardHTML(it) {
    const title = (it.title || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const type = (it.media_type || '').toLowerCase() === 'tv' ? 'tv' : 'movie';
    const poster = it.poster_path || it.backdrop_path || '';
    const img = tmdbImg(poster, 'w780');
    const href = type === 'tv' ? `detail.html?type=tv&id=${it.tmdb_id}` : `detail.html?type=movie&id=${it.tmdb_id}`;
    return `
      <article class="episode-card" role="listitem">
        <a href="${href}" aria-label="Open ${title}">
          ${img ? `<img class="episode-thumb" loading="lazy" src="${img}" alt="${title}">` : `<div class="episode-thumb" style="background:rgba(255,255,255,.06)" aria-hidden="true"></div>`}
        </a>
        <div class="episode-meta">
          <div class="episode-title">${title}</div>
          <div>${type.toUpperCase()}</div>
        </div>
        <div class="result-actions" style="position:absolute;top:8px;right:8px;">
          <button class="result-btn secondary" data-action="remove" data-id="${it.tmdb_id}" data-type="${type}"><span>Remove</span></button>
        </div>
      </article>`;
  }

  async function load() {
    try {
      await ensureAuth();
      if (sub) sub.textContent = 'Loading…';
      const { data, error } = await window.SUPABASE.watchlist.list();
      if (error) throw error;
      const items = Array.isArray(data) ? data : [];
      if (!items.length) {
        if (grid) grid.innerHTML = '<div style="padding:12px;opacity:.8">Your watchlist is empty.</div>';
        if (sub) sub.textContent = 'Your watchlist';
        return;
      }
      if (grid) grid.innerHTML = items.map(cardHTML).join('');
      if (sub) sub.textContent = `${items.length} item${items.length>1?'s':''} in watchlist`;
      wire();
    } catch (e) {
      if (grid) grid.innerHTML = '<div style="padding:12px">Unable to load watchlist.</div>';
    }
  }

  function wire() {
    if (!grid) return;
    grid.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action="remove"]');
      if (!btn) return;
      const tmdb_id = Number(btn.getAttribute('data-id'));
      const media_type = btn.getAttribute('data-type');
      try {
        const { error } = await window.SUPABASE.watchlist.remove({ tmdb_id, media_type });
        if (error) throw error;
        load();
      } catch (_) {}
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
})();
