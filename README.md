# Zazzle

A modern, static-first streaming frontend with TMDB integration and an HLS proxy for providers that require specific headers. Built for static hosting on Vercel with a single serverless function for HLS proxying.

## Features

- TMDB-powered discovery and detail pages
- Watch page that resolves provider embeds (Vidfast, Videasy) and plays HLS via Video.js
- Optional HLS proxy (`/api/proxy`) to inject `Referer`/`Origin` headers and handle CORS
- Service Worker to inject headers when not proxying
- Works locally with Express for development; deploys to Vercel as a static site + serverless function

## Project Structure

- `server.js` – Local dev Express server (serves static files and mounts dev proxy)
- `dev/hls-proxy.js` – Express middleware for local HLS proxy
- `api/proxy.js` – Vercel serverless function for HLS proxy (production)
- `*.html`, `*.js`, `*.css` – Static frontend pages and assets
- `supabase/` – Supabase configuration and functions (not required for basic playback)

## Prerequisites

- Node.js 18+
- npm 9+

## Local Development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the dev server:

   ```bash
   npm run dev
   ```

3. Open http://localhost:4000 and navigate the site.

4. To test playback with the proxy (recommended), open the watch page with `?proxy=1`:

   - Vidfast movie: `/watch.html?type=movie&id=12345&proxy=1`
   - Vidfast TV: `/watch.html?type=tv&id=12345&season=1&episode=1&proxy=1`

   Without `?proxy=1`, the Service Worker will attempt to inject the required headers for HLS segment requests.

## Production on Vercel

This project deploys to Vercel as a static site with one serverless function.

- The serverless function is at `api/proxy.js` and exposed as `/api/proxy`.
- It rewrites `.m3u8` playlists to route segment, key, and map URIs back through itself.
- Range requests are forwarded and `Content-Range`/`Accept-Ranges` headers are exposed to the browser.

Configuration files:

- `vercel.json` – Sets the function runtime to Node 18 and headers for the Service Worker.
- `.vercelignore` – Excludes local dev server files from deployment (e.g., `server.js`, `dev/`).
- `.gitignore` – Standard Node ignores.

No environment variables are required for basic functionality. The TMDB public v3 key is used on the client.

## Notes

- The frontend fetches TMDB directly. You may optionally wire a Supabase Edge Function for TMDB if desired.
- The HLS proxy accepts:
  - `url` – The target playlist or segment URL (required)
  - `referer` – Referer header to inject upstream (optional)
  - `origin` – Origin header to inject upstream (optional)

Example:

```
/api/proxy?url=https%3A%2F%2Fexample.com%2Findex.m3u8&referer=https%3A%2F%2Fvidfast.pro&origin=https%3A%2F%2Fvidfast.pro
```

## Troubleshooting

- If video stalls or fails without `?proxy=1`, try enabling the proxy with `?proxy=1` to bypass header restrictions.
- Use the browser Network tab to confirm segment requests are routed through `/api/proxy` and that `Content-Range` is present for partial responses.
- For local dev, ensure Node 18+ and that no other process is using port 4000.
