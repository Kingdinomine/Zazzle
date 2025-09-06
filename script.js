// GSAP Animation Setup
gsap.registerPlugin(ScrollTrigger);

// TMDB configuration
const TMDB_API_KEY = '668153cb301606fdc86fef072e7daf06';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p/';
// Backend API base: same-origin (empty) so it works on Vercel and local dev
let API_BASE = '';
try {
    if (typeof location !== 'undefined') {
        const origin = location.origin || '';
        if (origin.includes('://localhost:4000') || origin.includes('://127.0.0.1:4000')) {
            API_BASE = '';
        }
    }
} catch (_) {}

// Carousel state
const CAROUSEL = {
    data: [],
    current: 0,
    animating: false,
    trackX: 0,
};

// Animation configuration
const ANIM = {
    ease: 'power1.inOut', // approximates CSS ease-in-out
    cardDur: 0.5,
    textDur: 0.5,
    bgDur: 0.2,
};

// Register Service Worker globally (home, listings, etc.)
(function registerSWBootstrap(){ 
   if (!('serviceWorker' in navigator)) return;
   try {
       const usp = new URLSearchParams(location.search);
       const disableSW = usp.has('nosw') || usp.get('sw') === 'off' || usp.get('sw') === '0';
       if (disableSW) {
           navigator.serviceWorker.getRegistrations().then(regs => Promise.all(regs.map(r => r.unregister()))).catch(()=>{});
           return;
       }
       const existingVer = localStorage.getItem('sw_v');
       const verSeed = (window.APP_VERSION || window.__BUILD_ID__ || existingVer || Date.now());
       if (!existingVer) { try { localStorage.setItem('sw_v', String(verSeed)); } catch {} }
       const swUrl = `/service-worker.js?v=${encodeURIComponent(verSeed)}`;
       const onLoad = async () => {
           try {
               const reg = await navigator.serviceWorker.register(swUrl, { scope: '/' });
               try { await reg.update(); } catch {}
               if (!navigator.serviceWorker.controller) {
                   await Promise.race([
                       new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(undefined), { once: true })),
                       new Promise((resolve) => setTimeout(resolve, 3000)),
                   ]);
               }
               try { navigator.serviceWorker.controller?.postMessage({ t: 'ping' }); } catch {}
           } catch (e) { console.warn('SW register (global) failed', e); }
       };
       if (document.readyState === 'complete') onLoad();
       else window.addEventListener('load', onLoad, { once: true });
   } catch (_) {}
})();

// Page Load Animations
document.addEventListener('DOMContentLoaded', function() {
    // Initialize search elements first
    initializeSearchElements();
    // Initialize premium search interface
    initializePremiumSearch();
    // Hero title solar flare sweep animation
    gsap.set('.hero-title', { opacity: 0, y: 100 });
    gsap.set('.hero-description', { opacity: 0, y: 50 });
    gsap.set('.watch-trailer-btn', { opacity: 0, scale: 0.8 });
    gsap.set('.schedule-tag', { opacity: 0, x: -50 });
    gsap.set('.carousel-card', { opacity: 0, y: 50 });
    gsap.set('.nav-arrow', { opacity: 0, scale: 0.8 });

    // Solar flare sweep effect on title
    const tl = gsap.timeline();
    
    tl.to('.hero-title', {
        duration: 1.5,
        opacity: 1,
        y: 0,
        ease: 'power3.out',
        onStart: function() {
                         // Add subtle glow effect
             const title = document.querySelector('.hero-title');
             title.style.textShadow = '0 0 20px rgba(255, 255, 255, 0.3)';
        }
    })
    .to('.schedule-tag', {
        duration: 1,
        opacity: 1,
        x: 0,
        ease: 'power2.out'
    }, '-=1')
    .to('.nav-arrow', {
        duration: 0.6,
        opacity: 1,
        scale: 1,
        stagger: 0.1,
        ease: 'back.out(1.7)'
    }, '-=0.2')
    .to('.carousel-card', {
        duration: 0.8,
        opacity: 1,
        y: 0,
        stagger: 0.2,
        ease: 'power2.out'
    }, '-=0.4');

    // Motion One entrances for description and CTA
    try {
        const M = window.Motion;
        if (M && M.animate) {
            M.animate('.hero-description', { opacity: [0, 1], transform: ['translateY(24px)', 'translateY(0px)'] }, { duration: 0.9, delay: 0.5, easing: 'cubic-bezier(.22,.61,.36,1)' });
            M.animate('.watch-trailer-btn', { opacity: [0, 1], transform: ['scale(0.92)', 'scale(1)'] }, { duration: 0.6, delay: 0.8, easing: 'cubic-bezier(.22,.61,.36,1)' });
        }
    } catch (_) {}
    
    // Populate hero from TMDB
    loadHeroFromTMDB();

    // Enforce full-viewport hero height across browsers
    enforceFullViewportHero();
    window.addEventListener('resize', enforceFullViewportHero);

    // Start brand typewriter effect
    typewriterBrand();

    // Initialize Lucide icons
    try { if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons(); } catch (_) {}
});

// Re-center on resize to keep the focused card centered with no scrollbar
window.addEventListener('resize', () => {
    if (!CAROUSEL.animating) centerCurrentCard({ animate: false });
});

// Add solar flare keyframe animation
const style = document.createElement('style');
style.textContent = `
    @keyframes solarFlare {
        0% {
            background-position: -200% 0;
        }
        100% {
            background-position: 200% 0;
        }
    }
    
    @keyframes eclipseReveal {
        0% {
            clip-path: circle(0% at 50% 50%);
        }
        100% {
            clip-path: circle(100% at 50% 50%);
        }
    }
    
    @keyframes coronaGlow {
        0%, 100% {
            box-shadow: 0 0 20px rgba(255, 215, 0, 0.3);
        }
        50% {
            box-shadow: 0 0 40px rgba(255, 215, 0, 0.8), 0 0 60px rgba(255, 107, 53, 0.4);
        }
    }
`;
document.head.appendChild(style);

// Ensure hero section always matches viewport height
function enforceFullViewportHero() {
    const hero = document.querySelector('.hero-banner');
    if (!hero) return;
    hero.style.minHeight = `${window.innerHeight}px`;
}

// Utilities
const isSmallScreen = () => window.matchMedia('(max-width: 768px)').matches;
const clampText = (txt, max) => (txt && txt.length > max ? txt.slice(0, max - 1) + '…' : (txt || ''));

