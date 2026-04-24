/**
 * BTC Studio - GitHub Overview Logic
 */

class GithubTracker {
    constructor() {
        this.username = localStorage.getItem('nexus_username') || 'RenaudRl';
        this.token = localStorage.getItem('nexus_token') || '';
        this.repos = [];
        this.filteredRepos = [];
        this.globalStats = {
            stars: 0,
            repos: 0,
            followers: 0,
            downloads: 0
        };
        this.chart = null;
        this.lastUpdated = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        
        // Try to load cached data first
        if (this.loadCache()) {
            this.renderUI();
            // Optionally refresh in background if cache is old (> 1 hour)
            if (Date.now() - this.lastUpdated > 3600000) {
                this.fetchData();
            }
        } else {
            this.fetchData();
        }

    }

    setupEventListeners() {
        document.getElementById('refreshBtn').addEventListener('click', () => this.fetchData());
        
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (item.classList.contains('soon')) return;
                const tabId = item.getAttribute('data-tab');
                this.switchTab(tabId);
            });
        });

        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal-overlay');
                this.hideModal(modal.id);
            });
        });

        document.getElementById('repoSearch').addEventListener('input', (e) => this.handleSearch(e.target.value));
        document.getElementById('sortSelect').addEventListener('change', (e) => this.handleSort(e.target.value));
    }

    switchTab(tabId) {
        // Update Sidebar UI
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-tab') === tabId);
        });

        // Update Content UI
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabId}-tab`);
        });
    }

    async fetchData() {
        try {
            console.log('Fetching fresh data from GitHub...');
            this.showLoading();
            
            // Fetch User Info
            const userData = await this.apiFetch(`users/${this.username}`);
            this.updateUserUI(userData);

            // Fetch Repos
            let allRepos = [];
            let page = 1;
            while (true) {
                const reposPage = await this.apiFetch(`users/${this.username}/repos?per_page=100&page=${page}&sort=updated`);
                if (!reposPage || reposPage.length === 0) break;
                allRepos = [...allRepos, ...reposPage];
                if (reposPage.length < 100) break;
                page++;
            }

            this.repos = allRepos;
            this.filteredRepos = [...this.repos];
            this.lastUpdated = Date.now();
            
            this.calculateGlobalStats();
            this.saveCache();
            this.renderUI();
            this.hideLoading();
        } catch (error) {
            console.error('Fetch error:', error);
            // If fetch fails, we already have cached data displayed if it existed
            if (this.repos.length > 0) {
                alert(`Note: Using cached data because fresh fetch failed (${error.message})`);
            } else {
                alert(`Failed to fetch data: ${error.message}`);
            }
            this.hideLoading();
        }
    }

    async apiFetch(endpoint) {
        const headers = {
            'Accept': 'application/vnd.github.v3+json'
        };
        if (this.token) {
            headers['Authorization'] = `token ${this.token}`;
        }

        const response = await fetch(`https://api.github.com/${endpoint}`, { headers });
        
        if (response.status === 403) {
            const limit = response.headers.get('X-RateLimit-Limit');
            const remaining = response.headers.get('X-RateLimit-Remaining');
            if (remaining === '0') {
                throw new Error('Rate limit exceeded. Please add a Personal Access Token in Settings to continue.');
            }
        }
        
        if (!response.ok) {
            throw new Error(`GitHub API Error: ${response.statusText} (${response.status})`);
        }

        return await response.json();
    }

    updateUserUI(userData) {
        this.globalStats.followers = userData.followers;
        const followersEl = document.getElementById('totalFollowers');
        if (followersEl) followersEl.textContent = this.formatNumber(userData.followers);
        
        const profileDiv = document.getElementById('userProfile');
        if (profileDiv) {
            profileDiv.innerHTML = `<img src="${userData.avatar_url}" alt="${userData.login}" class="avatar-sm">`;
        }
    }

    calculateGlobalStats() {
        this.globalStats.stars = this.repos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
        this.globalStats.repos = this.repos.length;
        this.fetchGlobalDownloads();
    }

    async fetchGlobalDownloads() {
        let total = 0;
        // Optimization: Only fetch releases for repos that aren't forks and have actual activity
        const targetRepos = this.repos.filter(r => !r.fork && r.stargazers_count > 0);
        
        // If too many repos and no token, we might hit the limit
        const limit = this.token ? 100 : 20;
        const reposToFetch = targetRepos.slice(0, limit);

        try {
            const promises = reposToFetch.map(repo => 
                this.apiFetch(`repos/${repo.full_name}/releases`).catch(() => [])
            );
            
            const allReleases = await Promise.all(promises);
            allReleases.forEach(releases => {
                releases.forEach(release => {
                    total += release.assets.reduce((sum, a) => sum + a.download_count, 0);
                });
            });

            this.globalStats.downloads = total;
            document.getElementById('totalDownloads').textContent = this.formatNumber(total);
            this.saveCache(); // Update cache with download stats
        } catch (e) {
            console.warn('Incomplete download stats:', e);
        }
    }

    renderUI() {
        document.getElementById('totalStars').textContent = this.formatNumber(this.globalStats.stars);
        document.getElementById('totalRepos').textContent = this.formatNumber(this.globalStats.repos);
        document.getElementById('totalFollowers').textContent = this.formatNumber(this.globalStats.followers);
        document.getElementById('totalDownloads').textContent = this.formatNumber(this.globalStats.downloads);
        
        if (this.lastUpdated) {
            const date = new Date(this.lastUpdated);
            document.getElementById('lastUpdated').textContent = `Last synchronized: ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`;
        }

        this.renderRepos();
    }

    renderRepos() {
        const grid = document.getElementById('repoGrid');
        grid.innerHTML = '';

        if (this.filteredRepos.length === 0 && this.repos.length > 0) {
            grid.innerHTML = '<div class="no-results">No repositories match your search.</div>';
            return;
        }

        this.filteredRepos.forEach(repo => {
            const card = document.createElement('div');
            card.className = 'repo-card glass-card animate-pop';
            card.innerHTML = `
                <div class="repo-header">
                    <span class="repo-name">${repo.name}</span>
                    <span class="repo-visibility badge">${repo.private ? 'Private' : 'Public'}</span>
                </div>
                <p class="repo-desc">${repo.description || 'No description provided.'}</p>
                <div class="repo-footer">
                    <div class="repo-stats">
                        <span><i class="fas fa-star"></i> ${repo.stargazers_count}</span>
                        <span><i class="fas fa-code-branch"></i> ${repo.forks_count}</span>
                    </div>
                    <div class="lang-badge">
                        <span class="lang-dot" style="background-color: ${this.getLangColor(repo.language)}"></span>
                        <span>${repo.language || 'Mixed'}</span>
                    </div>
                </div>
            `;
            card.onclick = () => this.showRepoDetails(repo);
            grid.appendChild(card);
        });
    }

    async showRepoDetails(repo) {
        document.getElementById('modalRepoName').textContent = repo.name;
        document.getElementById('modalRepoDesc').textContent = repo.description || '';
        
        const tagsDiv = document.getElementById('modalRepoTags');
        tagsDiv.innerHTML = (repo.topics || []).map(t => `<span class="tag">${t}</span>`).join('');

        const statsList = document.getElementById('modalStatsList');
        statsList.innerHTML = `
            <li><span>Stars</span> <strong>${repo.stargazers_count}</strong></li>
            <li><span>Forks</span> <strong>${repo.forks_count}</strong></li>
            <li><span>Open Issues</span> <strong>${repo.open_issues_count}</strong></li>
            <li><span>Size</span> <strong>${(repo.size / 1024).toFixed(2)} MB</strong></li>
            <li><span>Language</span> <strong>${repo.language || 'Mixed'}</strong></li>
            <li><span>Last Update</span> <strong>${new Date(repo.updated_at).toLocaleDateString()}</strong></li>
        `;

        this.showModal('repoModal');

        try {
            const releases = await this.apiFetch(`repos/${repo.full_name}/releases`);
            this.updateReleaseChart(releases);
        } catch (e) {
            if (this.chart) this.chart.destroy();
        }
    }

    updateReleaseChart(releases) {
        const ctx = document.getElementById('releaseChart').getContext('2d');
        if (this.chart) this.chart.destroy();
        if (!releases || releases.length === 0) return;

        const data = releases.slice(0, 10).reverse();
        const labels = data.map(r => r.tag_name);
        const downloads = data.map(r => r.assets.reduce((sum, a) => sum + a.download_count, 0));

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Downloads',
                    data: downloads,
                    borderColor: '#58A6FF',
                    backgroundColor: 'rgba(88, 166, 255, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#8B949E' } },
                    x: { grid: { display: false }, ticks: { color: '#8B949E' } }
                }
            }
        });
    }

    saveCache() {
        const cache = {
            repos: this.repos,
            globalStats: this.globalStats,
            lastUpdated: this.lastUpdated
        };
        localStorage.setItem('nexus_cache', JSON.stringify(cache));
    }

    loadCache() {
        const cached = localStorage.getItem('nexus_cache');
        if (cached) {
            try {
                const data = JSON.parse(cached);
                this.repos = data.repos;
                this.filteredRepos = [...this.repos];
                this.globalStats = data.globalStats;
                this.lastUpdated = data.lastUpdated;
                return true;
            } catch (e) {
                return false;
            }
        }
        return false;
    }

    handleSearch(query) {
        const q = query.toLowerCase();
        this.filteredRepos = this.repos.filter(repo => 
            repo.name.toLowerCase().includes(q) || 
            (repo.description && repo.description.toLowerCase().includes(q))
        );
        this.renderRepos();
    }

    handleSort(criteria) {
        if (criteria === 'stars') this.filteredRepos.sort((a, b) => b.stargazers_count - a.stargazers_count);
        else if (criteria === 'updated') this.filteredRepos.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        else if (criteria === 'name') this.filteredRepos.sort((a, b) => a.name.localeCompare(b.name));
        this.renderRepos();
    }

    showModal(id) { document.getElementById(id).classList.remove('hidden'); }
    hideModal(id) { document.getElementById(id).classList.add('hidden'); }
    showLoading() { document.getElementById('repoGrid').innerHTML = '<div class="skeleton-loader"></div>'.repeat(6); }
    hideLoading() {}

    formatNumber(num) {
        if (!num) return '0';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
        return num.toString();
    }

    getLangColor(lang) {
        const colors = { 'JavaScript': '#f1e05a', 'TypeScript': '#3178c6', 'HTML': '#e34c26', 'CSS': '#563d7c', 'Python': '#3572A5', 'Java': '#b07219', 'Kotlin': '#A97BFF', 'Rust': '#dea584', 'Go': '#00ADD8', 'C++': '#f34b7d', 'C#': '#178600' };
        return colors[lang] || '#8B949E';
    }
}

document.addEventListener('DOMContentLoaded', () => { window.nexus = new GithubTracker(); });
