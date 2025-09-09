// TMDB Configuration
const SR_TMDB_API_KEY = '668153cb301606fdc86fef072e7daf06';
const SR_TMDB_BASE = 'https://api.themoviedb.org/3';
const SR_TMDB_IMG = 'https://image.tmdb.org/t/p/';

// Search state
const SEARCH_STATE = {
    query: '',
    movies: [],
    series: [],
    currentPage: 1,
    itemsPerPage: 16,
    currentType: 'all' // 'all', 'movie', 'tv'
};

// DOM Elements (namespaced to avoid global collisions)
let srSearchContainer, srSearchInput, srSearchResultsContainer, srMoviesGrid, srSeriesGrid;
let srSearchTitle, srCloseSearchBtn, srSeeAllMoviesBtn, srSeeAllSeriesBtn, srSearchResultsInput;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeElements();
    initializeEventListeners();
    initializeLucideIcons();
    
    // Check if opened with search query
    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get('q');
    const type = urlParams.get('type');
    
    if (query) {
        SEARCH_STATE.query = query;
        SEARCH_STATE.currentType = type || 'all';
        performSearch(query);
        showSearchResults();
    }
});

function initializeElements() {
    srSearchContainer = document.getElementById('search');
    srSearchInput = srSearchContainer?.querySelector('.search-input');
    srSearchResultsInput = document.getElementById('search-results-input');
    srSearchResultsContainer = document.getElementById('search-results-container');
    srMoviesGrid = document.getElementById('movies-grid');
    srSeriesGrid = document.getElementById('series-grid');
    srSearchTitle = document.getElementById('search-title');
    srCloseSearchBtn = document.getElementById('close-search');
    srSeeAllMoviesBtn = document.getElementById('see-all-movies');
    srSeeAllSeriesBtn = document.getElementById('see-all-series');
}

function initializeEventListeners() {
    // Search input (navbar)
    if (srSearchInput) {
        srSearchInput.addEventListener('input', srDebounce(handleSearchInput, 300));
        srSearchInput.addEventListener('keydown', handleSearchKeydown);
    }
    
    // Search input (search results page)
    if (srSearchResultsInput) {
        srSearchResultsInput.addEventListener('input', srDebounce(handleSearchResultsInput, 300));
        srSearchResultsInput.addEventListener('keydown', handleSearchResultsKeydown);
    }
    
    // Close search
    if (srCloseSearchBtn) {
        srCloseSearchBtn.addEventListener('click', hideSearchResults);
    }
    
    // See all buttons
    if (srSeeAllMoviesBtn) {
        srSeeAllMoviesBtn.addEventListener('click', () => showAllResults('movie'));
    }
    
    if (srSeeAllSeriesBtn) {
        srSeeAllSeriesBtn.addEventListener('click', () => showAllResults('tv'));
    }
    
    // Close on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && srSearchResultsContainer?.classList.contains('active')) {
            hideSearchResults();
        }
    });
    
    // Close on backdrop click
    if (srSearchResultsContainer) {
        srSearchResultsContainer.addEventListener('click', (e) => {
            if (e.target === srSearchResultsContainer) {
                hideSearchResults();
            }
        });
    }
}

function initializeLucideIcons() {
    try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    } catch (e) {
        console.log('Lucide icons not available');
    }
}

function srDebounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function handleSearchInput(e) {
    const query = e.target.value.trim();
    // Sync with search results input
    if (srSearchResultsInput) {
        srSearchResultsInput.value = query;
    }
    if (query.length > 2) {
        SEARCH_STATE.query = query;
        performSearch(query);
        showSearchResults();
    } else if (query.length === 0) {
        hideSearchResults();
    }
}

function handleSearchResultsInput(e) {
    const query = e.target.value.trim();
    // Sync with navbar input
    if (srSearchInput) {
        srSearchInput.value = query;
    }
    if (query.length > 2) {
        SEARCH_STATE.query = query;
        performSearch(query);
    }
}

function handleSearchResultsKeydown(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const query = e.target.value.trim();
        if (query) {
            SEARCH_STATE.query = query;
            performSearch(query);
        }
    }
}

function handleSearchKeydown(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const query = e.target.value.trim();
        if (query) {
            SEARCH_STATE.query = query;
            performSearch(query);
            showSearchResults();
        }
    }
}

async function performSearch(query) {
    if (!query) return;
    
    try {
        showLoadingState();
        
        // Search both movies and TV shows
        const [movieResponse, tvResponse] = await Promise.all([
            fetch(`${SR_TMDB_BASE}/search/movie?api_key=${SR_TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=en-US&page=1`),
            fetch(`${SR_TMDB_BASE}/search/tv?api_key=${SR_TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=en-US&page=1`)
        ]);
        
        const [movieData, tvData] = await Promise.all([
            movieResponse.json(),
            tvResponse.json()
        ]);
        
        // Filter results with images
        const movies = (movieData.results || []).filter(item => item.poster_path && item.backdrop_path);
        const series = (tvData.results || []).filter(item => item.poster_path && item.backdrop_path);
        
        SEARCH_STATE.movies = movies;
        SEARCH_STATE.series = series;
        
        updateSearchResults(query, movies, series);
        
    } catch (error) {
        console.error('Search failed:', error);
        showErrorState();
    }
}

function showLoadingState() {
    if (srSearchTitle) {
        srSearchTitle.textContent = 'Searching...';
    }
    
    // Show loading cards
    if (srMoviesGrid) {
        srMoviesGrid.innerHTML = createLoadingCards(4);
    }
    if (srSeriesGrid) {
        srSeriesGrid.innerHTML = createLoadingCards(4);
    }
}