// Typewriter effect for top-left brand logo
function typewriterBrand() {
    const el = document.getElementById('brand-logo');
    if (!el) return;
    const full = (el.dataset.text || el.textContent || 'Eclipse').trim();

    // Reuse spans if they exist, otherwise create them
    let textSpan = el.querySelector('.brand-text');
    let caretSpan = el.querySelector('.brand-caret');
    if (!textSpan || !caretSpan) {
        textSpan = document.createElement('span');
        textSpan.className = 'brand-text';
        caretSpan = document.createElement('span');
        caretSpan.className = 'brand-caret';
        caretSpan.setAttribute('aria-hidden', 'true');
        el.textContent = '';
        el.appendChild(textSpan);
        el.appendChild(caretSpan);
    } else {
        textSpan.textContent = '';
    }

    // Lock container width to full text width to avoid navbar shifts (without losing current progress)
    const lockWidth = () => {
        try {
            const current = textSpan.textContent;
            textSpan.textContent = full; // temporarily set full text for measurement
            const rect = el.getBoundingClientRect();
            const slot = el.closest('.brand-slot');
            const target = slot || el;
            target.style.width = Math.ceil(rect.width) + 'px';
            textSpan.textContent = current; // restore current progress
        } catch (_) {}
    };
    lockWidth();
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(lockWidth);
    }
    window.addEventListener('resize', lockWidth, { passive: true });

    let i = 0;
    let typing = true;
    const typeSpeed = 70;    // ms per char while typing
    const deleteSpeed = 50;  // ms per char while deleting
    const pauseEnd = 1000;   // pause after finishing typing
    const pauseStart = 400;  // pause before starting typing again
    const startDelay = 150;  // initial delay

    const loop = () => {
        if (typing) {
            if (i < full.length) {
                i += 1;
                textSpan.textContent = full.slice(0, i);
                setTimeout(loop, typeSpeed);
            } else {
                typing = false;
                setTimeout(loop, pauseEnd);
            }
        } else {
            if (i > 0) {
                i -= 1;
                textSpan.textContent = full.slice(0, i);
                setTimeout(loop, deleteSpeed);
            } else {
                typing = true;
                setTimeout(loop, pauseStart);
            }
        }
    };

    setTimeout(loop, startDelay);
}

function updateHeroFromItem(item) {
    const img = document.querySelector('.hero-bg-image');
    const titleEl = document.querySelector('.hero-title');
    const descEl = document.querySelector('.hero-description');
    const title = item.title || item.name || 'Featured';
    const overview = item.overview || '';
    const backdrop = item.backdrop_path;

    if (img && backdrop) {
        img.src = `${TMDB_IMG}w1280${backdrop}`;
        img.srcset = `${TMDB_IMG}w780${backdrop} 780w, ${TMDB_IMG}w1280${backdrop} 1280w, ${TMDB_IMG}original${backdrop} 1920w`;
        img.sizes = '100vw';
        img.alt = `${title} backdrop`;
    }
    if (titleEl) titleEl.textContent = title;
    if (descEl && !isSmallScreen()) {
        const max = window.innerWidth <= 480 ? 120 : 160; // slightly reduced
        descEl.textContent = clampText(overview, max);
    }
}

// Update only the texts (title/description)
function updateHeroTexts(item) {
    const titleEl = document.querySelector('.hero-title');
    const descEl = document.querySelector('.hero-description');
    const title = item.title || item.name || 'Featured';
    const overview = item.overview || '';
    if (titleEl) titleEl.textContent = title;
    if (descEl && !isSmallScreen()) {
        const max = window.innerWidth <= 480 ? 120 : 160;
        descEl.textContent = clampText(overview, max);
    }
}

// Crossfade background to new item's backdrop with subtle zoom (1.05 -> 1.0)
function crossfadeHeroBackground(item) {
    const bg = document.querySelector('.hero-background');
    const current = document.querySelector('.hero-bg-image');
    const backdrop = item && item.backdrop_path;
    if (!bg || !current || !backdrop) return;

    const next = current.cloneNode(false);
    next.src = `${TMDB_IMG}w1280${backdrop}`;
    next.srcset = `${TMDB_IMG}w780${backdrop} 780w, ${TMDB_IMG}w1280${backdrop} 1280w, ${TMDB_IMG}original${backdrop} 1920w`;
    next.sizes = '100vw';
    next.alt = `${item.title || item.name || 'Featured'} backdrop`;
    next.style.opacity = '0';
    next.style.transform = 'scale(1.05)';
    bg.appendChild(next);

    const animate = () => {
        gsap.to(next, { opacity: 1, duration: ANIM.bgDur, ease: ANIM.ease });
        gsap.to(next, { scale: 1, duration: ANIM.bgDur, ease: ANIM.ease });
        gsap.to(current, { opacity: 0, duration: ANIM.bgDur, ease: ANIM.ease, onComplete: () => {
            try { current.remove(); } catch (_) {}
        }});
    };

    if (next.complete) animate();
    else next.onload = animate;
    next.onerror = () => {
        // Fallback: if image fails, just keep current
        try { next.remove(); } catch (_) {}
    };
}

function renderCarousel() {
    const track = document.querySelector('.carousel-track');
    if (!track) return;
    track.innerHTML = '';
    CAROUSEL.data.forEach((item, idx) => {
        const card = document.createElement('article');
        card.className = 'carousel-card';
        card.setAttribute('role', 'listitem');
        card.dataset.index = String(idx);
        card.innerHTML = `
            <img src="${TMDB_IMG}w342${item.poster_path}" srcset="${TMDB_IMG}w342${item.poster_path} 342w, ${TMDB_IMG}w500${item.poster_path} 500w" sizes="(max-width: 768px) 70vw, 18vw" alt="${(item.title || item.name || 'Poster').replace(/"/g, '&quot;')}">
            <div class="card-gradient"></div>
            <div class="card-meta">
                <div class="card-sub">${item.media_type ? item.media_type.toUpperCase() : 'TITLE'}</div>
                <div class="card-title">${item.title || item.name || 'Untitled'}</div>
                <div class="card-rating">★ ${item.vote_average ? item.vote_average.toFixed(1) : '–'}</div>
            </div>`;
        card.addEventListener('click', () => {
            const mediaType = item.media_type === 'tv' ? 'tv' : 'movie';
            window.location.href = `detail.html?id=${item.id}&type=${mediaType}`;
        });
        track.appendChild(card);
    });
    applyCardClasses({ instant: true });
    // Center current card and clip off-canvas (no scrollbar)
    centerCurrentCard({ animate: false });
}

