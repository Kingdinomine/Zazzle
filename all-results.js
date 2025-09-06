// TMDB Configuration
const TMDB_API_KEY = '668153cb301606fdc86fef072e7daf06';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p/';

// Page state
const PAGE_STATE = {
    query: '',
    type: 'all', // 'all', 'movie', 'tv'
    currentPage: 1,
    itemsPerPage: 16,
    totalResults: 0,
    totalPages: 0,
    results: []
};

// DOM Elements
let pageTitle, resultsCount, allResultsGrid, paginationNav;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeElements();
    initializeLucideIcons();
    loadPageData();
});

function initializeElements() {
    pageTitle = document.getElementById('page-title');
    resultsCount = document.getElementById('results-count');
    allResultsGrid = document.getElementById('all-results-grid');
    paginationNav = document.getElementById('pagination-nav');
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

function loadPageData() {
    const urlParams = new URLSearchParams(window.location.search);
    PAGE_STATE.query = urlParams.get('q') || '';
    PAGE_STATE.type = urlParams.get('type') || 'all';
    PAGE_STATE.currentPage = parseInt(urlParams.get('page')) || 1;
    
    const customTitle = urlParams.get('title');
    if (customTitle) {
        updatePageTitle(customTitle);
    } else {
        const typeLabel = PAGE_STATE.type === 'movie' ? 'Movies' : 
                         PAGE_STATE.type === 'tv' ? 'Series' : 'Results';
        updatePageTitle(`All ${typeLabel} Results for "${PAGE_STATE.query}"`);
    }
    
    if (PAGE_STATE.query) {
        performSearch();
    } else {
        showEmptyState();
    }
}

function updatePageTitle(title) {
    if (pageTitle) {
        pageTitle.textContent = title;
    }
    document.title = `${title} - zazzle`;
}

async function performSearch() {
    try {
        showLoadingState();
        
        let allResults = [];
        
        if (PAGE_STATE.type === 'movie' || PAGE_STATE.type === 'all') {
            const movieResults = await searchMovies(PAGE_STATE.query);
            allResults = allResults.concat(movieResults.map(item => ({ ...item, media_type: 'movie' })));
        }
        
        if (PAGE_STATE.type === 'tv' || PAGE_STATE.type === 'all') {
            const tvResults = await searchTV(PAGE_STATE.query);
            allResults = allResults.concat(tvResults.map(item => ({ ...item, media_type: 'tv' })));
        }
        
        // Filter results with images and sort by popularity
        allResults = allResults
            .filter(item => item.poster_path && item.backdrop_path)
            .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
        
        PAGE_STATE.results = allResults;
        PAGE_STATE.totalResults = allResults.length;
        PAGE_STATE.totalPages = Math.ceil(allResults.length / PAGE_STATE.itemsPerPage);
        
        updateResultsDisplay();
        
    } catch (error) {
        console.error('Search failed:', error);
        showErrorState();
    }
}

async function searchMovies(query) {
    try {
        let allMovies = [];
        const maxPages = 5; // Limit to first 5 pages for performance
        
        for (let page = 1; page <= maxPages; page++) {
            const response = await fetch(
                `${TMDB_BASE}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=en-US&page=${page}`
            );
            const data = await response.json();
            
            if (data.results && data.results.length > 0) {
                allMovies = allMovies.concat(data.results);
            }
            
            // Stop if we've reached the last page
            if (page >= data.total_pages) break;
        }
        
        return allMovies;
    } catch (error) {
        console.error('Movie search failed:', error);
        return [];
    }
}

async function searchTV(query) {
    try {
        let allTV = [];
        const maxPages = 5; // Limit to first 5 pages for performance
        
        for (let page = 1; page <= maxPages; page++) {
            const response = await fetch(
                `${TMDB_BASE}/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=en-US&page=${page}`
            );
            const data = await response.json();
            
            if (data.results && data.results.length > 0) {
                allTV = allTV.concat(data.results);
            }
            
            // Stop if we've reached the last page
            if (page >= data.total_pages) break;
        }
        
        return allTV;
    } catch (error) {
        console.error('TV search failed:', error);
        return [];
    }
}

function updateResultsDisplay() {
    updateResultsCount();
    renderCurrentPage();
    renderPagination();
}

function updateResultsCount() {
    if (resultsCount) {
        const start = (PAGE_STATE.currentPage - 1) * PAGE_STATE.itemsPerPage + 1;
        const end = Math.min(PAGE_STATE.currentPage * PAGE_STATE.itemsPerPage, PAGE_STATE.totalResults);
        resultsCount.textContent = `${start}-${end} of ${PAGE_STATE.totalResults} results`;
    }
}

function renderCurrentPage() {
    if (!allResultsGrid) return;
    
    const startIndex = (PAGE_STATE.currentPage - 1) * PAGE_STATE.itemsPerPage;
    const endIndex = startIndex + PAGE_STATE.itemsPerPage;
    const currentPageResults = PAGE_STATE.results.slice(startIndex, endIndex);
    
    if (currentPageResults.length === 0) {
        showEmptyState();
        return;
    }
    
    allResultsGrid.innerHTML = currentPageResults.map(item => createAllResultCard(item)).join('');
    
    // Add click listeners
    addCardClickListeners();
}

function createAllResultCard(item) {
    const title = item.title || item.name || 'Untitled';
    const year = (item.release_date || item.first_air_date || '').slice(0, 4);
    const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
    const overview = item.overview || 'No description available.';
    const type = item.media_type || (item.title ? 'movie' : 'tv');
    
    // Use poster for better aspect ratio on grid
    const imageUrl = item.poster_path ? `${TMDB_IMG}w500${item.poster_path}` : '';
    
    return `
        <div class="all-result-card" data-id="${item.id}" data-type="${type}">
            ${imageUrl ? `<img class="all-card-image" src="${imageUrl}" alt="${title}" loading="lazy">` : ''}
            <div class="all-card-gradient"></div>
            <div class="all-card-content">
                <h3 class="all-card-title">${title}</h3>
                <div class="all-card-meta">
                    <div class="all-card-top-meta">
                        <span class="all-card-type">${type === 'movie' ? 'Movie' : 'Series'}</span>
                        <div class="all-card-rating">
                            <span>★</span>
                            <span>${rating}</span>
                        </div>
                    </div>
                    ${year ? `<div class="all-card-year">${year}</div>` : ''}
                    <div class="all-card-overview">${overview}</div>
                </div>
            </div>
        </div>
    `;
}

function addCardClickListeners() {
    document.querySelectorAll('.all-result-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.id;
            const type = card.dataset.type;
            openDetails(id, type);
        });
    });
}

