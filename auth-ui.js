// Navbar auth state manager and avatar dropdown
(() => {
  const DEFAULT_AVATAR = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><circle cx="40" cy="40" r="40" fill="%23131618"/><circle cx="40" cy="30" r="16" fill="%2321272f"/><path d="M12 72c6-14 18-22 28-22s22 8 28 22" fill="%2321272f"/></svg>';

  // Five anime/cartoon avatar placeholders from Unsplash Source (stable size)
  const AVATAR_POOL = [
    'https://source.unsplash.com/featured/256x256/?anime,character&sig=11',
    'https://source.unsplash.com/featured/256x256/?anime,cartoon&sig=22',
    'https://source.unsplash.com/featured/256x256/?anime,avatar&sig=33',
    'https://source.unsplash.com/featured/256x256/?manga,portrait&sig=44',
    'https://source.unsplash.com/featured/256x256/?cartoon,portrait&sig=55',
  ];

  function hashString(s) {
    let h = 0; if (!s) return 0; for (let i=0;i<s.length;i++) { h = ((h<<5)-h) + s.charCodeAt(i); h |= 0; }
    return Math.abs(h);
  }
  function defaultAvatarFor(userId) {
    const idx = hashString(String(userId || '')) % AVATAR_POOL.length;
    return AVATAR_POOL[idx];
  }

  function $(s) { return document.querySelector(s); }

  async function init() {
    try { await window.SUPABASE?.ready?.(); } catch(_) {}
    render();
    try {
      window.SUPABASE?.auth?.onAuthStateChange?.((_evt, _sess) => {
        render();
        document.dispatchEvent(new CustomEvent('auth:change'));
      });
    } catch(_) {}
  }

  function render() {
    const navRight = document.querySelector('.nav-right');
    if (!navRight) return;
    const signUpBtn = navRight.querySelector('.get-hbo-btn');
    const signInBtn = navRight.querySelector('.sign-in-btn');
    // Wire default actions
    if (signUpBtn && !signUpBtn.dataset.wired) { signUpBtn.dataset.wired = '1'; signUpBtn.addEventListener('click', () => { location.href = 'sign-up.html'; }); }
    if (signInBtn && !signInBtn.dataset.wired) { signInBtn.dataset.wired = '1'; signInBtn.addEventListener('click', () => { location.href = 'sign-in.html'; }); }

    const state = { user: null };
    try {
      const u = window.SUPABASE?.auth ? window.SUPABASE.auth.getUser() : null;
      if (u && typeof u.then === 'function') {
        // async call — temporarily set loading class
      }
    } catch(_) {}

    (async () => {
      let user = null;
      try { ({ user } = await (window.SUPABASE?.auth?.getUser?.() || { user:null })); } catch(_) {}
      window.IS_LOGGED_IN = !!user;

      // Remove previous avatar/dropdown if exists
      const oldWrap = navRight.querySelector('.avatar-wrap');
      if (oldWrap) oldWrap.remove();

      if (user) {
        // Hide sign-in/up
        if (signUpBtn) signUpBtn.style.display = 'none';
        if (signInBtn) signInBtn.style.display = 'none';

        const wrap = document.createElement('div');
        wrap.className = 'avatar-wrap';
        wrap.style.position = 'relative';
        wrap.innerHTML = `
          <button class="avatar-btn" id="avatarBtn" aria-haspopup="true" aria-expanded="false">
            <img id="navAvatar" class="avatar-img" alt="Profile" src="${DEFAULT_AVATAR}">
          </button>
          <div id="profileMenu" class="profile-menu" role="menu" aria-hidden="true">
            <a class="profile-item" href="settings.html" role="menuitem">Profile Settings</a>
            <a class="profile-item" href="watchlist.html" role="menuitem">Watchlist</a>
            <a class="profile-item" href="favorites.html" role="menuitem">Favorites</a>
            <div class="profile-sep"></div>
            <button id="logoutBtn" class="profile-item" type="button" role="menuitem">Logout</button>
          </div>`;
        navRight.appendChild(wrap);

        // Load avatar from profile or fallback to a stable Unsplash anime avatar per user
        try {
          const { data } = await window.SUPABASE?.profiles?.get?.();
          const url = data?.avatar_url || null;
          const img = $('#navAvatar');
          if (img) img.src = url || defaultAvatarFor(user.id);
        } catch(_) {}

        const btn = $('#avatarBtn');
        const menu = $('#profileMenu');
        const logoutBtn = $('#logoutBtn');
        const closeAll = () => { if (menu) { menu.classList.remove('open'); menu.setAttribute('aria-hidden','true'); } if (btn) btn.setAttribute('aria-expanded','false'); };
        btn?.addEventListener('click', (e) => {
          e.stopPropagation();
          const open = menu?.classList.contains('open');
          if (open) closeAll(); else { menu?.classList.add('open'); menu?.setAttribute('aria-hidden','false'); btn?.setAttribute('aria-expanded','true'); }
        });
        document.addEventListener('click', (e) => { if (!menu) return; if (!menu.contains(e.target) && !btn.contains(e.target)) closeAll(); });
        logoutBtn?.addEventListener('click', async () => { try { await window.SUPABASE?.auth?.signOut?.(); location.href = 'index.html'; } catch(_) {} });
      } else {
        // Show sign-in/up
        if (signUpBtn) signUpBtn.style.display = '';
        if (signInBtn) signInBtn.style.display = '';
      }
    })();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
