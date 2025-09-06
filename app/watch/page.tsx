"use client";

import Script from "next/script";
 export default function WatchPage() {
  return (
    <div className="min-h-screen relative bg-neutral-900 text-white" style={{ fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' }}>
      {/* Tailwind via CDN to preserve existing utility classes */}
      <Script src="https://cdn.tailwindcss.com" strategy="beforeInteractive" />

      {/* Background */}
      <div id="bg" className="absolute inset-0 -z-10">
        <img id="bg-img" className="w-full h-full object-cover opacity-70" alt="Background" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/60"></div>
        <div className="pointer-events-none absolute inset-0" style={{ boxShadow: 'inset 0 0 180px rgba(0,0,0,0.6)' }}></div>
      </div>

      <main id="page" className="opacity-0 transition-opacity duration-500 ease-out">
        <div className="fixed inset-0 -z-0 bg-white/10 backdrop-blur-xl"></div>

        <div className="relative z-10 max-w-[1400px] mx-auto px-4 py-8 lg:py-10">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            {/* Player column */}
            <section className="lg:col-span-2">
              <div className="rounded-2xl shadow-2xl ring-1 ring-white/10 overflow-hidden">
                <div className="relative group">
                  <video id="vjs-player" className="w-full h-auto bg-black rounded-lg" controls autoPlay muted playsInline preload="auto"></video>
                  <div id="buffering" className="absolute inset-0 hidden items-center justify-center bg-black/30">
                    <div className="w-14 h-14 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
                  </div>
                </div>
              </div>

              {/* Provider switch */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-sm/6 text-white/70">Source:</span>
                <div id="provider-switch" className="flex gap-2">
                  <button data-provider="vidfast" className="px-3 py-1.5 rounded-full ring-1 ring-white/10 hover:ring-white/30 transition active:scale-[.98]">VidFast</button>
                  <button data-provider="videasy" className="px-3 py-1.5 rounded-full ring-1 ring-white/10 hover:ring-white/30 transition active:scale-[.98]">Videasy</button>
                </div>
                <div id="source-meta" className="text-sm/6 text-white/60 ml-auto hidden"></div>
              </div>

              {/* Movie: recommendations row */}
              <div id="recs" className="mt-6 hidden">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold">Recommended</h3>
                  <a href="/all-results" className="text-sm text-sky-300 hover:text-sky-200">See all</a>
                </div>
                <div id="recs-row" className="grid grid-flow-col auto-cols-[45%] sm:auto-cols-[30%] md:auto-cols-[22%] lg:auto-cols-[18%] gap-3 overflow-x-auto snap-x"></div>
              </div>
            </section>

            {/* Info panel */}
            <aside className="lg:col-span-1 space-y-4">
              <div className="p-5 rounded-2xl ring-1 ring-white/10">
                <h1 id="title" className="text-2xl font-extrabold tracking-tight mb-2">Loading…</h1>
                <div id="badges" className="flex flex-wrap gap-2 text-xs text-white/80"></div>
                <p id="overview" className="mt-3 text-white/80 line-clamp-4"></p>
                <div className="mt-4 flex gap-2">
                  <button id="btn-watchlist" className="px-3 py-2 rounded-xl ring-1 ring-white/10 hover:ring-white/30 transition">Watchlist</button>
                  <button id="btn-like" className="px-3 py-2 rounded-xl ring-1 ring-white/10 hover:ring-white/30 transition">Like</button>
                  <button id="btn-share" className="px-3 py-2 rounded-xl ring-1 ring-white/10 hover:ring-white/30 transition">Share</button>
                </div>
                <div id="tv-controls" className="mt-4 hidden">
                  <div className="flex items-center gap-2">
                    <select id="season-select" className="px-3 py-2 rounded-full ring-1 ring-white/10"></select>
                    <span id="episode-count" className="text-sm text-white/70"></span>
                  </div>
                </div>
              </div>

              {/* Episodes for TV */}
              <div id="episodes" className="p-5 rounded-2xl ring-1 ring-white/10 max-h-[520px] overflow-y-auto hidden">
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2" id="episodes-grid"></div>
              </div>
            </aside>
          </div>
        </div>

        {/* Error card */}
        <div id="error" className="hidden fixed inset-x-4 top-20 z-50 p-4 rounded-2xl ring-1 ring-white/10 max-w-[680px] mx-auto">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-red-500/20 flex items-center justify-center">⚠️</div>
            <div className="flex-1">
              <div className="font-semibold mb-1">Unable to play this title right now</div>
              <div id="error-text" className="text-white/80 text-sm">Please try another provider, retry, or watch the trailer instead.</div>
              <div className="mt-3 flex gap-2">
                <button id="btn-retry" className="px-3 py-2 rounded-xl ring-1 ring-white/10 hover:ring-white/30">Retry</button>
                <a id="btn-trailer" target="_blank" className="px-3 py-2 rounded-xl ring-1 ring-white/10 hover:ring-white/30">Trailer</a>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Libraries (global) */}
      <Script src="https://unpkg.com/lucide@latest" strategy="afterInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/motion@10/dist/motion.min.js" strategy="afterInteractive" />
      {/* Supabase SDK + client */}
      <Script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js" strategy="afterInteractive" />
      <Script src="/supabaseClient.js?v=20250904T141709" strategy="afterInteractive" />
      {/* Plyr JS */}
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/plyr/3.8.3/plyr.min.js" integrity="sha512-2y9aTgKc9KqULkFfBXI7bMZ4Rbt2d4JgkUrDeMf8q7Yb7pW1y5iAIpJjE0+F7R7vkvjr0rwvRr8m3YHZQ0a0Vg==" crossOrigin="anonymous" referrerPolicy="no-referrer" strategy="afterInteractive" />
      {/* Watch logic (ported) */}
      <Script src="/watch.js?v=20250905T014044" strategy="afterInteractive" />
    </div>
  );
 }
