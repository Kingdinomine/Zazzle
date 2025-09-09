export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const method = request.method.toUpperCase();

      // Basic CORS and preflight
      if (method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
      }

      if (url.pathname === '/resolve') {
        return await handleResolve(request, url);
      }

      if (url.pathname === '/iframe') {
        return await handleIframe(request, url);
      }

      if (url.pathname === '/frame') {
        return await handleFrame(request, url);
      }

      if (url.pathname === '/proxy') {
        return await handleProxy(request, url);
      }

      return new Response('Not found', { status: 404, headers: corsHeaders(request) });
    } catch (e) {
      return new Response('Worker error', { status: 500, headers: corsHeaders(request) });
    }
  },
};

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Range',
    'Access-Control-Max-Age': '86400',
  };
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// ===============================
// 1) Resolve: provider+id(+season/episode) => m3u8 via crawling
// ===============================
async function handleResolve(request, url) {
  const provider = (url.searchParams.get('provider') || 'auto').toLowerCase();
  const type = (url.searchParams.get('type') || 'movie').toLowerCase();
  const id = url.searchParams.get('id');
  const season = url.searchParams.get('season') || '1';
  const episode = url.searchParams.get('episode') || '1';
  const embed = url.searchParams.get('embed'); // direct embed URL (optional)
  const debug = ['1','true','yes'].includes((url.searchParams.get('debug') || '').toLowerCase());
  const attempts = [];

  if (!id && !embed) {
    return new Response('Missing id or embed', { status: 400, headers: corsHeaders(request) });
  }

  const tryProviders = provider === 'auto' ? ['videasy', 'vidfast'] : [provider];

  // If a direct embed URL was provided, try only that first
  if (embed) {
    try {
      const embedUrl = embed;
      let referer = url.searchParams.get('referer') || '';
      if (!referer) { try { referer = new URL(embedUrl).origin + '/'; } catch {}
      }
      const resp = await fetch(embedUrl, {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': referer,
        },
      });
      const status = resp.status;
      let html = '';
      if (resp.ok) { html = await resp.text(); }
      attempts.push({ provider: 'direct', embedUrl, status, htmlLen: html.length });

      let m3u8 = resp.ok ? extractM3U8(html) : '';
      if (!m3u8 && resp.ok) {
        const frames = findIframeSrcs(html).slice(0, 3);
        attempts[attempts.length - 1].iframeCount = frames.length;
        for (const frame of frames) {
          const frameUrl = new URL(frame, embedUrl).toString();
          const ref = new URL(frameUrl).origin + '/';
          const r2 = await fetch(frameUrl, {
            headers: {
              'User-Agent': UA,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'Referer': referer,
            },
          });
          const s2 = r2.status;
          let html2 = '';
          if (r2.ok) html2 = await r2.text();
          attempts.push({ provider: 'direct-iframe', frameUrl, status: s2, htmlLen: html2.length });
          m3u8 = r2.ok ? extractM3U8(html2) : '';
          if (m3u8) { referer = ref; break; }
        }
      }

      if (m3u8) {
        try { m3u8 = new URL(m3u8, embedUrl).toString(); } catch {}
        const payload = {
          ok: true,
          provider: 'direct',
          embed: embedUrl,
          url: `/proxy?url=${encodeURIComponent(m3u8)}&referer=${encodeURIComponent(referer)}`,
        };
        if (debug) payload.attempts = attempts;
        return new Response(JSON.stringify(payload), { status: 200, headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } });
      }
    } catch (e) {
      attempts.push({ provider: 'direct', error: String(e && e.message || e) });
    }
  }

  for (const p of tryProviders) {
    const { candidates, referers } = buildCandidates(p, type, id, season, episode);
    for (let i = 0; i < candidates.length; i++) {
      const embedUrl = candidates[i];
      const referer = referers[i] || new URL(embedUrl).origin + '/';
      try {
        const resp = await fetch(embedUrl, {
          headers: {
            'User-Agent': UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': referer,
          },
        });
        const status = resp.status;
        let html = '';
        if (!resp.ok) { attempts.push({ provider: p, embedUrl, status }); continue; }
        html = await resp.text();

        // Extract m3u8 from HTML/JS
        let m3u8 = extractM3U8(html);
        let refererForProxy = referer;

        // If not found, try following iframes inside the embed page
        if (!m3u8) {
          const frames = findIframeSrcs(html).slice(0, 3);
          attempts.push({ provider: p, embedUrl, status, iframeCount: frames.length, htmlLen: html.length });
          for (const frame of frames) {
            const frameUrl = new URL(frame, embedUrl).toString();
            const ref = new URL(frameUrl).origin + '/';
            const r2 = await fetch(frameUrl, {
              headers: {
                'User-Agent': UA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': referer, // keep parent as referer for iframe fetch
              },
            });
            if (!r2.ok) continue;
            const html2 = await r2.text();
            m3u8 = extractM3U8(html2);
            attempts.push({ provider: p + '-iframe', frameUrl, status: r2.status, htmlLen: html2.length, found: !!m3u8 });
            if (m3u8) { refererForProxy = ref; break; }
          }
        }

        // Provider-specific: Vidfast exposes an 'en' token and JSON API for sources
        if (!m3u8 && p === 'vidfast') {
          try {
            const en = extractVidfastEn(html);
            const host = extractVidfastHost(html) || (new URL(embedUrl).origin);
            if (en && host) {
              const apiM3u8 = await resolveViaVidfastApi(host, en, referer);
              attempts.push({ provider: 'vidfast-api', host, en: en.slice(0, 16) + '...', found: !!apiM3u8 });
              if (apiM3u8) {
                m3u8 = apiM3u8;
                // keep original referer
              }
            } else {
              attempts.push({ provider: 'vidfast-api', reason: 'missing token or host' });
            }
          } catch (e) {
            attempts.push({ provider: 'vidfast-api', error: String(e && e.message || e) });
          }
        }

        if (!m3u8) continue;

        try { m3u8 = new URL(m3u8, embedUrl).toString(); } catch {}

        const json = {
          ok: true,
          provider: p,
          embed: embedUrl,
          url: `/proxy?url=${encodeURIComponent(m3u8)}&referer=${encodeURIComponent(refererForProxy)}`,
        };
        if (debug) json.attempts = attempts;
        return new Response(JSON.stringify(json), { status: 200, headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } });
      } catch (_) {
        // try next candidate
      }
    }
  }

  const errPayload = { ok: false, error: 'Stream not found' };
  if (debug) errPayload.attempts = attempts;
  return new Response(JSON.stringify(errPayload), { status: 404, headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } });
}