function applyCardClasses(opts = {}) {
    const instant = !!opts.instant || isSmallScreen();
    const cards = Array.from(document.querySelectorAll('.carousel-card'));
    const n = CAROUSEL.data.length;
    cards.forEach((card, i) => {
        // Disable transition for instant updates (mobile or first render)
        if (instant) card.style.transition = 'none';
        card.classList.remove('is-front', 'is-second', 'is-third', 'is-rest');
        const rel = (i - CAROUSEL.current + n) % n;
        if (rel === 0) card.classList.add('is-front');
        else if (rel === 1) card.classList.add('is-second');
        else if (rel === 2) card.classList.add('is-third');
        else card.classList.add('is-rest');
    });
    if (instant) requestAnimationFrame(() => cards.forEach(c => c.style.removeProperty('transition')));
}

// Compute track X offset so that the given index is horizontally centered in the carousel viewport
function computeTrackXForIndex(index) {
    const carousel = document.querySelector('.carousel');
    const track = document.querySelector('.carousel-track');
    if (!carousel || !track) return 0;
    const firstCard = track.querySelector('.carousel-card');
    if (!firstCard) return 0;
    const gap = parseFloat(getComputedStyle(track).gap) || 0;
    const containerWidth = carousel.getBoundingClientRect().width;
    const cardWidth = firstCard.offsetWidth; // ignore CSS transforms
    const cardCenterFromTrackLeft = index * (cardWidth + gap) + (cardWidth / 2);
    const targetX = (containerWidth / 2) - cardCenterFromTrackLeft;
    return targetX;
}

// Center the current card by moving the track. Optionally animate.
function centerCurrentCard({ animate = true } = {}) {
    const track = document.querySelector('.carousel-track');
    if (!track) return;
    const targetX = computeTrackXForIndex(CAROUSEL.current);
    CAROUSEL.trackX = targetX;
    if (animate) {
        gsap.to(track, { x: targetX, duration: ANIM.cardDur, ease: ANIM.ease });
    } else {
        gsap.set(track, { x: targetX });
    }
}

function goto(delta) {
    if (!CAROUSEL.data.length || CAROUSEL.animating) return;
    const n = CAROUSEL.data.length;
    const direction = Math.sign(delta);
    if (!direction) return;

    const nextIndex = (CAROUSEL.current + direction + n) % n;
    const newItem = CAROUSEL.data[nextIndex];

    // Elements
    const cards = Array.from(document.querySelectorAll('.carousel-card'));
    const currentCard = cards.find(c => Number(c.dataset.index) === CAROUSEL.current);
    const nextCard = cards.find(c => Number(c.dataset.index) === nextIndex);
    const titleEl = document.querySelector('.hero-title');
    const descEl = document.querySelector('.hero-description');
    const track = document.querySelector('.carousel-track');

    CAROUSEL.animating = true;

    const tl = gsap.timeline({ defaults: { ease: ANIM.ease }, onComplete: () => {
        // Commit index and classes
        CAROUSEL.current = nextIndex;
        applyCardClasses();
        // Cleanup inline transforms
        if (currentCard) gsap.set(currentCard, { clearProps: 'zIndex,transform,opacity,visibility' });
        if (nextCard) gsap.set(nextCard, { clearProps: 'zIndex,transform,opacity,visibility' });
        // Ensure track is precisely centered after animations
        centerCurrentCard({ animate: false });
        CAROUSEL.animating = false;
    }});

    // Start background crossfade immediately
    crossfadeHeroBackground(newItem);

    // Text out
    if (titleEl) tl.to(titleEl, { opacity: 0, y: -16, duration: ANIM.textDur }, 0);
    if (descEl && !isSmallScreen()) tl.to(descEl, { opacity: 0, y: -16, duration: ANIM.textDur }, 0);

    // Move track to center the next index (no scrollbar, left cards off-canvas)
    const targetX = computeTrackXForIndex(nextIndex);
    if (track) tl.to(track, { x: targetX, duration: ANIM.cardDur }, 0);
    tl.add(() => { CAROUSEL.trackX = targetX; }, 0);

    // Additional parallax emphasis on cards
    if (nextCard) tl.set(nextCard, { visibility: 'visible', zIndex: 4 }, 0);
    if (currentCard) tl.set(currentCard, { zIndex: 3 }, 0);
    if (currentCard) tl.to(currentCard, { x: direction > 0 ? -120 : 120, scale: 0.9, opacity: 0, duration: ANIM.cardDur }, 0);
    if (nextCard) tl.fromTo(nextCard, { x: direction > 0 ? 120 : -120, scale: 0.9, opacity: 0.5 }, { x: 0, scale: 1, opacity: 1, duration: ANIM.cardDur }, 0);

    // Swap texts mid-way then fade-in down
    tl.add(() => updateHeroTexts(newItem));
    if (titleEl) tl.to(titleEl, { opacity: 1, y: 0, duration: ANIM.textDur }, '>-0.25');
    if (descEl && !isSmallScreen()) tl.to(descEl, { opacity: 1, y: 0, duration: ANIM.textDur }, '<');
}

// Fetch and populate hero content and carousel from TMDB
async function loadHeroFromTMDB() {
    try {
        const loader = showLoadingEclipse();
        const resp = await fetch(`${TMDB_BASE}/trending/all/day?api_key=${TMDB_API_KEY}&language=en-US`);
        const data = await resp.json();
        const results = Array.isArray(data.results) ? data.results : [];
        const filtered = results.filter(r => r && r.poster_path && r.backdrop_path);
        CAROUSEL.data = filtered.slice(0, 12);

        if (!CAROUSEL.data.length) {
            loader.remove();
            return;
        }

        // Initial hero + carousel
        renderCarousel();
        updateHeroFromItem(CAROUSEL.data[0]);

        loader.remove();
    } catch (e) {
        // fail silently for now
        console.error('TMDB fetch failed', e);
    }
}

// Ensure hero image fills and remains fixed (no parallax shifting)
gsap.set('.hero-bg-image', { yPercent: 0, clearProps: 'transform' });

// Keep navbar fully transparent (no scroll-driven background)
// Intentionally no ScrollTrigger for navbar background.

// Remove any clip-path effects to keep full-bleed hero
const heroBannerEl = document.querySelector('.hero-banner');
if (heroBannerEl) heroBannerEl.style.clipPath = 'none';

// Button hover effects
document.querySelectorAll('.watch-trailer-btn, .get-hbo-btn').forEach(btn => {
    btn.addEventListener('mouseenter', function() {
        gsap.to(this, {
            duration: 0.3,
            scale: 1.05,
            ease: 'power2.out'
        });
    });
    
    btn.addEventListener('mouseleave', function() {
        gsap.to(this, {
            duration: 0.3,
            scale: 1,
            ease: 'power2.out'
        });
    });
});