function createLoadingCards(count) {
    return Array(count).fill().map(() => `
        <div class="result-card loading-card">
            <div class="card-content">
                <div class="card-title" style="background: rgba(255,255,255,0.1); height: 1.5rem; border-radius: 4px; margin-bottom: 0.5rem;"></div>
                <div class="card-meta" style="background: rgba(255,255,255,0.05); height: 1rem; border-radius: 4px; width: 60%;"></div>
            </div>
        </div>
    `).join('');
}

function showErrorState() {
    if (srSearchTitle) {
        srSearchTitle.textContent = 'Search Error';
    }
    
    const errorHTML = `
        <div class="empty-state">
            <h3>Search Unavailable</h3>
            <p>Unable to search at the moment. Please try again later.</p>
        </div>
    `;
    
    if (srMoviesGrid) srMoviesGrid.innerHTML = errorHTML;
    if (srSeriesGrid) srSeriesGrid.innerHTML = '';
}

function updateSearchResults(query, movies, series) {
    // Update title
    if (srSearchTitle) {
        srSearchTitle.textContent = `Search Results for "${query}"`;
    }
    
    // Show/hide sections based on results
    const moviesSection = document.getElementById('movies-section');
    const seriesSection = document.getElementById('series-section');
    
    if (moviesSection) {
        moviesSection.style.display = movies.length > 0 ? 'block' : 'none';
    }
    
    if (seriesSection) {
        seriesSection.style.display = series.length > 0 ? 'block' : 'none';
    }
    
    // Render results (max 8 per section)
    if (srMoviesGrid) {
        srMoviesGrid.innerHTML = movies.slice(0, 8).map(movie => createResultCard(movie, 'movie')).join('');
    }
    
    if (srSeriesGrid) {
        srSeriesGrid.innerHTML = series.slice(0, 8).map(show => createResultCard(show, 'tv')).join('');
    }
    
    // Show/hide "See All" buttons (show whenever we have any results)
    if (srSeeAllMoviesBtn) {
        srSeeAllMoviesBtn.style.display = movies.length > 0 ? 'flex' : 'none';
    }
    
    if (srSeeAllSeriesBtn) {
        srSeeAllSeriesBtn.style.display = series.length > 0 ? 'flex' : 'none';
    }
    
    // Show empty state if no results
    if (movies.length === 0 && series.length === 0) {
        showEmptyState(query);
    }
}

function createResultCard(item, type) {
    const title = item.title || item.name || 'Untitled';
    const year = (item.release_date || item.first_air_date || '').slice(0, 4);
    const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
    const imageUrl = item.backdrop_path ? `${SR_TMDB_IMG}w780${item.backdrop_path}` : 
                     (item.poster_path ? `${SR_TMDB_IMG}w500${item.poster_path}` : '');
    
    return `
        <div class="result-card" data-id="${item.id}" data-type="${type}" onclick="openDetails(${item.id}, '${type}')">
            ${imageUrl ? `<img class="card-image" src="${imageUrl}" alt="${title}" loading="lazy">` : ''}
            <div class="card-gradient"></div>
            <div class="card-content">
                <h4 class="card-title">${title}</h4>
                <div class="card-meta">
                    <span class="card-type">${type === 'movie' ? 'Movie' : 'Series'}</span>
                    ${year ? `<span class="card-year">${year}</span>` : ''}
                    <div class="card-rating">
                        <span>★</span>
                        <span>${rating}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function showEmptyState(query) {
    const emptyHTML = `
        <div class="empty-state">
            <h3>No Results Found</h3>
            <p>No movies or series found for "${query}". Try a different search term.</p>
        </div>
    `;
    
    if (srMoviesGrid) srMoviesGrid.innerHTML = emptyHTML;
    if (srSeriesGrid) srSeriesGrid.innerHTML = '';
    
    const moviesSection = document.getElementById('movies-section');
    const seriesSection = document.getElementById('series-section');
    
    if (moviesSection) moviesSection.style.display = 'block';
    if (seriesSection) seriesSection.style.display = 'none';
}

function showSearchResults() {
    if (srSearchResultsContainer) {
        srSearchResultsContainer.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function hideSearchResults() {
    if (srSearchResultsContainer) {
        srSearchResultsContainer.classList.remove('active');
        document.body.style.overflow = '';
    }
    
    // Clear search input if on main page
    if (srSearchInput && !window.location.search) {
        srSearchInput.value = '';
    }
}

function showAllResults(type) {
    const query = SEARCH_STATE.query;
    const typeLabel = type === 'movie' ? 'Movies' : 'Series';
    
    // Navigate to dedicated results page
    window.location.href = `all-results.html?q=${encodeURIComponent(query)}&type=${type}&title=${encodeURIComponent(`All ${typeLabel} Results for "${query}"`)}`;
}

function openDetails(id, type) {
    // Navigate to detail page
    window.location.href = `detail.html?id=${id}&type=${type}`;
}

// Global function to trigger search from other pages
window.triggerSearch = function(query) {
    if (query) {
        SEARCH_STATE.query = query;
        if (srSearchInput) {
            srSearchInput.value = query;
        }
        if (srSearchResultsInput) {
            srSearchResultsInput.value = query;
        }
        performSearch(query);
        showSearchResults();
    }
};

// Export for use in other scripts
window.SEARCH_STATE = SEARCH_STATE;
window.performSearch = performSearch;
window.showSearchResults = showSearchResults;
window.hideSearchResults = hideSearchResults;