function buildCandidates(provider, type, id, season, episode) {
  const out = [];
  const refs = [];

  if (provider === 'videasy') {
    const domains = ['https://player.videasy.net', 'https://videasy.net', 'https://videasy.to', 'https://player.videasy.to'];
    for (const d of domains) {
      const ref = d + '/';
      if (type === 'tv') {
        // path-based
        out.push(`${d}/e/tv/${id}/${season}/${episode}`); refs.push(ref);
        out.push(`${d}/embed/tv/${id}/${season}/${episode}`); refs.push(ref);
        out.push(`${d}/tv/${id}/${season}/${episode}`); refs.push(ref);
        // tmdb-param based
        out.push(`${d}/embed/tv?tmdb=${id}&s=${season}&e=${episode}`); refs.push(ref);
        out.push(`${d}/e/tv?tmdb=${id}&s=${season}&e=${episode}`); refs.push(ref);
        out.push(`${d}/tv?tmdb=${id}&s=${season}&e=${episode}`); refs.push(ref);
        out.push(`${d}/iframe/tv?tmdb=${id}&s=${season}&e=${episode}`); refs.push(ref);
      } else {
        // path-based
        out.push(`${d}/e/movie/${id}`); refs.push(ref);
        out.push(`${d}/embed/movie/${id}`); refs.push(ref);
        out.push(`${d}/movie/${id}`); refs.push(ref);
        // tmdb-param based
        out.push(`${d}/embed/movie?tmdb=${id}`); refs.push(ref);
        out.push(`${d}/e/movie?tmdb=${id}`); refs.push(ref);
        out.push(`${d}/movie?tmdb=${id}`); refs.push(ref);
        out.push(`${d}/iframe/movie?tmdb=${id}`); refs.push(ref);
      }
    }
  } else if (provider === 'vidfast') {
    const domains = ['https://vidfast.pro', 'https://vidfast.to', 'https://vidfast.xyz'];
    for (const d of domains) {
      const ref = d + '/';
      if (type === 'tv') {
        // path/legacy
        out.push(`${d}/tv/${id}/${season}/${episode}`); refs.push(ref);
        out.push(`${d}/e/${id}?s=${season}&e=${episode}`); refs.push(ref);
        out.push(`${d}/watch/tv/${id}/${season}/${episode}`); refs.push(ref);
        out.push(`${d}/embed/tv/${id}/${season}/${episode}`); refs.push(ref);
        // tmdb-param based
        out.push(`${d}/embed/tv?tmdb=${id}&s=${season}&e=${episode}`); refs.push(ref);
        out.push(`${d}/e/tv?tmdb=${id}&s=${season}&e=${episode}`); refs.push(ref);
        out.push(`${d}/tv?tmdb=${id}&s=${season}&e=${episode}`); refs.push(ref);
      } else {
        out.push(`${d}/e/${id}`); refs.push(ref);
        out.push(`${d}/embed/movie/${id}`); refs.push(ref);
        out.push(`${d}/watch/movie/${id}`); refs.push(ref);
        // tmdb-param based
        out.push(`${d}/embed/movie?tmdb=${id}`); refs.push(ref);
        out.push(`${d}/e/movie?tmdb=${id}`); refs.push(ref);
        out.push(`${d}/movie?tmdb=${id}`); refs.push(ref);
      }
    }
  }

  return { candidates: out, referers: refs };
}