// Navigation arrow ripple effect
document.querySelectorAll('.nav-arrow').forEach(arrow => {
    arrow.addEventListener('click', function(e) {
        // Create ripple effect
        const ripple = document.createElement('div');
        ripple.style.position = 'absolute';
        ripple.style.borderRadius = '50%';
        ripple.style.background = 'rgba(255, 255, 255, 0.4)';
        ripple.style.transform = 'scale(0)';
        ripple.style.animation = 'ripple 0.6s linear';
        ripple.style.left = '50%';
        ripple.style.top = '50%';
        ripple.style.width = '100px';
        ripple.style.height = '100px';
        ripple.style.marginLeft = '-50px';
        ripple.style.marginTop = '-50px';
        ripple.style.zIndex = '-1';
        this.appendChild(ripple);
        setTimeout(() => { try { ripple.remove(); } catch(_){} }, 600);
    });
});

// Add ripple animation
const rippleStyle = document.createElement('style');
rippleStyle.textContent = `
    @keyframes ripple {
        to {
            transform: scale(2);
            opacity: 0;
        }
    }
`;
document.head.appendChild(rippleStyle);

// Search UI switched to full-screen frosted overlay - wait for DOM to be ready
let searchContainer, searchIcon, searchInput, searchGhost, searchPanel, searchOverlay;

// Initialize search elements after DOM loads
function initializeSearchElements() {
    searchContainer = document.getElementById('search');
    searchIcon = document.querySelector('.search-icon');
    searchInput = searchContainer ? searchContainer.querySelector('.search-input') : null;
    searchGhost = document.getElementById('search-ghost');
    searchPanel = document.getElementById('search-results');
    // Align with premium overlay container from search-results.html
    searchOverlay = document.getElementById('search-results-container');
    
    console.log('Search elements initialized:', {
        searchContainer: !!searchContainer,
        searchIcon: !!searchIcon,
        searchInput: !!searchInput,
        searchOverlay: !!searchOverlay
    });
    
    // Initialize overlay elements too
    initializeOverlayElements();
    
    // Attach event listeners after elements are found
    attachSearchEventListeners();
    attachOverlayEventListeners();
}

// Overlay elements - initialize these in the function too
let overlayClose, overlaySub, overlayTabs, tabUnderline, previewPoster, previewTitle, previewSub, previewOverview, previewPlay, previewMore, overlayTrack, overlayPrev, overlayNext;

function initializeOverlayElements() {
    overlayClose = searchOverlay ? searchOverlay.querySelector('.overlay-close') : null;
    overlaySub = document.getElementById('overlay-sub');
    overlayTabs = searchOverlay ? Array.from(searchOverlay.querySelectorAll('.overlay-tab')) : [];
    tabUnderline = searchOverlay ? searchOverlay.querySelector('.tab-underline') : null;
    previewPoster = document.getElementById('preview-poster');
    previewTitle = document.getElementById('preview-title');
    previewSub = document.getElementById('preview-sub');
    previewOverview = document.getElementById('preview-overview');
    previewPlay = document.getElementById('preview-play');
    previewMore = document.getElementById('preview-more');
    overlayTrack = searchOverlay ? searchOverlay.querySelector('.overlay-track') : null;
    overlayPrev = searchOverlay ? searchOverlay.querySelector('.overlay-prev') : null;
    overlayNext = searchOverlay ? searchOverlay.querySelector('.overlay-next') : null;
}
// Removed duplicate declarations - now handled in initializeOverlayElements()

// Search overlay state
const SEARCH_OVERLAY = {
    movies: [],
    series: [],
    data: [],
    current: 0,
    animating: false,
    tab: 'all',
};

// Initialize premium search interface
function initializePremiumSearch() {
    // Do not override existing listeners from search-results.js.
    // Only add safe helpers that won't conflict.
    if (searchInput && !searchInput.dataset.premiumInit) {
        searchInput.dataset.premiumInit = '1';
        searchInput.addEventListener('focus', () => {
            const q = searchInput.value.trim();
            if (q.length > 2 && typeof window.showSearchResults === 'function') {
                window.showSearchResults();
            }
        });
    }
    if (searchIcon && !searchIcon.dataset.premiumInit) {
        searchIcon.dataset.premiumInit = '1';
        searchIcon.addEventListener('click', () => {
            if (typeof window.showSearchResults === 'function') window.showSearchResults();
            if (searchInput) searchInput.focus();
        });
    }
}

function handlePremiumSearchInput(e) {
    const query = e.target.value.trim();
    if (query.length > 2) {
        // Use the premium search interface
        if (window.triggerSearch) {
            window.triggerSearch(query);
        }
    } else if (query.length === 0) {
        // Hide search results if query is empty
        if (window.hideSearchResults) {
            window.hideSearchResults();
        }
    }
}

function handlePremiumSearchKeydown(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const query = e.target.value.trim();
        if (query && window.triggerSearch) {
            window.triggerSearch(query);
        }
    }
}

function handleSearchFocus() {
    // If there's already a query, show results
    const query = searchInput.value.trim();
    if (query.length > 2 && window.triggerSearch) {
        window.triggerSearch(query);
    }
}

