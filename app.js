/**
 * BTC Studio - GitHub Overview Logic v1.4.1
 * Optimized for performance and stability.
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
        
        if (this.loadCache()) {
            this.renderUI();
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
            item.addEventListener('click', () => {
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
            
            await this.calculateGlobalStats();
            this.saveCache();
            this.renderUI();
            this.hideLoading();
        } catch (error) {
            console.error('Fetch error:', error);
            this.hideLoading();
        }
    }

    async apiFetch(endpoint) {
        const headers = { 'Accept': 'application/vnd.github.v3+json' };
        if (this.token) headers['Authorization'] = `token ${this.token}`;

        const response = await fetch(`https://api.github.com/${endpoint}`, { headers });
        
        if (response.status === 403) {
            const remaining = response.headers.get('X-RateLimit-Remaining');
            if (remaining === '0') throw new Error('Rate limit exceeded.');
        }
        if (!response.ok) throw new Error(`GitHub API Error: ${response.status}`);

        return await response.json();
    }

    updateUserUI(userData) {
        if (!userData) return;
        this.globalStats.followers = userData.followers;
        const followersEl = document.getElementById('totalFollowers');
        if (followersEl) followersEl.textContent = this.formatNumber(userData.followers);
        
        const profileDiv = document.getElementById('userProfile');
        if (profileDiv && userData.avatar_url) {
            profileDiv.innerHTML = `<img src="${userData.avatar_url}" alt="${userData.login}" class="avatar-sm">`;
        }
    }

    async calculateGlobalStats() {
        this.globalStats.stars = this.repos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
        this.globalStats.repos = this.repos.length;
        this.globalStats.issues = this.repos.reduce((sum, repo) => sum + repo.open_issues_count, 0);
        await this.fetchGlobalDownloads();
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
            
            allReleases.forEach((releases, index) => {
                const repo = reposToFetch[index];
                let repoDls = 0;
                if (Array.isArray(releases)) {
                    releases.forEach(release => {
                        if (release.assets) {
                            repoDls += release.assets.reduce((sum, a) => sum + a.download_count, 0);
                        }
                    });
                }
                repo.total_downloads = repoDls;
                total += repoDls;
            });

            this.globalStats.downloads = total;
            const downloadsEl = document.getElementById('totalDownloads');
            if (downloadsEl) downloadsEl.textContent = this.formatNumber(total);
            this.saveCache();
        } catch (e) {
            console.warn('Downloads sync incomplete');
        }
    }

    renderUI() {
        const stats = {
            'totalStars': this.globalStats.stars,
            'totalRepos': this.globalStats.repos,
            'totalFollowers': this.globalStats.followers,
            'totalIssues': this.globalStats.issues,
            'totalDownloads': this.globalStats.downloads
        };

        for (const [id, val] of Object.entries(stats)) {
            const el = document.getElementById(id);
            if (el) el.textContent = this.formatNumber(val);
        }
        
        if (this.lastUpdated) {
            const date = new Date(this.lastUpdated);
            const lastUpEl = document.getElementById('lastUpdated');
            if (lastUpEl) lastUpEl.textContent = `Last synchronized: ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`;
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
        const tableBody = document.getElementById('reposTableBody');
        const tableFooter = document.getElementById('reposTableFooter');
        if (!tableBody) return;
        
        tableBody.innerHTML = '';
        
        let totalStars = 0;
        let totalForks = 0;
        let totalIssues = 0;
        let totalDownloads = 0;

        this.filteredRepos.forEach(repo => {
            totalStars += repo.stargazers_count;
            totalForks += repo.forks_count;
            totalIssues += repo.open_issues_count;
            const dls = repo.total_downloads || 0;
            totalDownloads += dls;

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <div class="table-repo-name">${repo.name}</div>
                    <div class="text-muted" style="font-size: 0.75rem">${repo.description || 'No description provided'}</div>
                </td>
                <td>
                    <div class="lang-badge">
                        <span class="lang-dot" style="background-color: ${this.getLangColor(repo.language)}"></span>
                        <span>${repo.language || 'Mixed'}</span>
                    </div>
                </td>
                <td class="table-stat-cell">${repo.stargazers_count}</td>
                <td class="table-stat-cell">${repo.forks_count}</td>
                <td class="table-stat-cell">${repo.open_issues_count}</td>
                <td class="table-stat-cell"><strong>${this.formatNumber(dls)}</strong></td>
                <td>
                    <div class="table-sync-date">${new Date(repo.updated_at).toLocaleDateString()}</div>
                </td>
            `;
            row.onclick = () => this.showRepoDetails(repo);
            tableBody.appendChild(row);
        });

        if (tableFooter) {
            tableFooter.innerHTML = `
                <tr>
                    <td>TOTAL (${this.filteredRepos.length} Repos)</td>
                    <td>-</td>
                    <td>${totalStars}</td>
                    <td>${totalForks}</td>
                    <td>${totalIssues}</td>
                    <td>${this.formatNumber(totalDownloads)}</td>
                    <td>-</td>
                </tr>
            `;
        }
    }

    async showRepoDetails(repo) {
        const nameEl = document.getElementById('modalRepoName');
        if (nameEl) nameEl.textContent = repo.name;
        
        const descEl = document.getElementById('modalRepoDesc');
        if (descEl) descEl.textContent = repo.description || '';
        
        const tagsDiv = document.getElementById('modalRepoTags');
        if (tagsDiv) tagsDiv.innerHTML = (repo.topics || []).map(t => `<span class="tag">${t}</span>`).join('');

        const statsList = document.getElementById('modalStatsList');
        if (statsList) {
            statsList.innerHTML = `
                <li><span>Stars</span> <strong>${repo.stargazers_count}</strong></li>
                <li><span>Forks</span> <strong>${repo.forks_count}</strong></li>
                <li><span>Open Issues</span> <strong>${repo.open_issues_count}</strong></li>
                <li><span>Language</span> <strong>${repo.language || 'Mixed'}</strong></li>
                <li><span>Last Update</span> <strong>${new Date(repo.updated_at).toLocaleDateString()}</strong></li>
            `;
        }

        const releaseBody = document.getElementById('modalReleaseTableBody');
        if (releaseBody) releaseBody.innerHTML = '<tr><td colspan="3" style="text-align: center">Loading releases...</td></tr>';

        this.showModal('repoModal');

        try {
            const releases = await this.apiFetch(`repos/${repo.full_name}/releases`);
            this.renderReleaseChart(releases);

            if (releaseBody) {
                if (!releases || releases.length === 0) {
                    releaseBody.innerHTML = '<tr><td colspan="3" style="text-align: center">No releases found.</td></tr>';
                } else {
                    releaseBody.innerHTML = releases.map(r => {
                        const dls = r.assets.reduce((sum, a) => sum + a.download_count, 0);
                        return `
                            <tr>
                                <td><span class="badge" style="background: rgba(88, 166, 255, 0.1); color: var(--accent-blue)">${r.tag_name}</span></td>
                                <td>${new Date(r.published_at).toLocaleDateString()}</td>
                                <td><strong>${this.formatNumber(dls)}</strong></td>
                            </tr>
                        `;
                    }).join('');
                }
            }
        } catch (e) {
            console.error('Modal fetch failed:', e);
            if (releaseBody) releaseBody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--accent-orange)">Failed to load releases.</td></tr>';
        }
    }

    renderReleaseChart(releases) {
        const ctx = document.getElementById('releaseChart')?.getContext('2d');
        if (!ctx) return;

        if (this.charts.repoDetail) this.charts.repoDetail.destroy();

        const data = [...releases].reverse().slice(-10);

        this.charts.repoDetail = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(r => r.tag_name),
                datasets: [{
                    label: 'Downloads',
                    data: data.map(r => r.assets.reduce((sum, a) => sum + a.download_count, 0)),
                    backgroundColor: 'rgba(88, 166, 255, 0.5)',
                    borderColor: '#58A6FF',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#8B949E', font: { size: 10 } } },
                    x: { grid: { display: false }, ticks: { color: '#8B949E', font: { size: 10 } } }
                }
            }
        });
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
        else if (criteria === 'forks') this.filteredRepos.sort((a, b) => b.forks_count - a.forks_count);
        else if (criteria === 'issues') this.filteredRepos.sort((a, b) => b.open_issues_count - a.open_issues_count);
        else if (criteria === 'downloads') this.filteredRepos.sort((a, b) => (b.total_downloads || 0) - (a.total_downloads || 0));
        else if (criteria === 'updated') this.filteredRepos.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        else if (criteria === 'name') this.filteredRepos.sort((a, b) => a.name.localeCompare(b.name));
        this.renderRepos();
    }

    showModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
    hideModal(id) { document.getElementById(id)?.classList.add('hidden'); }
    showLoading() { 
        const grid = document.getElementById('reposTableBody');
        if (grid) grid.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px;"><div class="skeleton-loader"></div></td></tr>'; 
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