function extractM3U8(html) {
  if (!html) return '';
  // Common patterns: direct URL in HTML/JS strings
  const patterns = [
    // direct absolute
    /(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i,
    // quoted relative or absolute
    /["']([^"']+\.m3u8[^"']*)["']/i,
    // file: "...m3u8"
    /file\s*[:=]\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return sanitizeUrl(m[1]);
    if (m && m[0]) return sanitizeUrl(m[0]);
  }
  return '';
}

function sanitizeUrl(u) {
  try {
    return decodeURIComponent(u.replace(/\\u0026/g, '&').replace(/\\\//g, '/'));
  } catch {
    return u;
  }
}

function findIframeSrcs(html) {
  const out = [];
  const re = /<iframe[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) out.push(m[1]);
    if (out.length >= 5) break;
  }
  return out;
}

// Helper: strip known tracking params from URLs
function cleanUrl(u) {
  try {
    const x = new URL(u);
    const removeKeys = [
      'utm_source','utm_medium','utm_campaign','utm_term','utm_content',
      'fbclid','gclid','msclkid','yclid','aff','aff_id','ref','referrer','refsrc','clickid','adid'
    ];
    for (const k of removeKeys) x.searchParams.delete(k);
    return x.toString();
  } catch { return u; }
}

// ===============================
// 1b) Resolve to an embeddable iframe (proxied via /frame)
// ===============================
async function handleIframe(request, url) {
  const provider = (url.searchParams.get('provider') || 'auto').toLowerCase();
  const type = (url.searchParams.get('type') || 'movie').toLowerCase();
  const id = url.searchParams.get('id');
  const season = url.searchParams.get('season') || '1';
  const episode = url.searchParams.get('episode') || '1';
  const embed = url.searchParams.get('embed');
  const debug = ['1','true','yes'].includes((url.searchParams.get('debug') || '').toLowerCase());
  const attempts = [];

  if (!id && !embed) {
    return new Response('Missing id or embed', { status: 400, headers: corsHeaders(request) });
  }

  async function extractFrameFrom(embedUrl, referer) {
    const resp = await fetch(embedUrl, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': referer,
      },
      redirect: 'follow',
    });
    const status = resp.status;
    if (!resp.ok) { attempts.push({ stage: 'embed', url: embedUrl, status }); return null; }
    const html = await resp.text();
    const frames = findIframeSrcs(html);
    attempts.push({ stage: 'embed', url: embedUrl, status, iframeCount: frames.length, htmlLen: html.length });
    if (frames.length) {
      const first = new URL(frames[0], embedUrl).toString();
      return { frame: first, referer };
    }
    // Fallback: use the embed page itself
    return { frame: embedUrl, referer };
  }

  const tryProviders = provider === 'auto' ? ['videasy', 'vidfast'] : [provider];

  // Direct embed
  if (embed) {
    try {
      let referer = url.searchParams.get('referer') || '';
      if (!referer) { try { referer = new URL(embed).origin + '/'; } catch {} }
      const found = await extractFrameFrom(embed, referer);
      if (found) {
        const frameAbs = cleanUrl(found.frame);
        const frameUrl = `/frame?url=${encodeURIComponent(frameAbs)}&referer=${encodeURIComponent(found.referer)}`;
        const payload = { ok: true, provider: 'direct', embed, frame: frameUrl, raw: frameAbs };
        if (debug) payload.attempts = attempts;
        return new Response(JSON.stringify(payload), { status: 200, headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } });
      }
    } catch (e) {
      attempts.push({ error: String(e && e.message || e) });
    }
  }

  for (const p of tryProviders) {
    const { candidates, referers } = buildCandidates(p, type, id, season, episode);
    for (let i = 0; i < candidates.length; i++) {
      const embedUrl = candidates[i];
      const referer = referers[i] || new URL(embedUrl).origin + '/';
      try {
        const found = await extractFrameFrom(embedUrl, referer);
        if (!found) continue;
        let frameAbs = cleanUrl(found.frame);
        try { frameAbs = new URL(frameAbs, embedUrl).toString(); } catch {}
        const frameUrl = `/frame?url=${encodeURIComponent(frameAbs)}&referer=${encodeURIComponent(found.referer)}`;
        const json = { ok: true, provider: p, embed: embedUrl, frame: frameUrl, raw: frameAbs };
        if (debug) json.attempts = attempts;
        return new Response(JSON.stringify(json), { status: 200, headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } });
      } catch (e) {
        attempts.push({ provider: p, embedUrl, error: String(e && e.message || e) });
      }
    }
  }

  const errPayload = { ok: false, error: 'Iframe not found' };
  if (debug) errPayload.attempts = attempts;
  return new Response(JSON.stringify(errPayload), { status: 404, headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } });
}