function debounce(fn, wait) {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

function openSearch() {
    // Delegate to premium overlay controls
    if (typeof window.showSearchResults === 'function') {
        window.showSearchResults();
    } else {
        const c = document.getElementById('search-results-container');
        if (c) {
            c.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }
    if (searchContainer) searchContainer.classList.add('open');
    if (searchInput) searchInput.focus();
}

function closeSearch() {
    if (typeof window.hideSearchResults === 'function') {
        window.hideSearchResults();
    } else {
        const c = document.getElementById('search-results-container');
        if (c) {
            c.classList.remove('active');
            document.body.style.overflow = '';
        }
    }
    if (searchContainer) searchContainer.classList.remove('open');
}

const performSearchDebounced = debounce(internalOverlaySearch, 220);

async function recordOverlaySearchIfSignedIn(q) {
    try {
        const query = (q || '').trim();
        if (!query) return;
        if (window.SUPABASE && window.SUPABASE.auth && window.SUPABASE.searchHistory) {
            const { user } = await window.SUPABASE.auth.getUser();
            if (user) await window.SUPABASE.searchHistory.record({ q: query });
        }
    } catch (_) {}
}

async function internalOverlaySearch(q) {
    const query = (q || '').trim();
    if (!query) { clearOverlayResults(); return; }

    try {
        // Backend first
        const resp = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}&limit=20`);
        if (resp.ok) {
            const data = await resp.json();
            const movies = data.movies || [];
            const series = data.series || [];
            
            if (movies.length === 0 && series.length === 0) {
                // No backend results, try TMDB
                await searchWithTMDB(query);
            } else {
                SEARCH_OVERLAY.movies = movies;
                SEARCH_OVERLAY.series = series;
                SEARCH_OVERLAY.data = buildCombinedList(movies, series);
                // Removed current tracking - using grid layout instead
                updateOverlayContent(query, movies, series);
                
                // Store all search results in backend with type column
                if (query.trim() && window.SUPABASE?.searchResults) {
                    try {
                        const allResults = [...movies, ...series];
                        await window.SUPABASE.searchResults.store(query, allResults);
                    } catch (error) {
                        console.log('Could not store search results:', error);
                    }
                }
                
                // Record search in history if user is signed in
                if (query.trim()) {
                    await recordOverlaySearchIfSignedIn(query);
                }
            }
            return;
        }
        throw new Error('Backend unavailable');
    } catch (_) {
        // Fallback to TMDB
        await searchWithTMDB(query);
    }
}

async function searchWithTMDB(query) {
    try {
        const [movieResp, seriesResp] = await Promise.all([
            fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`),
            fetch(`https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`)
        ]);
        
        const [movieData, seriesData] = await Promise.all([movieResp.json(), seriesResp.json()]);
        const movies = movieData.results || [];
        const series = seriesData.results || [];
        
        SEARCH_OVERLAY.movies = movies;
        SEARCH_OVERLAY.series = series;
        SEARCH_OVERLAY.data = buildCombinedList(movies, series);
        // Removed current tracking - using grid layout instead
        updateOverlayContent(query, movies, series);
        
        // Store all search results in backend with type column
        if (query.trim() && window.SUPABASE?.searchResults) {
            try {
                const allResults = [...movies, ...series];
                await window.SUPABASE.searchResults.store(query, allResults);
            } catch (error) {
                console.log('Could not store search results:', error);
            }
        }
        
        // Record search in history if user is signed in
        if (query.trim()) {
            await recordOverlaySearchIfSignedIn(query);
        }
    } catch (e) {
        renderSearchError();
    }
}

function renderNoResults(query) {
    if (overlaySub) overlaySub.textContent = `No results for "${query}"`;
    if (overlayTrack) overlayTrack.innerHTML = '<div class="no-results">No movies or series found matching your search.</div>';
    if (previewPoster) previewPoster.removeAttribute('src');
    if (previewTitle) previewTitle.textContent = '';
    if (previewOverview) previewOverview.textContent = '';
}

function renderSearchError() {
    if (overlaySub) overlaySub.textContent = 'Unable to search right now.';
    if (overlayTrack) overlayTrack.innerHTML = '<div class="search-error">Search is temporarily unavailable. Please try again later.</div>';
    if (previewPoster) previewPoster.removeAttribute('src');
}

function clearOverlayResults() {
    if (overlaySub) overlaySub.textContent = '';
    if (overlayTrack) overlayTrack.innerHTML = '';
    if (previewPoster) previewPoster.removeAttribute('src');
    if (previewTitle) previewTitle.textContent = '';
    if (previewSub) previewSub.textContent = '';
    if (previewOverview) previewOverview.textContent = '';
    if (previewMore) previewMore.hidden = true;
    if (searchGhost) searchGhost.textContent = '';
}

// Build combined list for 'all' tab by interleaving movies and series
function buildCombinedList(movies = [], series = []) {
    const out = [];
    const m = movies.filter(x => x && x.poster_path && x.backdrop_path);
    const s = series.filter(x => x && x.poster_path && x.backdrop_path);
    const n = Math.max(m.length, s.length);
    for (let i = 0; i < n; i++) {
        if (m[i]) out.push({ ...m[i], media_type: 'movie' });
        if (s[i]) out.push({ ...s[i], media_type: 'tv' });
    }
    return out;
}

function bestSuggestion(query, items) {
    const q = query.toLowerCase();
    if (!q) return '';
    for (const it of items) {
        const t = (it.title || it.name || '').toLowerCase();
        if (t.startsWith(q) && t.length > q.length) return (it.title || it.name);
    }
    return '';
}

function setGhostText(query, items) {
    if (!searchGhost) return;
    const suggestion = bestSuggestion(query, items);
    if (!suggestion) { searchGhost.textContent = ''; return; }
    // Show full suggestion text; input overlays it
    searchGhost.textContent = suggestion;
}

function updatePreview(item) {
    if (!item) return;
    const title = item.title || item.name || 'Untitled';
    const year = (item.release_date || item.first_air_date || '').slice(0,4);
    const sub = [item.media_type ? item.media_type.toUpperCase() : null, year].filter(Boolean).join(' • ');
    if (previewTitle) previewTitle.textContent = title;
    if (previewSub) previewSub.textContent = sub;
    if (previewOverview) previewOverview.textContent = clampText(item.overview || '', 260);
    if (previewPoster) {
        const nextSrc = item.backdrop_path ? `${TMDB_IMG}w780${item.backdrop_path}` : (item.poster_path ? `${TMDB_IMG}w500${item.poster_path}` : '');
        if (nextSrc) {
            const img = new Image();
            img.onload = () => {
                previewPoster.style.opacity = '0';
                previewPoster.src = nextSrc;
                requestAnimationFrame(() => { previewPoster.style.opacity = '1'; });
            };
            img.src = nextSrc;
        }
    }
    if (previewMore) {
        const q = encodeURIComponent(title);
        previewMore.hidden = false;
        previewMore.href = item.media_type === 'tv' ? `series.html?q=${q}` : `movies.html?q=${q}`;
    }
}

// Deleted carousel positioning function - using grid layout instead

// Deleted carousel centering function - using grid layout instead

// Deleted carousel class application function - using grid layout instead

// Deleted carousel navigation function - using grid layout instead

