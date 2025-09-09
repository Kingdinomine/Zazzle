// settings.js - Profile Settings page logic
(() => {
  // Default anime/cartoon avatars from Unsplash Source. Stable per user via hash
  const AVATAR_POOL = [
    'https://source.unsplash.com/featured/256x256/?anime,character&sig=11',
    'https://source.unsplash.com/featured/256x256/?anime,cartoon&sig=22',
    'https://source.unsplash.com/featured/256x256/?anime,avatar&sig=33',
    'https://source.unsplash.com/featured/256x256/?manga,portrait&sig=44',
    'https://source.unsplash.com/featured/256x256/?cartoon,portrait&sig=55',
  ];
  function hashString(s) { let h = 0; if (!s) return 0; for (let i=0;i<s.length;i++){ h=((h<<5)-h)+s.charCodeAt(i); h|=0; } return Math.abs(h); }
  function defaultAvatarFor(userId) { const idx = hashString(String(userId||'')) % AVATAR_POOL.length; return AVATAR_POOL[idx]; }
  function $(s, r=document) { return r.querySelector(s); }
  function setMsg(t) { const m = $('#settings-msg'); if (m) m.textContent = t || ''; }
  const avatarPreview = $('#avatarPreview');
  const avatarButton = $('#avatarButton');
  const avatarFile = $('#avatarFile');
  const fullName = $('#fullName');
  const username = $('#username');
  const currentEmail = $('#currentEmail');
  const saveProfile = $('#saveProfile');
  const emailInput = $('#email');
  const updateEmailBtn = $('#updateEmailBtn');

  async function ensureAuth() {
    await window.SUPABASE?.ready?.();
    const { user } = await window.SUPABASE.auth.getUser();
    if (!user) {
      setMsg('You must be signed in to view settings. Redirecting…');
      setTimeout(() => location.href = 'sign-in.html', 900);
      throw new Error('not-signed-in');
    }
    return user;
  }

  async function loadProfile() {
    try {
      const user = await ensureAuth();
      try { currentEmail.textContent = user.email || ''; } catch(_) {}
      const { data, error } = await window.SUPABASE.profiles.get();
      if (error) throw error;
      if (data) {
        if (fullName) fullName.value = data.full_name || '';
        if (username) username.value = data.username || '';
        if (avatarPreview) avatarPreview.src = data.avatar_url || defaultAvatarFor(user.id);
      }
    } catch (e) {
      console.error('loadProfile', e);
      setMsg(e?.message || 'Unable to load profile');
    }
  }

  async function onSaveProfile() {
    try {
      setMsg('Saving profile…');
      const fields = {
        full_name: fullName?.value?.trim() || null,
        username: username?.value?.trim() || null,
      };
      const { error } = await window.SUPABASE.profiles.update(fields);
      if (error) throw error;
      setMsg('Profile saved');
    } catch (e) {
      setMsg(e?.message || 'Could not save profile');
    }
  }

  function wireAvatarUpload() {
    if (!avatarButton || !avatarFile) return;
    avatarButton.addEventListener('click', () => avatarFile.click());
    avatarFile.addEventListener('change', async () => {
      if (!avatarFile.files || !avatarFile.files[0]) return;
      const file = avatarFile.files[0];
      try {
        setMsg('Uploading avatar…');
        const { url, error } = await window.SUPABASE.profiles.uploadAvatar(file);
        if (error) throw error;
        if (url) {
          const { error: upErr } = await window.SUPABASE.profiles.update({ avatar_url: url });
          if (upErr) throw upErr;
          if (avatarPreview) avatarPreview.src = url;
          setMsg('Avatar updated');
        } else {
          setMsg('Upload failed');
        }
      } catch (e) {
        console.error('avatar upload', e);
        setMsg(e?.message || 'Avatar upload failed');
      } finally {
        try { avatarFile.value = ''; } catch(_) {}
      }
    });
  }

  async function onUpdateEmail() {
    try {
      const newEmail = emailInput?.value?.trim();
      if (!newEmail) { setMsg('Enter a new email'); return; }
      setMsg('Updating email…');
      const { error } = await window.SUPABASE.auth.updateEmail(newEmail);
      if (error) throw error;
      setMsg('Email update requested. Please check your inbox to confirm.');
    } catch (e) {
      setMsg(e?.message || 'Could not update email');
    }
  }

  function init() {
    loadProfile();
    wireAvatarUpload();
    saveProfile?.addEventListener('click', onSaveProfile);
    updateEmailBtn?.addEventListener('click', onUpdateEmail);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