// ===============================
// 3) Frame proxy: serve upstream HTML without XFO/CSP to allow embedding
// ===============================
async function handleFrame(request, url) {
  const target = url.searchParams.get('url') || url.searchParams.get('src');
  if (!target) return new Response('Missing ?url', { status: 400, headers: corsHeaders(request) });
  let referer = url.searchParams.get('referer') || '';
  let origin = '';
  try { const u = new URL(target); origin = u.origin + '/'; if (!referer) referer = origin; } catch {}

  const headers = new Headers();
  headers.set('User-Agent', UA);
  headers.set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
  headers.set('Accept-Language', 'en-US,en;q=0.9');
  if (referer) headers.set('Referer', referer);
  if (origin) headers.set('Origin', origin.replace(/\/$/, ''));

  const upstream = await fetch(target, { headers, redirect: 'follow' });
  let html = await upstream.text();

  // Remove meta refresh redirects
  html = html.replace(/<meta[^>]*http-equiv=["']?refresh["'][^>]*>/gi, '');

  // Ensure relative URLs resolve against original origin and inject anti-redirect guard
  const guard = '<script>(function(){try{Object.defineProperty(window,"top",{get:()=>window});Object.defineProperty(window,"parent",{get:()=>window});}catch(e){}try{window.open=function(){return null}}catch(e){};window.addEventListener("click",function(ev){try{var t=ev.target; if(t && t.target && (t.target==="_top"||t.target==="_parent")){t.removeAttribute("target");}}catch{}},true);}())</script>';
  if (origin) {
    if (!/<base\b[^>]*>/i.test(html)) {
      html = html.replace(/<head(\b[^>]*)?>/i, (m) => `${m}<base href="${origin}">${guard}`);
    } else {
      html = html.replace(/<head(\b[^>]*)?>/i, (m) => `${m}${guard}`);
    }
  } else {
    html = html.replace(/<head(\b[^>]*)?>/i, (m) => `${m}${guard}`);
  }

  const respHeaders = new Headers(corsHeaders(request));
  respHeaders.set('Content-Type', 'text/html; charset=utf-8');
  // Intentionally do NOT forward CSP / X-Frame-Options from upstream
  respHeaders.set('Referrer-Policy', 'no-referrer');
  respHeaders.set('Cache-Control', 'no-cache');

  return new Response(html, { status: 200, headers: respHeaders });
}

// ===============================
// Provider-specific helpers: Vidfast
// ===============================
function extractVidfastEn(html) {
  if (!html) return '';
  // Look for \"en\": "..." or 'en': '...'
  const re = /["']en["']\s*:\s*["']([^"']+)["']/i;
  const m = html.match(re);
  return m ? m[1] : '';
}

function extractVidfastHost(html) {
  if (!html) return '';
  const re = /["']host["']\s*:\s*["']([^"']+)["']/i;
  const m = html.match(re);
  return m ? (m[1].startsWith('http') ? m[1] : `https://${m[1]}`) : '';
}

async function resolveViaVidfastApi(host, en, referer) {
  const base = host.endsWith('/') ? host.slice(0, -1) : host;
  const endpoints = [
    `${base}/api/source/${encodeURIComponent(en)}`,
    `${base}/api/source?en=${encodeURIComponent(en)}`,
    `${base}/api/v1/source/${encodeURIComponent(en)}`,
    `${base}/api/e/${encodeURIComponent(en)}`,
    `${base}/ajax/getSources?en=${encodeURIComponent(en)}`,
  ];

  const commonHeaders = {
    'User-Agent': UA,
    'Accept': 'application/json, text/plain, */*',
    'Referer': referer,
    'Origin': base,
    'X-Requested-With': 'XMLHttpRequest',
  };

  for (const url of endpoints) {
    // Try GET first
    try {
      const r = await fetch(url, { headers: commonHeaders });
      if (r.ok) {
        const ct = (r.headers.get('content-type') || '').toLowerCase();
        const text = await r.text();
        let json = null;
        try { json = ct.includes('application/json') ? JSON.parse(text) : JSON.parse(text); } catch {}
        const m3u8 = extractM3u8FromObj(json) || extractM3U8(text);
        if (m3u8) return m3u8;
      }
    } catch {}

    // Then try POST (form-encoded)
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { ...commonHeaders, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: `en=${encodeURIComponent(en)}`,
      });
      if (r.ok) {
        const ct = (r.headers.get('content-type') || '').toLowerCase();
        const text = await r.text();
        let json = null;
        try { json = ct.includes('application/json') ? JSON.parse(text) : JSON.parse(text); } catch {}
        const m3u8 = extractM3u8FromObj(json) || extractM3U8(text);
        if (m3u8) return m3u8;
      }
    } catch {}
  }

  return '';
}

function extractM3u8FromObj(obj) {
  if (!obj) return '';
  try {
    // Common shapes: { sources: [{ file: '...m3u8' }, ...] }
    if (Array.isArray(obj)) {
      for (const v of obj) {
        const found = extractM3u8FromObj(v);
        if (found) return found;
      }
      return '';
    }
    if (typeof obj === 'object') {
      if (Array.isArray(obj.sources)) {
        for (const s of obj.sources) {
          if (!s) continue;
          const f = s.file || s.src || s.url;
          if (typeof f === 'string' && f.includes('.m3u8')) return f;
        }
      }
      for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (typeof v === 'string' && v.includes('.m3u8')) return v;
        const found = extractM3u8FromObj(v);
        if (found) return found;
      }
    }
  } catch {}
  return '';
}

// ===============================
// 2) Proxy playlists and segments with rewrite and Range support
// ===============================
async function handleProxy(request, url) {
  const targetUrl = url.searchParams.get('url');
  if (!targetUrl) {
    return new Response('Missing ?url', { status: 400, headers: corsHeaders(request) });
  }
  let referer = url.searchParams.get('referer') || '';
  if (!referer) {
    try { referer = new URL(targetUrl).origin + '/'; } catch {}
  }

  const reqHeaders = new Headers();
  reqHeaders.set('User-Agent', UA);
  reqHeaders.set('Accept', '*/*');
  reqHeaders.set('Referer', referer);
  const range = request.headers.get('Range');
  if (range) reqHeaders.set('Range', range);

  const upstream = await fetch(targetUrl, { method: 'GET', headers: reqHeaders, redirect: 'follow' });

  const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
  const isPlaylist = targetUrl.includes('.m3u8') || contentType.includes('application/vnd.apple.mpegurl') || contentType.includes('application/x-mpegurl');

  if (isPlaylist) {
    let text = await upstream.text();

    // Rewrite bare lines (URIs) to go back through this proxy
    text = text.replace(/^((?!#).+)$/gm, (line) => {
      line = line.trim();
      if (!line || line.startsWith('#')) return line;
      try {
        const abs = new URL(line, targetUrl).toString();
        return `/proxy?url=${encodeURIComponent(abs)}&referer=${encodeURIComponent(referer)}`;
      } catch { return line; }
    });

    // Rewrite ATTR URI="..." in KEY/MAP lines
    text = text.replace(/(URI=")(.*?)(")/g, (_m, p1, p2, p3) => {
      try {
        const abs = new URL(p2, targetUrl).toString();
        return `${p1}/proxy?url=${encodeURIComponent(abs)}&referer=${encodeURIComponent(referer)}${p3}`;
      } catch { return _m; }
    });

    return new Response(text, {
      status: 200,
      headers: {
        ...corsHeaders(request),
        'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  }

  // Binary segment/key passthrough
  const headers = new Headers(corsHeaders(request));
  const h = upstream.headers;
  const ct = h.get('content-type'); if (ct) headers.set('Content-Type', ct);
  const ar = h.get('accept-ranges'); if (ar) headers.set('Accept-Ranges', ar);
  const cr = h.get('content-range'); if (cr) headers.set('Content-Range', cr);
  const cl = h.get('content-length'); if (cl) headers.set('Content-Length', cl);
  headers.set('Cache-Control', h.get('cache-control') || 'public, max-age=60');

  return new Response(upstream.body, { status: upstream.status, headers });
}