function renderOverlayCarousel() {
    if (!overlayTrack) return;
    overlayTrack.innerHTML = '';
    SEARCH_OVERLAY.data.forEach((item, idx) => {
        const card = document.createElement('article');
        card.className = 'overlay-card';
        card.setAttribute('role', 'listitem');
        card.dataset.index = String(idx);
        const title = (item.title || item.name || 'Untitled').replace(/"/g, '&quot;');
        const rating = item.vote_average ? item.vote_average.toFixed(1) : '–';
        card.innerHTML = `
            <img class="overlay-thumb" src="${TMDB_IMG}w342${item.poster_path}" alt="${title}">
            <div class="overlay-card-gradient"></div>
            <div class="overlay-card-meta">
                <div class="overlay-card-sub">${item.media_type ? item.media_type.toUpperCase() : ''}</div>
                <div class="overlay-card-title">${title}</div>
                <div class="overlay-card-rating">★ ${rating}</div>
            </div>`;
        // Simple click handler for grid layout
        card.addEventListener('click', () => {
            console.log('Card clicked:', title);
            // Add any click functionality here
        });
        overlayTrack.appendChild(card);
    });
    // Removed carousel-specific calls - using grid layout instead
}

function positionTabUnderline() {
    if (!overlayTabs || !tabUnderline) return;
    const active = overlayTabs.find(t => t.classList.contains('is-active')) || overlayTabs[0];
    if (!active) return;
    const { offsetLeft: left, offsetWidth: width } = active;
    tabUnderline.style.width = width + 'px';
    tabUnderline.style.transform = `translateX(${left}px)`;
}

function setActiveTab(tab) {
    if (!overlayTabs) return;
    SEARCH_OVERLAY.tab = tab;
    overlayTabs.forEach(btn => {
        const is = btn.dataset.tab === tab;
        btn.classList.toggle('is-active', is);
        btn.setAttribute('aria-selected', String(is));
        if (is) btn.focus({ preventScroll: true });
    });
    requestAnimationFrame(positionTabUnderline);
    
    // Reset pagination when switching tabs
    SEARCH_PAGINATION.currentPage = 1;
    
    // Re-render with simple grid layout
    const { movies, series } = SEARCH_OVERLAY;
    const query = document.querySelector('#search-input')?.value || '';
    
    if (tab === 'movie') {
        updateOverlayContent(query, movies, []);
    } else if (tab === 'tv') {
        updateOverlayContent(query, [], series);
    } else {
        updateOverlayContent(query, movies, series);
    }
}

function renderSearchOverlay({ query, movies = [], series = [] }) {
    if (!searchOverlay) return;
    // Reset pagination for new search
    SEARCH_PAGINATION.currentPage = 1;
    
    // Store data for simple grid navigation
    SEARCH_OVERLAY.movies = (movies || []).filter(x => x && x.poster_path);
    SEARCH_OVERLAY.series = (series || []).filter(x => x && x.poster_path);
    
    // Update overlay content with simple grid and pagination
    updateOverlayContent(query, SEARCH_OVERLAY.movies, SEARCH_OVERLAY.series);
}

// Pagination state
const SEARCH_PAGINATION = {
    currentPage: 1,
    itemsPerPage: 16
};

function updateOverlayContent(query, movies, series) {
    if (!overlayTrack) return;
    
    // Combine all results
    const allResults = [...movies, ...series];
    const totalItems = allResults.length;
    const totalPages = Math.ceil(totalItems / SEARCH_PAGINATION.itemsPerPage);
    
    // Get current page items
    const startIdx = (SEARCH_PAGINATION.currentPage - 1) * SEARCH_PAGINATION.itemsPerPage;
    const endIdx = startIdx + SEARCH_PAGINATION.itemsPerPage;
    const currentPageItems = allResults.slice(startIdx, endIdx);
    
    let html = `
        <div class="search-results-grid">
            ${currentPageItems.map(item => {
                const type = item.title ? 'movie' : 'tv';
                return createCompactCard(item, type);
            }).join('')}
        </div>
        ${totalPages > 1 ? createSimplePagination(SEARCH_PAGINATION.currentPage, totalPages) : ''}
    `;
    
    overlayTrack.innerHTML = html;
    attachSimplePaginationListeners();
    attachWatchNowListeners();
}

function attachSimplePaginationListeners() {
    const pagination = document.querySelector('.simple-pagination');
    if (!pagination) return;
    
    // Handle prev/next buttons
    pagination.querySelectorAll('.pagination-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            const { movies, series } = SEARCH_OVERLAY;
            const currentTab = SEARCH_OVERLAY.tab || 'all';
            
            // Calculate total items for current tab
            let totalItems;
            if (currentTab === 'movie') {
                totalItems = movies.length;
            } else if (currentTab === 'tv') {
                totalItems = series.length;
            } else {
                totalItems = movies.length + series.length;
            }
            const totalPages = Math.ceil(totalItems / SEARCH_PAGINATION.itemsPerPage);
            
            if (action === 'prev' && SEARCH_PAGINATION.currentPage > 1) {
                SEARCH_PAGINATION.currentPage--;
                refreshCurrentTab();
            } else if (action === 'next' && SEARCH_PAGINATION.currentPage < totalPages) {
                SEARCH_PAGINATION.currentPage++;
                refreshCurrentTab();
            }
        });
    });
    
    // Handle page number buttons
    pagination.querySelectorAll('.page-number').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = parseInt(btn.dataset.page);
            if (page && page !== SEARCH_PAGINATION.currentPage) {
                SEARCH_PAGINATION.currentPage = page;
                refreshCurrentTab();
            }
        });
    });
}

function refreshCurrentTab() {
    const { movies, series } = SEARCH_OVERLAY;
    const query = document.querySelector('#search-input')?.value || '';
    const currentTab = SEARCH_OVERLAY.tab || 'all';
    
    if (currentTab === 'movie') {
        updateOverlayContent(query, movies, []);
    } else if (currentTab === 'tv') {
        updateOverlayContent(query, [], series);
    } else {
        updateOverlayContent(query, movies, series);
    }
}

function attachWatchNowListeners() {
    document.querySelectorAll('.compact-watch-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const card = btn.closest('.compact-card');
            const id = card.dataset.id;
            const type = card.dataset.type;
            // Navigate to results page for now
            window.location.href = `results.html?id=${id}&type=${type}`;
        });
    });
}

function attachFeaturedListeners() {
    document.querySelectorAll('.featured-watch-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const card = btn.closest('.featured-card');
            const id = card.dataset.id;
            const type = card.dataset.type;
            window.location.href = `results.html?id=${id}&type=${type}`;
        });
    });
    
    document.querySelectorAll('.featured-trailer-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const card = btn.closest('.featured-card');
            const id = card.dataset.id;
            const type = card.dataset.type;
            // Try to open trailer if function exists
            try {
                if (typeof openTrailerForItem === 'function') {
                    const item = { id: parseInt(id), media_type: type };
                    openTrailerForItem(item);
                }
            } catch (_) {
                // Fallback to watch page
                window.location.href = `results.html?id=${id}&type=${type}`;
            }
        });
    });
}

