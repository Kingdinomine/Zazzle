// Handles sign-in, sign-up, and reset-password forms
(() => {
  function $(s, r = document) { return r.querySelector(s); }
  const msg = (t) => { const el = $('#auth-msg'); if (el) el.textContent = t || ''; };

  async function onReady() {
    try { await window.SUPABASE?.ready?.(); } catch(_) {}

    const signInForm = $('#sign-in-form');
    const signUpForm = $('#sign-up-form');
    const resetForm = $('#reset-password-form');

    if (signInForm) signInForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg('');
      const email = signInForm.querySelector('.username.input')?.value?.trim();
      const password = signInForm.querySelector('.password.input')?.value || '';
      if (!email || !password) { msg('Enter email and password'); return; }
      try {
        const { error } = await window.SUPABASE.auth.signInWithPassword({ email, password });
        if (error) throw error;
        msg('Signed in. Redirecting…');
        setTimeout(() => { location.href = 'index.html'; }, 600);
      } catch (e) {
        msg(e?.message || 'Unable to sign in');
      }
    });

    if (signUpForm) signUpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg('');
      const email = signUpForm.querySelector('.username.input')?.value?.trim();
      const password = signUpForm.querySelector('.password.input')?.value || '';
      if (!email || !password) { msg('Enter email and password'); return; }
      try {
        const origin = (location && location.origin) ? location.origin : '';
        const redirectTo = origin ? `${origin}/sign-in.html` : undefined;
        const { error } = await window.SUPABASE.auth.signUp({ email, password, options: redirectTo ? { emailRedirectTo: redirectTo } : {} });
        if (error) throw error;
        msg('Account created. Check your email to confirm (if required).');
        setTimeout(() => { location.href = 'sign-in.html'; }, 900);
      } catch (e) {
        msg(e?.message || 'Unable to sign up');
      }
    });

    if (resetForm) resetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg('');
      const email = resetForm.querySelector('.username.input')?.value?.trim();
      if (!email) { msg('Enter your email'); return; }
      try {
        const origin = (location && location.origin) ? location.origin : '';
        const redirectTo = origin ? `${origin}/sign-in.html` : undefined;
        const { error } = await window.SUPABASE.auth.resetPasswordForEmail(email, redirectTo);
        if (error) throw error;
        msg('Reset link sent. Check your email.');
      } catch (e) {
        msg(e?.message || 'Unable to send reset link');
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
  else onReady();
})();