function renderPagination() {
    if (!paginationNav || PAGE_STATE.totalPages <= 1) {
        if (paginationNav) paginationNav.innerHTML = '';
        return;
    }
    
    const currentPage = PAGE_STATE.currentPage;
    const totalPages = PAGE_STATE.totalPages;
    
    let paginationHTML = `
        <button class="pagination-btn" id="prev-btn" ${currentPage === 1 ? 'disabled' : ''}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15,18 9,12 15,6"></polyline>
            </svg>
            Previous
        </button>
        
        <div class="page-numbers">
    `;
    
    // Calculate page range to show
    const maxVisiblePages = 7;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    // Adjust start if we're near the end
    if (endPage - startPage < maxVisiblePages - 1) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    // Always show first page
    if (startPage > 1) {
        paginationHTML += `<button class="page-number" data-page="1">1</button>`;
        if (startPage > 2) {
            paginationHTML += `<span class="page-ellipsis">...</span>`;
        }
    }
    
    // Show page numbers
    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `
            <button class="page-number ${i === currentPage ? 'active' : ''}" data-page="${i}">
                ${i}
            </button>
        `;
    }
    
    // Always show last page
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            paginationHTML += `<span class="page-ellipsis">...</span>`;
        }
        paginationHTML += `<button class="page-number" data-page="${totalPages}">${totalPages}</button>`;
    }
    
    paginationHTML += `
        </div>
        
        <button class="pagination-btn" id="next-btn" ${currentPage === totalPages ? 'disabled' : ''}>
            Next
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9,6 15,12 9,18"></polyline>
            </svg>
        </button>
    `;
    
    paginationNav.innerHTML = paginationHTML;
    
    // Add pagination event listeners
    addPaginationListeners();
}

function addPaginationListeners() {
    // Previous button
    const prevBtn = document.getElementById('prev-btn');
    if (prevBtn && !prevBtn.disabled) {
        prevBtn.addEventListener('click', () => goToPage(PAGE_STATE.currentPage - 1));
    }
    
    // Next button
    const nextBtn = document.getElementById('next-btn');
    if (nextBtn && !nextBtn.disabled) {
        nextBtn.addEventListener('click', () => goToPage(PAGE_STATE.currentPage + 1));
    }
    
    // Page number buttons
    document.querySelectorAll('.page-number').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = parseInt(btn.dataset.page);
            if (page && page !== PAGE_STATE.currentPage) {
                goToPage(page);
            }
        });
    });
}

function goToPage(page) {
    if (page < 1 || page > PAGE_STATE.totalPages || page === PAGE_STATE.currentPage) {
        return;
    }
    
    PAGE_STATE.currentPage = page;
    
    // Update URL
    const url = new URL(window.location);
    url.searchParams.set('page', page);
    window.history.pushState({}, '', url);
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Update display
    updateResultsDisplay();
}

function showLoadingState() {
    if (allResultsGrid) {
        allResultsGrid.innerHTML = Array(16).fill().map(() => `
            <div class="all-result-card loading-card">
                <div class="all-card-content">
                    <div class="all-card-title" style="background: rgba(255,255,255,0.1); height: 1.5rem; border-radius: 4px; margin-bottom: 1rem;"></div>
                    <div class="all-card-meta">
                        <div style="background: rgba(255,255,255,0.05); height: 1rem; border-radius: 4px; width: 60%; margin-bottom: 0.5rem;"></div>
                        <div style="background: rgba(255,255,255,0.05); height: 3rem; border-radius: 4px;"></div>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    if (resultsCount) {
        resultsCount.textContent = 'Loading...';
    }
    
    if (paginationNav) {
        paginationNav.innerHTML = '';
    }
}

function showErrorState() {
    if (allResultsGrid) {
        allResultsGrid.innerHTML = `
            <div class="empty-state">
                <h3>Search Error</h3>
                <p>Unable to load search results. Please try again later.</p>
            </div>
        `;
    }
    
    if (resultsCount) {
        resultsCount.textContent = 'Error loading results';
    }
}

function showEmptyState() {
    if (allResultsGrid) {
        allResultsGrid.innerHTML = `
            <div class="empty-state">
                <h3>No Results Found</h3>
                <p>No ${PAGE_STATE.type === 'movie' ? 'movies' : PAGE_STATE.type === 'tv' ? 'series' : 'results'} found for "${PAGE_STATE.query}". Try a different search term.</p>
            </div>
        `;
    }
    
    if (resultsCount) {
        resultsCount.textContent = '0 results';
    }
    
    if (paginationNav) {
        paginationNav.innerHTML = '';
    }
}

function openDetails(id, type) {
    // Navigate to detail page
    window.location.href = `detail.html?id=${id}&type=${type}`;
}

// Handle browser back/forward
window.addEventListener('popstate', () => {
    loadPageData();
});
