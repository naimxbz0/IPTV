const AppState = (function () {
    // Single Global State
    const state = {
        matches: [],
        channels: [],
        currentTheme: localStorage.getItem('xbz_theme') || 'dark',
        player: null,
        apiCache: { matches: null, timestamp: 0 }
    };

    // DOM Elements Cached
    const DOM = {
        themeToggle: document.getElementById('theme-toggle'),
        hamburger: document.getElementById('hamburger'),
        sidebar: document.getElementById('sidebar'),
        overlay: document.getElementById('sidebar-overlay'),
        closeSidebar: document.getElementById('close-sidebar'),
        refreshBtn: document.getElementById('refresh-btn'),
        playCustomBtn: document.getElementById('play-custom'),
        customUrlInput: document.getElementById('custom-url'),
        matchGrid: document.getElementById('match-grid'),
        channelList: document.getElementById('channel-list'),
        toastContainer: document.getElementById('toast-container'),
        liveCount: document.getElementById('live-count')
    };

    // Configuration
    const CONFIG = {
        FOOTBALL_API: 'https://api.football-data.org/v4/matches',
        API_KEY: '1343f48af11546bd8be28141f72e8739',
        PLAYLIST_URL: 'https://raw.githubusercontent.com/naimxbzbd/XBZ-Prime-TV/refs/heads/main/fifa.m3u'
    };

    // Initialize Application
    function init() {
        console.log("⚽ XBZ Prime TV Initializing...");
        applyTheme(state.currentTheme);
        initPlayer();
        bindEvents();
        fetchChannels();
        fetchMatches();
    }

    // 1. Core Systems & UI
    function bindEvents() {
        DOM.themeToggle.addEventListener('click', toggleTheme);
        DOM.hamburger.addEventListener('click', () => toggleSidebar(true));
        DOM.closeSidebar.addEventListener('click', () => toggleSidebar(false));
        DOM.overlay.addEventListener('click', () => toggleSidebar(false));
        DOM.refreshBtn.addEventListener('click', fetchMatches);
        
        DOM.playCustomBtn.addEventListener('click', () => {
            const url = DOM.customUrlInput.value.trim();
            if(url) playStream(url);
            else showToast('Please enter a valid URL', 'error');
        });

        // Keyboard Accessibility
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') toggleSidebar(false);
            if (e.ctrlKey && e.key === 'r') {
                e.preventDefault();
                fetchMatches();
            }
            if (e.key === 'Enter' && document.activeElement === DOM.customUrlInput) {
                DOM.playCustomBtn.click();
            }
        });
    }

    function toggleTheme() {
        state.currentTheme = state.currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(state.currentTheme);
        localStorage.setItem('xbz_theme', state.currentTheme);
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        DOM.themeToggle.innerHTML = theme === 'dark' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
    }

    function toggleSidebar(show) {
        if (show) {
            DOM.sidebar.classList.add('open');
            DOM.overlay.classList.add('active');
        } else {
            DOM.sidebar.classList.remove('open');
            DOM.overlay.classList.remove('active');
        }
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast brutal-box toast-${type}`;
        toast.innerHTML = `<i class="fas fa-info-circle"></i> ${message}`;
        DOM.toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // 2. Video Player Integration
    function initPlayer() {
        try {
            state.player = videojs('xbz-player', {
                fluid: true,
                playbackRates: [0.5, 1, 1.5, 2]
            });
            console.log("📺 Player Ready");
        } catch (error) {
            console.error("Player Init Error:", error);
            showToast("Player failed to load.", "error");
        }
    }

    function playStream(url) {
        if (!state.player) return;
        const type = url.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4';
        state.player.src({ src: url, type: type });
        state.player.play();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        showToast("Loading Stream...");
    }

    // 3. M3U Parser System
    async function fetchChannels() {
        try {
            const response = await fetch(CONFIG.PLAYLIST_URL);
            if (!response.ok) throw new Error("Failed to fetch playlist");
            const rawM3u = await response.text();
            parseM3U(rawM3u);
        } catch (error) {
            console.error(error);
            showToast("Failed to load channel list", "error");
        }
    }

    function parseM3U(data) {
        const lines = data.split('\n');
        const channels = [];
        let currentChannel = {};

        lines.forEach(line => {
            line = line.trim();
            if (line.startsWith('#EXTINF:')) {
                // Extract Name
                const commaIndex = line.lastIndexOf(',');
                currentChannel.name = commaIndex !== -1 ? line.substring(commaIndex + 1).trim() : 'Unknown Channel';
                
                // Extract Quality/Tags
                currentChannel.is4K = line.includes('4K');
                currentChannel.isHD = line.includes('1080p') || line.includes('HD');
            } else if (line && !line.startsWith('#')) {
                currentChannel.url = line;
                currentChannel.id = 'ch_' + Math.random().toString(36).substr(2, 9);
                channels.push({...currentChannel});
                currentChannel = {};
            }
        });

        state.channels = channels;
        renderChannels();
    }

    function renderChannels() {
        DOM.channelList.innerHTML = state.channels.map(ch => `
            <div class="brutal-box" style="padding: 15px; cursor: pointer;" onclick="AppState.playStream('${ch.url}')">
                <div style="display: flex; justify-content: space-between;">
                    <strong><i class="fas fa-tv"></i> ${ch.name}</strong>
                    <span style="color: var(--accent-red); font-weight: bold; font-size: 0.8rem;">
                        ${ch.is4K ? '4K' : ch.isHD ? 'HD' : 'SD'}
                    </span>
                </div>
            </div>
        `).join('');
    }

    // 4. Football API System
    async function fetchMatches() {
        // 10-second cache check
        if (state.apiCache.matches && (Date.now() - state.apiCache.timestamp < 10000)) {
            renderMatches(state.apiCache.matches);
            return;
        }

        try {
            const response = await fetch(CONFIG.FOOTBALL_API, {
                headers: { 'X-Auth-Token': CONFIG.API_KEY }
            });
            
            if (response.status === 429) {
                showToast("API Rate limit reached. Using cached data.", "error");
                return;
            }

            const data = await response.json();
            state.apiCache = { matches: data.matches, timestamp: Date.now() };
            renderMatches(data.matches);
        } catch (error) {
            console.error("API Error:", error);
            showToast("Failed to fetch live matches.", "error");
        }
    }

    function renderMatches(matches) {
        if (!matches || matches.length === 0) {
            DOM.matchGrid.innerHTML = `<div class="brutal-box" style="padding: 20px;">No matches right now.</div>`;
            return;
        }

        const liveMatches = matches.filter(m => m.status === 'IN_PLAY' || m.status === 'PAUSED');
        DOM.liveCount.innerText = liveMatches.length;

        DOM.matchGrid.innerHTML = matches.slice(0, 10).map(match => `
            <div class="brutal-box" style="padding: 15px; display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-secondary);">
                    <span>${match.competition.name}</span>
                    <span style="color: ${match.status === 'IN_PLAY' ? 'var(--accent-red)' : ''}">${match.status}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; font-weight: bold;">
                    <span>${match.homeTeam.shortName || match.homeTeam.name}</span>
                    <span>${match.score.fullTime.home ?? '-'} : ${match.score.fullTime.away ?? '-'}</span>
                    <span>${match.awayTeam.shortName || match.awayTeam.name}</span>
                </div>
                <button class="brutal-btn" style="width: 100%; margin-top: 10px;" onclick="AppState.autoLinkChannel('${match.competition.name}')">
                    <i class="fas fa-play-circle"></i> Watch Match
                </button>
            </div>
        `).join('');
    }

    function autoLinkChannel(leagueName) {
        // Simple fallback mapping to M3U
        if (state.channels.length > 0) {
            showToast(`Opening stream for ${leagueName}`);
            playStream(state.channels[0].url); // Fallback to first channel per rules
        } else {
            showToast("No channels loaded yet.", "error");
        }
    }

    // Cleanup on unload
    window.addEventListener('beforeunload', () => {
        if(state.player) state.player.dispose();
    });

    // Public API
    return {
        init,
        playStream,
        autoLinkChannel
    };

})();

// Boot App
document.addEventListener('DOMContentLoaded', AppState.init);
