const App = {
    currentData: null,
    history: JSON.parse(localStorage.getItem('vg_history') || '[]'),
    stats: { downloads: parseInt(localStorage.getItem('vg_downloads') || '0') },

    init() {
        this.renderHistory();
        this.updateStats();
        this.bindEvents();
        this.checkHealth();
    },

    async checkHealth() {
        try {
            const r = await fetch('/api/health');
            if (r.ok) {
                const d = await r.json();
                if (d.ytdlp) this.setStatus('System Ready', 'var(--success)');
                else this.setStatus('yt-dlp not found', 'var(--danger)');
            }
        } catch {
            this.setStatus('Server offline', 'var(--danger)');
        }
    },

    setStatus(text, color) {
        const el = document.getElementById('systemStatus');
        if (el) { el.textContent = text; el.style.color = color; }
    },

    bindEvents() {
        const input = document.getElementById('searchInput');
        const btn = document.getElementById('searchBtn');
        const pasteBtn = document.getElementById('pasteBtn');

        btn.addEventListener('click', () => this.analyze());
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.analyze();
        });
        pasteBtn.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                input.value = text;
                input.focus();
                this.showToast('Pasted from clipboard', 'info');
            } catch {
                this.showToast('Check clipboard permissions', 'error');
            }
        });
        input.addEventListener('input', () => {
            pasteBtn.style.display = input.value ? 'none' : 'flex';
        });
    },

    async analyze() {
        const input = document.getElementById('searchInput');
        const btn = document.getElementById('searchBtn');
        const url = input.value.trim();

        if (!url) {
            this.showToast('Enter a video URL', 'error');
            input.focus();
            return;
        }

        btn.classList.add('loading');
        btn.disabled = true;
        document.getElementById('dashboard').classList.remove('active');

        try {
            const resp = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Failed');

            this.currentData = data;
            this.renderDashboard(data);
            this.addToHistory(data);
            this.showToast('Video analyzed!', 'success');
        } catch (err) {
            this.showToast(err.message, 'error');
        } finally {
            btn.classList.remove('loading');
            btn.disabled = false;
        }
    },

    renderDashboard(data) {
        const dash = document.getElementById('dashboard');
        dash.classList.add('active');

        const img = document.getElementById('previewImg');
        const noPrev = document.getElementById('noPreview');
        if (data.thumbnail) {
            img.src = '/api/proxy?url=' + encodeURIComponent(data.thumbnail);
            img.style.display = 'block';
            noPrev.style.display = 'none';
        } else {
            img.style.display = 'none';
            noPrev.style.display = 'flex';
        }

        document.getElementById('videoTitle').textContent = data.title;
        document.getElementById('videoUrl').textContent = data.originalUrl;
        document.getElementById('uploader').textContent = data.uploader || 'Unknown';
        document.getElementById('duration').textContent = data.duration ? this.formatDuration(data.duration) : '--';
        document.getElementById('totalFormats').textContent = data.formats.length;
        document.getElementById('formatCount').textContent = data.formats.length + ' quality options';
        document.getElementById('statusBadge').textContent = 'Ready';
        document.getElementById('statusBadge').style.color = 'var(--success)';

        const list = document.getElementById('formatList');
        list.innerHTML = '';

        data.formats.forEach((format, idx) => {
            const badgeClass = this.getBadgeClass(format.quality);
            const size = format.filesize ? this.formatSize(format.filesize) : '';
            const item = document.createElement('div');
            item.className = 'format-item';
            item.style.animation = `fadeInUp 0.4s ease-out ${idx * 0.08}s both`;
            item.innerHTML = `
                <div class="format-left">
                    <span class="format-badge ${badgeClass}">${format.quality}</span>
                    <div class="format-info">
                        <span class="format-quality">${format.label} - ${format.format}</span>
                        <span class="format-type">${size}${format.fps ? ' - ' + format.fps + 'fps' : ''}</span>
                    </div>
                </div>
                <button class="format-dl-btn" onclick="App.download(${format.id})">
                    Download
                </button>
            `;
            list.appendChild(item);
        });

        dash.scrollIntoView({ behavior: 'smooth', block: 'start' });
        this.updateStats();
    },

    getBadgeClass(quality) {
        const h = parseInt(quality);
        if (h >= 1080) return 'fhd';
        if (h >= 720) return 'hd';
        if (h >= 360) return 'sd';
        return 'other';
    },

    download(formatId) {
        if (!this.currentData) return;
        const format = this.currentData.formats.find(f => f.id === formatId);
        if (!format) return;

        this.showToast(`Downloading ${format.quality} MP4...`, 'info');
        this.stats.downloads++;
        localStorage.setItem('vg_downloads', this.stats.downloads);
        this.updateStats();

        const link = document.createElement('a');
        link.href = `/api/download/${this.currentData.downloadId}/${formatId}`;
        link.download = '';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    addToHistory(data) {
        const item = {
            title: data.title,
            thumbnail: data.thumbnail,
            url: data.originalUrl,
            time: new Date().toISOString(),
            downloadId: data.downloadId,
        };
        this.history.unshift(item);
        if (this.history.length > 30) this.history.pop();
        localStorage.setItem('vg_history', JSON.stringify(this.history));
        this.renderHistory();
    },

    renderHistory() {
        const list = document.getElementById('historyList');
        if (!list) return;

        if (this.history.length === 0) {
            list.innerHTML = '<div class="empty-state"><div class="icon">&#9654;</div><p>No history yet</p></div>';
            return;
        }

        list.innerHTML = this.history.map((item, i) => `
            <div class="history-item" style="animation: fadeInUp 0.3s ease-out ${i * 0.04}s both"
                 onclick="document.getElementById('searchInput').value='${item.url}'; App.analyze();">
                <img class="history-thumb" src="${item.thumbnail ? '/api/proxy?url=' + encodeURIComponent(item.thumbnail) : ''}"
                     onerror="this.style.display='none'" alt="">
                <div class="history-info">
                    <div class="history-name">${this.esc(item.title)}</div>
                    <div class="history-time">${this.timeAgo(item.time)}</div>
                </div>
            </div>
        `).join('');
    },

    updateStats() {
        const el = (id) => document.getElementById(id);
        if (el('statDownloads')) el('statDownloads').textContent = this.stats.downloads;
        if (el('statDownloads2')) el('statDownloads2').textContent = this.stats.downloads;
        if (el('statFormats')) el('statFormats').textContent = this.currentData ? this.currentData.formats.length : 0;
    },

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const icons = { success: '&#10003;', error: '&#10007;', info: '&#8505;' };
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('toast-exit');
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    },

    formatDuration(s) {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = Math.floor(s % 60);
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        return `${m}:${String(sec).padStart(2, '0')}`;
    },

    formatSize(bytes) {
        if (!bytes) return '';
        const mb = bytes / (1024 * 1024);
        return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
    },

    timeAgo(dateStr) {
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
    },

    esc(str) {
        const d = document.createElement('div');
        d.textContent = str || '';
        return d.innerHTML;
    },
};

document.addEventListener('DOMContentLoaded', () => App.init());
