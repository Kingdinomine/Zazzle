/* Service Worker: service-worker
   - Injects provider-required headers for HLS playlists and segments
   - Forwards Range requests
*/

const STATE = {
  // key: host (e.g., 'vidfast.pro' or 'player.videasy.net'), value: { headers: Record<string,string>, expires: ms }
  hosts: new Map(),
};

// Abort long-running fetches to avoid indefinite hangs during playback
const FETCH_TIMEOUT_MS = 12000; // 12s default

function setHeadersFor(urlStr, headers, ttlSec = 14400) {
  try {
    const u = new URL(urlStr);
    const host = u.host;
    const expires = Date.now() + Math.max(30, ttlSec) * 1000;
    STATE.hosts.set(host, { headers, expires });
  } catch {}
}

function getHeadersFor(urlStr) {
  try {
    const u = new URL(urlStr);
    const entry = STATE.hosts.get(u.host);
    if (!entry) return null;
    if (entry.expires && entry.expires < Date.now()) { STATE.hosts.delete(u.host); return null; }
    return entry.headers || null;
  } catch { return null; }
}

self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener('message', (e) => {
  const data = e.data || {};
  if (data.t === 'ping') return;
  if (data.t === 'set-headers') {
    setHeadersFor(String(data.forUrl || ''), data.headers || {}, Number(data.ttl || 14400));
  }
});

function shouldIntercept(url) {
  try {
    const u = new URL(url);
    const p = u.pathname.toLowerCase();
    if (p.endsWith('.m3u8') || p.includes('.m3u8?')) return true;
    if (p.endsWith('.ts') || p.endsWith('.m4s') || p.endsWith('.mp4')) return true;
    return false;
  } catch { return false; }
}

function cloneWithHeaders(req, extra) {
  const headers = new Headers(req.headers);
  for (const [k, v] of Object.entries(extra || {})) {
    try { headers.set(k, v); } catch {}
  }
  const init = {
    method: req.method,
    headers,
    // Do not attempt to copy body for GET/HEAD
    body: (req.method === 'GET' || req.method === 'HEAD') ? undefined : req.body,
    mode: req.mode,
    cache: req.cache,
    redirect: req.redirect,
    referrerPolicy: req.referrerPolicy,
    // Note: cannot set cross-origin referrer string; browser restricts
    // referrer: 'client',
    integrity: req.integrity,
    credentials: req.credentials,
    keepalive: req.keepalive,
  };
  return new Request(req.url, init);
}

function fetchWithTimeout(request, timeoutMs = FETCH_TIMEOUT_MS) {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), Math.max(3000, timeoutMs));
  return fetch(request, { signal: ac.signal }).finally(() => clearTimeout(id));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = req.url;
  if (!shouldIntercept(url)) return; // let browser handle others

  const headersNeeded = getHeadersFor(url);
  if (!headersNeeded) return; // nothing to do

  event.respondWith((async () => {
    const newReq = cloneWithHeaders(req, headersNeeded);
    try {
      const res = await fetchWithTimeout(newReq, FETCH_TIMEOUT_MS);
      return res;
    } catch (err) {
      // If our abort triggered, surface a 504 to allow the player to retry quickly
      if (err && (err.name === 'AbortError' || String(err).includes('aborted'))) {
        return new Response('Gateway Timeout', { status: 504 });
      }
      // For non-timeout errors, try the original request without injected headers
      try { return await fetch(req); } catch (e) { return new Response('Network error', { status: 502 }); }
    }
  })());
});