function createSimplePagination(currentPage, totalPages) {
    if (totalPages <= 1) return '';
    
    let paginationHTML = `<div class="simple-pagination">`;
    
    // Previous button
    paginationHTML += `
        <button class="pagination-btn" data-action="prev" ${currentPage === 1 ? 'disabled' : ''}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15,18 9,12 15,6"></polyline>
            </svg>
            Previous
        </button>
    `;
    
    // Page numbers
    paginationHTML += `<div class="page-numbers">`;
    for (let i = 1; i <= totalPages; i++) {
        const isActive = i === currentPage;
        paginationHTML += `
            <button class="page-number ${isActive ? 'active' : ''}" data-page="${i}">
                ${i}
            </button>
        `;
    }
    paginationHTML += `</div>`;
    
    // Next button
    paginationHTML += `
        <button class="pagination-btn" data-action="next" ${currentPage === totalPages ? 'disabled' : ''}>
            Next
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9,6 15,12 9,18"></polyline>
            </svg>
        </button>
    `;
    
    paginationHTML += `</div>`;
    return paginationHTML;
}

function createCompactCard(item, type) {
    const title = item.title || item.name || 'Untitled';
    const year = (item.release_date || item.first_air_date || '').slice(0, 4);
    const poster = item.poster_path ? `${TMDB_IMG}w342${item.poster_path}` : '';
    
    return `
        <div class="compact-card" data-id="${item.id}" data-type="${type}">
            <div class="compact-thumb">
                ${poster ? `<img src="${poster}" alt="${title}" loading="lazy">` : '<div class="placeholder"></div>'}
            </div>
            <div class="compact-info">
                <div class="compact-title">${title}</div>
                <div class="compact-year">${year}</div>
            </div>
            <button class="compact-watch-btn">Watch Now</button>
        </div>
    `;
}

function createFeaturedCard(item, type) {
    const title = item.title || item.name || 'Untitled';
    const year = (item.release_date || item.first_air_date || '').slice(0, 4);
    const backdrop = item.backdrop_path ? `${TMDB_IMG}w780${item.backdrop_path}` : (item.poster_path ? `${TMDB_IMG}w500${item.poster_path}` : '');
    const overview = item.overview || '';
    
    return `
        <div class="featured-card" data-id="${item.id}" data-type="${type}">
            <div class="compact-thumb">
                ${backdrop ? `<img src="${backdrop}" alt="${title}" loading="lazy">` : '<div class="placeholder"></div>'}
            </div>
            <div class="featured-info">
                <div class="featured-title">${title}</div>
                <div class="featured-year">${year}</div>
                <div class="featured-description">${overview}</div>
                <div class="featured-actions">
                    <button class="featured-watch-btn">Watch Now</button>
                    <button class="featured-trailer-btn">Play Trailer</button>
                </div>
            </div>
        </div>
    `;
}

function openFullPageResults(query, type) {
    // Create full page results URL and navigate
    const url = new URL(window.location.href);
    url.searchParams.set('q', query);
    url.searchParams.set('type', type);
    url.pathname = '/search-results.html';
    
    // For now, just close overlay and show in current results format
    closeSearch();
    
    // Navigate to results page with query
    window.location.href = `results.html?q=${encodeURIComponent(query)}&filter=${type === 'movie' ? 'movies' : 'series'}`;
}

function attachSearchEventListeners() {
    if (searchIcon) {
        console.log('Attaching click listener to search icon');
        searchIcon.addEventListener('click', (e) => { 
            e.preventDefault();
            e.stopPropagation(); 
            openSearch(); 
        });
        
        // Also try adding to the container
        if (searchContainer) {
            searchContainer.addEventListener('click', (e) => {
                if (e.target.closest('.search-icon')) {
                    e.preventDefault();
                    e.stopPropagation();
                    openSearch();
                }
            });
        }
    } else {
        console.error('Search icon not found for event listener');
    }
    // Input listeners are handled in search-results.js to prevent conflicts
}

function attachOverlayEventListeners() {
    if (overlayClose) {
        console.log('Attaching close button listener');
        overlayClose.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Close button clicked');
            closeSearch();
        });
    }
    
    if (searchOverlay) {
        // Close when clicking backdrop
        searchOverlay.addEventListener('click', (e) => {
            const panel = e.currentTarget.querySelector('.overlay-panel');
            if (panel && !panel.contains(e.target)) closeSearch();
        });
    }
    
    // Overlay nav buttons
    // Removed carousel navigation buttons - using grid layout instead
    
    // Overlay tabs
    if (overlayTabs && overlayTabs.length) {
        overlayTabs.forEach(btn => {
            btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
            btn.addEventListener('keydown', (e) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
                e.preventDefault();
                const idx = overlayTabs.indexOf(btn);
                if (e.key === 'ArrowRight') setActiveTab(overlayTabs[(idx + 1) % overlayTabs.length].dataset.tab);
                if (e.key === 'ArrowLeft') setActiveTab(overlayTabs[(idx - 1 + overlayTabs.length) % overlayTabs.length].dataset.tab);
                if (e.key === 'Home') setActiveTab(overlayTabs[0].dataset.tab);
                if (e.key === 'End') setActiveTab(overlayTabs[overlayTabs.length - 1].dataset.tab);
            });
        });
    }
    
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSearch(); });
}
// Removed duplicate event listeners - now handled in attachSearchEventListeners and attachOverlayEventListeners

// Reposition underline on resize
window.addEventListener('resize', () => { positionTabUnderline(); if (!CAROUSEL.animating) centerCurrentCard({ animate: false }); });

// Trailer overlay behavior
const trailerOverlay = document.getElementById('trailer-overlay');
const trailerFrame = document.getElementById('trailer-frame');
const trailerClose = trailerOverlay ? trailerOverlay.querySelector('.trailer-close') : null;

