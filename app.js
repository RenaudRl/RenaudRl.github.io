/**
 * Obsidian Nexus - GitHub Tracker Logic
 */

class GithubTracker {
    constructor() {
        this.username = localStorage.getItem('nexus_username') || '';
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

        this.init();
    }

    init() {
        this.setupEventListeners();
        if (this.username) {
            this.fetchData();
            document.getElementById('ghUsername').value = this.username;
            document.getElementById('ghToken').value = this.token;
        } else {
            this.showModal('settingsModal');
        }
    }

    setupEventListeners() {
        // Global Actions
        document.getElementById('refreshBtn').addEventListener('click', () => this.fetchData());
        document.getElementById('settingsBtn').addEventListener('click', () => this.showModal('settingsModal'));
        document.getElementById('saveSettings').addEventListener('click', () => this.saveSettings());
        
        // Modal Closing
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal-overlay');
                this.hideModal(modal.id);
            });
        });

        // Search & Sort
        document.getElementById('repoSearch').addEventListener('input', (e) => this.handleSearch(e.target.value));
        document.getElementById('sortSelect').addEventListener('change', (e) => this.handleSort(e.target.value));
    }

    async fetchData() {
        try {
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
            
            this.calculateGlobalStats();
            this.renderRepos();
            this.hideLoading();
        } catch (error) {
            console.error('Fetch error:', error);
            alert(`Failed to fetch data: ${error.message}`);
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
        
        if (response.status === 403 && !this.token) {
            throw new Error('Rate limit exceeded. Please add a Personal Access Token in Settings.');
        }
        
        if (!response.ok) {
            throw new Error(`GitHub API Error: ${response.statusText}`);
        }

        return await response.json();
    }

    calculateGlobalStats() {
        this.globalStats.stars = this.repos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
        this.globalStats.repos = this.repos.length;
        this.globalStats.followers = 0; // Filled from user data later
        this.globalStats.downloads = 0; // Filled via release fetch for each repo if needed

        document.getElementById('totalStars').textContent = this.formatNumber(this.globalStats.stars);
        document.getElementById('totalRepos').textContent = this.formatNumber(this.globalStats.repos);

        // Fetch global downloads asynchronously to avoid blocking
        this.fetchGlobalDownloads();
    }

    async fetchGlobalDownloads() {
        let total = 0;
        // Only fetch if we have a token or few repos to avoid rate limit
        if (!this.token && this.repos.length > 30) {
            document.getElementById('totalDownloads').textContent = '---';
            return;
        }

        try {
            // Fetch releases for first 30 repos (or all if token exists)
            const reposToFetch = this.token ? this.repos : this.repos.slice(0, 30);
            
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
        } catch (e) {
            console.warn('Could not fetch all downloads:', e);
            document.getElementById('totalDownloads').textContent = 'N/A';
        }
    }

    updateUserUI(userData) {
        this.globalStats.followers = userData.followers;
        document.getElementById('totalFollowers').textContent = this.formatNumber(userData.followers);
        
        const profileDiv = document.getElementById('userProfile');
        profileDiv.innerHTML = `<img src="${userData.avatar_url}" alt="${userData.login}" class="avatar-sm">`;
    }

    renderRepos() {
        const grid = document.getElementById('repoGrid');
        grid.innerHTML = '';

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
                        <span>${repo.language || 'Plain Text'}</span>
                    </div>
                </div>
            `;
            card.onclick = () => this.showRepoDetails(repo);
            grid.appendChild(card);
        });
    }

    async showRepoDetails(repo) {
        document.getElementById('modalRepoName').textContent = repo.name;
        document.getElementById('modalRepoDesc').textContent = repo.description;
        
        // Show tags
        const tagsDiv = document.getElementById('modalRepoTags');
        tagsDiv.innerHTML = (repo.topics || []).map(t => `<span class="tag">${t}</span>`).join('');

        // Stats List
        const statsList = document.getElementById('modalStatsList');
        statsList.innerHTML = `
            <li><span>Stars</span> <strong>${repo.stargazers_count}</strong></li>
            <li><span>Forks</span> <strong>${repo.forks_count}</strong></li>
            <li><span>Watchers</span> <strong>${repo.watchers_count}</strong></li>
            <li><span>Open Issues</span> <strong>${repo.open_issues_count}</strong></li>
            <li><span>Size</span> <strong>${(repo.size / 1024).toFixed(2)} MB</strong></li>
            <li><span>Created</span> <strong>${new Date(repo.created_at).toLocaleDateString()}</strong></li>
        `;

        this.showModal('repoModal');

        // Fetch Releases for Chart
        try {
            const releases = await this.apiFetch(`repos/${repo.full_name}/releases`);
            this.updateReleaseChart(releases);
        } catch (e) {
            console.warn('Releases not available for this repo');
            if (this.chart) this.chart.destroy();
        }
    }

    updateReleaseChart(releases) {
        const ctx = document.getElementById('releaseChart').getContext('2d');
        
        if (this.chart) this.chart.destroy();

        if (!releases || releases.length === 0) {
            // Handle no releases
            return;
        }

        const lastN = 10;
        const data = releases.slice(0, lastN).reverse();
        const labels = data.map(r => r.tag_name);
        const downloads = data.map(r => r.assets.reduce((sum, a) => sum + a.download_count, 0));

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Total Downloads',
                    data: downloads,
                    borderColor: '#58A6FF',
                    backgroundColor: 'rgba(88, 166, 255, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3,
                    pointBackgroundColor: '#A371F7',
                    pointRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#8B949E' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#8B949E' }
                    }
                }
            }
        });
    }

    handleSearch(query) {
        const q = query.toLowerCase();
        this.filteredRepos = this.repos.filter(repo => 
            repo.name.toLowerCase().includes(q) || 
            (repo.description && repo.description.toLowerCase().includes(q)) ||
            (repo.language && repo.language.toLowerCase().includes(q))
        );
        this.renderRepos();
    }

    handleSort(criteria) {
        switch(criteria) {
            case 'stars':
                this.filteredRepos.sort((a, b) => b.stargazers_count - a.stargazers_count);
                break;
            case 'updated':
                this.filteredRepos.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
                break;
            case 'name':
                this.filteredRepos.sort((a, b) => a.name.localeCompare(b.name));
                break;
        }
        this.renderRepos();
    }

    saveSettings() {
        const username = document.getElementById('ghUsername').value.trim();
        const token = document.getElementById('ghToken').value.trim();

        if (!username) {
            alert('Username is required');
            return;
        }

        localStorage.setItem('nexus_username', username);
        localStorage.setItem('nexus_token', token);
        
        this.username = username;
        this.token = token;
        
        this.hideModal('settingsModal');
        this.fetchData();
    }

    // Helpers
    showModal(id) { document.getElementById(id).classList.remove('hidden'); }
    hideModal(id) { document.getElementById(id).classList.add('hidden'); }

    showLoading() {
        const grid = document.getElementById('repoGrid');
        grid.innerHTML = '<div class="skeleton-loader"></div>'.repeat(6);
    }

    hideLoading() { /* Already handled in renderRepos */ }

    formatNumber(num) {
        if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
        return num.toString();
    }

    getLangColor(lang) {
        const colors = {
            'JavaScript': '#f1e05a',
            'TypeScript': '#3178c6',
            'HTML': '#e34c26',
            'CSS': '#563d7c',
            'Python': '#3572A5',
            'Java': '#b07219',
            'Kotlin': '#A97BFF',
            'Rust': '#dea584',
            'Go': '#00ADD8',
            'C++': '#f34b7d',
            'C#': '#178600'
        };
        return colors[lang] || '#8B949E';
    }
}

// Launch app
document.addEventListener('DOMContentLoaded', () => {
    window.nexus = new GithubTracker();
});
