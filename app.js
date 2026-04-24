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
            downloads: 0,
            issues: 0
        };
        this.charts = {};
        this.lastUpdated = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        
        // Try to load cached data first
        if (this.loadCache()) {
            this.renderUI();
            // Refresh if cache > 1 hour
            if (Date.now() - this.lastUpdated > 3600000) {
                this.fetchData();
            }
        } else {
            this.fetchData();
        }
    }

    setupEventListeners() {
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) refreshBtn.addEventListener('click', () => this.fetchData());
        
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
                if (modal) this.hideModal(modal.id);
            });
        });

        const repoSearch = document.getElementById('repoSearch');
        if (repoSearch) repoSearch.addEventListener('input', (e) => this.handleSearch(e.target.value));
        
        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) sortSelect.addEventListener('change', (e) => this.handleSort(e.target.value));
    }

    switchTab(tabId) {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-tab') === tabId);
        });

        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabId}-tab`);
        });

        if (tabId === 'analytics') {
            setTimeout(() => this.renderAnalytics(), 100);
        }
    }

    async fetchData() {
        try {
            console.log('Fetching fresh data from GitHub...');
            this.showLoading();
            
            const userData = await this.apiFetch(`users/${this.username}`);
            this.updateUserUI(userData);

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
            if (this.repos.length > 0) {
                alert(`Note: Using cached data because fresh fetch failed (${error.message})`);
            } else {
                alert(`Failed to fetch data: ${error.message}`);
            }
            this.hideLoading();
        }
    }

    async apiFetch(endpoint) {
        const headers = { 'Accept': 'application/vnd.github.v3+json' };
        if (this.token) headers['Authorization'] = `token ${this.token}`;

        const response = await fetch(`https://api.github.com/${endpoint}`, { headers });
        
        if (response.status === 403) {
            const remaining = response.headers.get('X-RateLimit-Remaining');
            if (remaining === '0') throw new Error('Rate limit exceeded. Please wait or use a PAT.');
        }
        if (!response.ok) throw new Error(`GitHub API Error: ${response.status}`);

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
        this.globalStats.issues = this.repos.reduce((sum, repo) => sum + repo.open_issues_count, 0);
        this.fetchGlobalDownloads();
    }

    async fetchGlobalDownloads() {
        let total = 0;
        const targetRepos = this.repos.filter(r => !r.fork && r.stargazers_count > 0);
        const limit = this.token ? 100 : 15;
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
            const downloadsEl = document.getElementById('totalDownloads');
            if (downloadsEl) downloadsEl.textContent = this.formatNumber(total);
            this.saveCache();
        } catch (e) {
            console.warn('Downloads sync failed');
        }
    }

    renderUI() {
        const elements = {
            'totalStars': this.globalStats.stars,
            'totalRepos': this.globalStats.repos,
            'totalFollowers': this.globalStats.followers,
            'totalIssues': this.globalStats.issues
        };

        for (const [id, val] of Object.entries(elements)) {
            const el = document.getElementById(id);
            if (el) el.textContent = this.formatNumber(val);
        }
        
        if (this.lastUpdated) {
            const date = new Date(this.lastUpdated);
            const lastUpEl = document.getElementById('lastUpdated');
            if (lastUpEl) lastUpEl.textContent = `Synced: ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`;
        }

        this.renderAnalytics();
        this.renderRepos();
    }

    renderAnalytics() {
        if (!this.repos.length) return;
        
        this.updateStarsDistributionChart();
        this.updateLanguageBreakdownChart();
        this.updateIssuesDensityChart();
    }

    updateStarsDistributionChart() {
        const ctx = document.getElementById('starsDistributionChart')?.getContext('2d');
        if (!ctx) return;

        if (this.charts.stars) this.charts.stars.destroy();

        const data = [...this.repos]
            .sort((a, b) => b.stargazers_count - a.stargazers_count)
            .slice(0, 15);
            
        this.charts.stars = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(r => r.name),
                datasets: [{
                    label: 'Stars',
                    data: data.map(r => r.stargazers_count),
                    backgroundColor: 'rgba(88, 166, 255, 0.5)',
                    borderColor: '#58A6FF',
                    borderWidth: 1,
                    borderRadius: 5
                }]
            },
            options: this.getChartOptions(false)
        });
    }

    updateLanguageBreakdownChart() {
        const ctx = document.getElementById('languageBreakdownChart')?.getContext('2d');
        if (!ctx) return;

        if (this.charts.languages) this.charts.languages.destroy();

        const langMap = {};
        this.repos.forEach(repo => {
            if (repo.language) {
                langMap[repo.language] = (langMap[repo.language] || 0) + 1;
            }
        });

        const sortedLangs = Object.entries(langMap).sort((a, b) => b[1] - a[1]);

        this.charts.languages = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: sortedLangs.map(l => l[0]),
                datasets: [{
                    data: sortedLangs.map(l => l[1]),
                    backgroundColor: sortedLangs.map(l => this.getLangColor(l[0])),
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: {
                ...this.getChartOptions(true),
                cutout: '70%'
            }
        });
    }

    updateIssuesDensityChart() {
        const ctx = document.getElementById('issuesDensityChart')?.getContext('2d');
        if (!ctx) return;

        if (this.charts.issues) this.charts.issues.destroy();

        const data = [...this.repos]
            .sort((a, b) => b.open_issues_count - a.open_issues_count)
            .slice(0, 10);

        this.charts.issues = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(r => r.name),
                datasets: [{
                    label: 'Open Issues',
                    data: data.map(r => r.open_issues_count),
                    borderColor: '#F85149',
                    backgroundColor: 'rgba(248, 81, 73, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4
                }]
            },
            options: this.getChartOptions(false)
        });
    }

    getChartOptions(isDoughnut) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: isDoughnut,
                    position: 'right',
                    labels: { color: '#8B949E', font: { size: 11 }, padding: 15, usePointStyle: true }
                }
            },
            scales: isDoughnut ? {} : {
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#8B949E' } },
                x: { grid: { display: false }, ticks: { color: '#8B949E', font: { size: 10 } } }
            }
        };
    }

    renderRepos() {
        const grid = document.getElementById('repoGrid');
        if (!grid) return;
        grid.innerHTML = '';

        this.filteredRepos.forEach(repo => {
            const card = document.createElement('div');
            card.className = 'repo-card glass-card animate-pop';
            card.innerHTML = `
                <div class="repo-header">
                    <span class="repo-name">${repo.name}</span>
                    <span class="repo-visibility badge">${repo.private ? 'Private' : 'Public'}</span>
                </div>
                <p class="repo-desc">${repo.description || 'No description'}</p>
                <div class="repo-footer">
                    <div class="repo-stats">
                        <span><i class="fas fa-star"></i> ${repo.stargazers_count}</span>
                        <span><i class="fas fa-bug"></i> ${repo.open_issues_count}</span>
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
        const nameEl = document.getElementById('modalRepoName');
        const descEl = document.getElementById('modalRepoDesc');
        if (nameEl) nameEl.textContent = repo.name;
        if (descEl) descEl.textContent = repo.description || '';
        
        const tagsDiv = document.getElementById('modalRepoTags');
        if (tagsDiv) tagsDiv.innerHTML = (repo.topics || []).map(t => `<span class="tag">${t}</span>`).join('');

        this.showModal('repoModal');
    }

    saveCache() {
        const cache = { repos: this.repos, globalStats: this.globalStats, lastUpdated: this.lastUpdated };
        localStorage.setItem('nexus_cache', JSON.stringify(cache));
    }

    loadCache() {
        const cached = localStorage.getItem('nexus_cache');
        if (!cached) return false;
        try {
            const data = JSON.parse(cached);
            this.repos = data.repos;
            this.filteredRepos = [...this.repos];
            this.globalStats = data.globalStats;
            this.lastUpdated = data.lastUpdated;
            return true;
        } catch (e) { return false; }
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

    showModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
    hideModal(id) { document.getElementById(id)?.classList.add('hidden'); }
    showLoading() { 
        const grid = document.getElementById('repoGrid');
        if (grid) grid.innerHTML = '<div class="skeleton-loader"></div>'.repeat(6); 
    }
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