function openTrailer(key) {
    if (!trailerOverlay || !trailerFrame || !key) return;
    trailerOverlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    const url = `https://www.youtube.com/embed/${key}?autoplay=1&mute=1&rel=0&modestbranding=1`;
    trailerFrame.src = url;
}
function closeTrailer() {
    if (!trailerOverlay || !trailerFrame) return;
    trailerOverlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    trailerFrame.src = '';
}
async function fetchTrailerKey(item) {
    if (!item || !item.id) return '';
    const type = item.media_type === 'tv' ? 'tv' : 'movie';
    try {
        const url = `${TMDB_BASE}/${type}/${item.id}/videos?api_key=${TMDB_API_KEY}&language=en-US`;
        const res = await fetch(url);
        const data = await res.json();
        const vids = Array.isArray(data.results) ? data.results : [];
        const yt = vids.find(v => v.site === 'YouTube' && v.type === 'Trailer') || vids.find(v => v.site === 'YouTube');
        return yt ? yt.key : '';
    } catch (_) { return ''; }
}
async function openTrailerForItem(item) {
    const key = await fetchTrailerKey(item);
    if (key) openTrailer(key);
}
if (trailerClose) trailerClose.addEventListener('click', closeTrailer);
if (trailerOverlay) trailerOverlay.addEventListener('click', (e) => {
    const dialog = trailerOverlay.querySelector('.trailer-dialog');
    if (dialog && !dialog.contains(e.target)) closeTrailer();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTrailer(); });

// Hook up watch trailer button in hero to current hero item
const heroWatchBtn = document.querySelector('.watch-trailer-btn');
if (heroWatchBtn) heroWatchBtn.addEventListener('click', () => {
    const item = CAROUSEL.data[CAROUSEL.current];
    if (item) openTrailerForItem(item);
});

// Preview play button
if (previewPlay) previewPlay.addEventListener('click', () => {
    const item = SEARCH_OVERLAY.data[0]; // Use first item for grid layout
    if (item) openTrailerForItem(item);
});

// Loading eclipse corona animation
function showLoadingEclipse() {
    const loader = document.createElement('div');
    loader.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 60px;
        height: 60px;
        border: 3px solid transparent;
        border-top: 3px solid #fff;
        border-radius: 50%;
        animation: eclipseRotate 2s linear infinite;
        z-index: 10000;
        box-shadow: 0 0 20px rgba(255, 255, 255, 0.3);
    `;
    
    document.body.appendChild(loader);
    
    const rotateStyle = document.createElement('style');
    rotateStyle.textContent = `
        @keyframes eclipseRotate {
            0% { transform: translate(-50%, -50%) rotate(0deg); }
            100% { transform: translate(-50%, -50%) rotate(360deg); }
        }
    `;
    document.head.appendChild(rotateStyle);
    
    return loader;
}

// Scroll progress eclipse line
const progressLine = document.createElement('div');
progressLine.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    height: 3px;
    background: linear-gradient(90deg, #fff, rgba(255, 255, 255, 0.8));
    box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
    z-index: 10001;
    transform-origin: left;
    transform: scaleX(0);
`;
document.body.appendChild(progressLine);

// Update progress on scroll
window.addEventListener('scroll', () => {
    const scrollPercent = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
    progressLine.style.transform = `scaleX(${scrollPercent / 100})`;
});

// Content navigation functionality (guard for non-index pages)
const leftArrow = document.querySelector('.nav-arrow-left');
if (leftArrow) leftArrow.addEventListener('click', () => goto(-1));
const rightArrow = document.querySelector('.nav-arrow-right');
if (rightArrow) rightArrow.addEventListener('click', () => goto(1));

// Cinematic quote for empty states
function showCinematicQuote() {
    const quotes = [
        "In the darkness, we find the light...",
        "Every ending is a new beginning...",
        "The eclipse reveals what was always there...",
        "Between shadow and light, stories unfold..."
    ];
    
    const quote = quotes[Math.floor(Math.random() * quotes.length)];
    const quoteElement = document.createElement('div');
    quoteElement.textContent = quote;
    quoteElement.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: rgba(255, 255, 255, 0.8);
        font-size: 1.5rem;
        font-weight: 300;
        text-align: center;
        opacity: 0;
        transition: opacity 2s ease;
        z-index: 1000;
        font-style: italic;
    `;
    
    document.body.appendChild(quoteElement);
    
    setTimeout(() => {
        quoteElement.style.opacity = '1';
    }, 100);
    
    return quoteElement;
}

// Adaptive color scheme based on hero image
function adaptColorScheme() {
    const heroImage = document.querySelector('.hero-bg-image');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    heroImage.onload = function() {
        canvas.width = this.width;
        canvas.height = this.height;
        ctx.drawImage(this, 0, 0);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        let r = 0, g = 0, b = 0;
        const step = 4;
        
        for (let i = 0; i < data.length; i += step * 100) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
        }
        
        const pixels = data.length / (step * 100);
        r = Math.floor(r / pixels);
        g = Math.floor(g / pixels);
        b = Math.floor(b / pixels);
        
        // Apply dominant color as accent
        const accentColor = `rgb(${r}, ${g}, ${b})`;
        document.documentElement.style.setProperty('--accent-color', accentColor);
    };
}

// Call adaptive color scheme
adaptColorScheme();

// Personalized greeting
function showPersonalizedGreeting() {
    const greetings = [
        "Welcome back to HBO Max",
        "Your streaming experience continues",
        "Discover your next obsession",
        "Premium entertainment awaits"
    ];
    
    const greeting = greetings[Math.floor(Math.random() * greetings.length)];
    console.log(`${greeting}`);
    
    // Could be displayed in a toast notification
    const toast = document.createElement('div');
    toast.textContent = `${greeting}`;
    toast.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: rgba(0, 0, 0, 0.9);
        color: #fff;
        padding: 1rem 1.5rem;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        backdrop-filter: blur(20px);
        z-index: 10000;
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.5s ease;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    }, 1000);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

// Show greeting after page load
setTimeout(showPersonalizedGreeting, 2000);

// Mobile drawer interactions
const hamburger = document.querySelector('.hamburger');
const mobileDrawer = document.getElementById('mobile-drawer');
const drawerOverlay = document.querySelector('.drawer-overlay');

function toggleDrawer(open) {
    const isOpen = open !== undefined ? open : mobileDrawer.getAttribute('aria-hidden') === 'true';
    mobileDrawer.setAttribute('aria-hidden', String(!isOpen));
    if (drawerOverlay) {
        if (isOpen) {
            drawerOverlay.hidden = false;
            requestAnimationFrame(() => drawerOverlay.style.opacity = '1');
        } else {
            drawerOverlay.style.opacity = '0';
            setTimeout(() => { drawerOverlay.hidden = true; }, 300);
        }
    }
    if (hamburger) {
        hamburger.classList.toggle('is-open', isOpen);
        hamburger.setAttribute('aria-expanded', String(isOpen));
    }
    document.body.style.overflow = isOpen ? 'hidden' : '';
}

if (hamburger && mobileDrawer) {
    hamburger.addEventListener('click', () => toggleDrawer());
}

if (drawerOverlay) {
    drawerOverlay.addEventListener('click', () => toggleDrawer(false));
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') toggleDrawer(false);
});
