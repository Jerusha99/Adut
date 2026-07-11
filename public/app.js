const App = {
    currentData: null,
    pendingDownloadId: null,
    pendingFormatId: null,
    adWatched: false,
    adTimer: null,
    adDuration: 5,
    history: JSON.parse(localStorage.getItem('vg_history') || '[]'),
    stats: { downloads: parseInt(localStorage.getItem('vg_downloads') || '0') },
    nativeAdShown: 0,

    init() {
        this.renderHistory();
        this.updateStats();
        this.bindEvents();
        this.checkHealth();
    },

    apiBase() {
        return window.APP_CONFIG && window.APP_CONFIG.API_URL ? window.APP_CONFIG.API_URL : '';
    },

    async checkHealth() {
        try {
            const r = await fetch(this.apiBase() + '/api/health');
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
        document.getElementById('searchBtn').addEventListener('click', () => this.analyze());
        document.getElementById('searchInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.analyze();
        });
        document.getElementById('pasteBtn').addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                document.getElementById('searchInput').value = text;
                document.getElementById('searchInput').focus();
                this.showToast('Pasted', 'info');
            } catch {
                this.showToast('Check clipboard permissions', 'error');
            }
        });
        document.getElementById('searchInput').addEventListener('input', (e) => {
            document.getElementById('pasteBtn').style.display = e.target.value ? 'none' : 'flex';
        });
        document.getElementById('adSkipBtn').addEventListener('click', () => this.onAdComplete());
        document.getElementById('nativeAdClose').addEventListener('click', () => {
            document.getElementById('nativeAdModal').style.display = 'none';
        });
    },

    async analyze() {
        const input = document.getElementById('searchInput');
        const btn = document.getElementById('searchBtn');
        const url = input.value.trim();
        if (!url) { this.showToast('Enter a video URL', 'error'); input.focus(); return; }

        btn.classList.add('loading');
        btn.disabled = true;
        document.getElementById('dashboard').classList.remove('active');

        try {
            const resp = await fetch(this.apiBase() + '/api/analyze', {
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

            document.getElementById('adMiddleBanner').style.display = 'block';

            this.nativeAdShown++;
            if (this.nativeAdShown % 3 === 0) {
                setTimeout(() => this.showNativeAd(), 2000);
            }
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
            img.src = this.apiBase() + '/api/proxy?url=' + encodeURIComponent(data.thumbnail);
            img.style.display = 'block';
            noPrev.style.display = 'none';
        } else {
            img.style.display = 'none';
            noPrev.style.display = 'flex';
        }

        document.getElementById('videoTitle').textContent = data.title;
        document.getElementById('videoUrl').textContent = data.originalUrl;
        document.getElementById('uploader').textContent = data.uploader || 'Unknown';
        document.getElementById('duration').textContent = data.duration ? this.fmtDuration(data.duration) : '--';
        document.getElementById('totalFormats').textContent = data.formats.length;
        document.getElementById('formatCount').textContent = data.formats.length + ' quality options';
        document.getElementById('statusBadge').textContent = 'Ready';
        document.getElementById('statusBadge').style.color = 'var(--success)';

        const list = document.getElementById('formatList');
        list.innerHTML = '';
        data.formats.forEach((format, idx) => {
            const badgeClass = this.getBadgeClass(format.quality);
            const size = format.filesize ? this.fmtSize(format.filesize) : '';
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
                    &#8595; Download
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
        this.pendingDownloadId = this.currentData.downloadId;
        this.pendingFormatId = formatId;
        this.showRewardedAd();
    },

    showRewardedAd() {
        if (this.adWatched) {
            this.startDownload();
            return;
        }

        const modal = document.getElementById('rewardedModal');
        modal.style.display = 'flex';
        this.startAdCountdown();
    },

    startAdCountdown() {
        let remaining = this.adDuration;
        const countdown = document.getElementById('adCountdown');
        const skipTimer = document.getElementById('adSkipTimer');
        const skipText = document.getElementById('adSkipText');
        const skipBtn = document.getElementById('adSkipBtn');
        const progressFill = document.getElementById('adProgressFill');
        const placeholder = document.getElementById('adVideoPlaceholder');

        placeholder.classList.remove('hidden');
        countdown.textContent = remaining;
        skipTimer.textContent = remaining;
        skipBtn.disabled = true;
        skipText.innerHTML = `Skip in <span id="adSkipTimer">${remaining}</span>s`;
        progressFill.style.width = '0%';

        this.adTimer = setInterval(() => {
            remaining--;
            const c = document.getElementById('adCountdown');
            const s = document.getElementById('adSkipTimer');
            if (c) c.textContent = remaining;
            if (s) s.textContent = remaining;

            const pct = ((this.adDuration - remaining) / this.adDuration) * 100;
            progressFill.style.width = pct + '%';

            if (remaining <= 0) {
                clearInterval(this.adTimer);
                placeholder.classList.add('hidden');
                skipBtn.disabled = false;
                skipText.innerHTML = 'Download Now';
            }
        }, 1000);
    },

    onAdComplete() {
        const btn = document.getElementById('adSkipBtn');
        if (btn.disabled) return;

        document.getElementById('rewardedModal').style.display = 'none';
        clearInterval(this.adTimer);
        this.adWatched = true;

        this.showToast('Ad watched! Starting download...', 'success');
        this.startDownload();

        setTimeout(() => { this.adWatched = false; }, 60000);
    },

    startDownload() {
        if (!this.pendingDownloadId || this.pendingFormatId === null) return;

        const format = this.currentData.formats.find(f => f.id === this.pendingFormatId);
        if (!format) return;

        this.showToast(`Downloading ${format.quality} MP4...`, 'info');
        this.stats.downloads++;
        localStorage.setItem('vg_downloads', this.stats.downloads);
        this.updateStats();

        const link = document.createElement('a');
        link.href = this.apiBase() + `/api/download/${this.pendingDownloadId}/${this.pendingFormatId}`;
        link.download = '';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        this.pendingDownloadId = null;
        this.pendingFormatId = null;

        this.showNativeAd();
    },

    showNativeAd() {
        const affiliates = [
            { img: 'https://placehold.co/500x300/1a1a2e/ff6b9d?text=Live+Cams+-+Chat+Now', url: 'https://www.chaturbate.com/in/?track=default&c_=landing_page_5', label: 'Live Cams' },
            { img: 'https://placehold.co/500x300/1a1a2e/8b5cf6?text=Premium+Shows', url: 'https://www.livejasmin.com/?ref=8026538&clickurl=//www.livejasmin.com/webcamModelGalleryPage.html', label: 'Premium Shows' },
            { img: 'https://placehold.co/500x300/1a1a2e/06b6d4?text=Find+Local+Dates', url: 'https://www.flirt4free.com/?s=1&a=113435', label: 'Dating' },
            { img: 'https://placehold.co/500x300/1a1a2e/ec4899?text=Hot+Singles+Near+You', url: 'https://www.adultfriendfinder.com/go/page2985.js?aff_id=12345', label: 'Dating Site' },
        ];

        const ad = affiliates[Math.floor(Math.random() * affiliates.length)];
        const modal = document.getElementById('nativeAdModal');
        const content = document.getElementById('nativeAdContent');
        content.innerHTML = `
            <a href="${ad.url}" target="_blank" rel="noopener">
                <img src="${ad.img}" alt="${ad.label}" style="width:100%;height:auto;border-radius:12px;">
                <div style="text-align:center;padding:12px;font-size:14px;font-weight:600;color:var(--accent);">${ad.label} - Click Here</div>
            </a>
        `;
        modal.style.display = 'flex';

        setTimeout(() => {
            if (modal.style.display === 'flex') modal.style.display = 'none';
        }, 8000);
    },

    addToHistory(data) {
        const item = {
            title: data.title,
            thumbnail: data.thumbnail,
            url: data.originalUrl,
            time: new Date().toISOString(),
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
                <img class="history-thumb" src="${item.thumbnail ? App.apiBase() + '/api/proxy?url=' + encodeURIComponent(item.thumbnail) : ''}"
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
        setTimeout(() => { toast.classList.add('toast-exit'); setTimeout(() => toast.remove(), 300); }, 3500);
    },

    fmtDuration(s) {
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
        return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
    },
    fmtSize(bytes) {
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
        const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML;
    },
};

document.addEventListener('DOMContentLoaded', () => App.init());
