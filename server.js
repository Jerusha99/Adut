const express = require('express');
const { execFile, spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const publicPath = path.join(__dirname, 'public');
if (fs.existsSync(publicPath)) {
    app.use(express.static(publicPath));
}

const downloads = new Map();

const GOOGLE_SHEET_WEBHOOK = process.env.GOOGLE_SHEET_WEBHOOK || 'https://script.google.com/macros/s/AKfycbxwi4nUs-ak3a762iPjHWL0SuWcqUWm5vSZDJx67itRtilgvIb7EFRlPKBNl4SuD43Ecw/exec';

function parseDevice(ua) {
    if (/mobile|android|iphone|ipad/i.test(ua)) {
        if (/ipad/i.test(ua)) return 'iPad';
        if (/iphone/i.test(ua)) return 'iPhone';
        if (/android/i.test(ua)) return 'Android';
        return 'Mobile';
    }
    return 'Desktop';
}

function parseBrowser(ua) {
    if (/edg/i.test(ua)) return 'Edge';
    if (/chrome/i.test(ua) && !/edg/i.test(ua)) return 'Chrome';
    if (/firefox/i.test(ua)) return 'Firefox';
    if (/safari/i.test(ua) && !/chrome/i.test(ua)) return 'Safari';
    return 'Other';
}

function parseOS(ua) {
    if (/windows/i.test(ua)) return 'Windows';
    if (/mac os/i.test(ua)) return 'macOS';
    if (/linux/i.test(ua)) return 'Linux';
    if (/android/i.test(ua)) return 'Android';
    if (/iphone|ipad/i.test(ua)) return 'iOS';
    return 'Unknown';
}

async function logToSheet(data) {
    try {
        await fetch(GOOGLE_SHEET_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            redirect: 'follow',
        });
    } catch (e) {}
}

function findPythonYtDlp() {
    const commands = ['python', 'python3', 'py'];
    for (const cmd of commands) {
        try {
            require('child_process').execSync(
                `${cmd} -m yt_dlp --version`,
                { stdio: 'pipe', timeout: 10000, shell: true }
            );
            return cmd;
        } catch {}
    }
    return null;
}

const PYTHON = findPythonYtDlp();
console.log(PYTHON ? `yt-dlp via: ${PYTHON} -m yt_dlp` : 'WARNING: yt-dlp not found');

function runYtDlp(args, timeout = 30000) {
    return new Promise((resolve, reject) => {
        if (!PYTHON) return reject(new Error('yt-dlp not installed. Run: pip install yt-dlp'));
        const allArgs = ['-m', 'yt_dlp', ...args];
        let stdout = '', stderr = '';
        const proc = spawn(PYTHON, allArgs, {
            timeout,
            shell: true,
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        });
        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.stderr.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => {
            if (code === 0) resolve(stdout);
            else reject(new Error(stderr || `yt-dlp exited with code ${code}`));
        });
        proc.on('error', reject);
    });
}

app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) res.sendFile(indexPath);
    else res.json({ status: 'VideoGrab Pro API', version: '2.0' });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', ytdlp: !!PYTHON, timestamp: Date.now() });
});

app.post('/api/log-download', (req, res) => {
    try {
        const ua = req.headers['user-agent'] || 'Unknown';
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
        const now = new Date();
        const row = {
            timestamp: now.toISOString(),
            date: now.toLocaleDateString('en-US'),
            time: now.toLocaleTimeString('en-US'),
            title: req.body.title || 'Unknown',
            url: req.body.url || '',
            quality: req.body.quality || '',
            format: req.body.format || '',
            device: parseDevice(ua),
            browser: parseBrowser(ua),
            os: parseOS(ua),
            ip: ip,
            uploader: req.body.uploader || '',
            duration: req.body.duration || '',
        };
        logToSheet(row);
        res.json({ success: true });
    } catch (e) {
        res.json({ success: true });
    }
});

app.post('/api/analyze', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });

        console.log(`Analyzing: ${url}`);

        const infoJson = await runYtDlp(
            ['--dump-json', '--no-playlist', '--no-warnings', url],
            30000
        );
        const info = JSON.parse(infoJson);

        const title = info.title || info.fulltitle || 'Unknown';
        const thumbnail = info.thumbnail || (info.thumbnails && info.thumbnails.length > 0
            ? info.thumbnails[info.thumbnails.length - 1].url
            : '');
        const duration = info.duration || 0;
        const uploader = info.uploader || info.channel || '';

        const wantedHeights = [1080, 720, 360, 240, 144];
        const allFormats = info.formats || [];
        const formats = [];

        for (const targetH of wantedHeights) {
            const match = allFormats.find(
                (f) => f.height === targetH && f.vcodec !== 'none' && f.url
            ) || allFormats.find(
                (f) => f.height === targetH && f.url
            );

            if (match) {
                formats.push({
                    id: formats.length,
                    quality: targetH + 'p',
                    label: targetH === 1080 ? 'Full HD' : targetH === 720 ? 'HD' : targetH + 'p',
                    format: 'MP4',
                    url: match.url,
                    formatId: match.format_id,
                    ext: 'mp4',
                    width: match.width,
                    height: match.height,
                    filesize: match.filesize || match.filesize_approx || null,
                    fps: match.fps || null,
                });
            }
        }

        if (formats.length === 0) {
            const fallback = allFormats
                .filter((f) => f.vcodec !== 'none' && f.url)
                .sort((a, b) => (b.height || 0) - (a.height || 0));

            const seen = new Set();
            for (const f of fallback) {
                const h = f.height || 0;
                if (h > 0 && !seen.has(h)) {
                    seen.add(h);
                    formats.push({
                        id: formats.length,
                        quality: h + 'p',
                        label: h >= 1080 ? 'Full HD' : h >= 720 ? 'HD' : h + 'p',
                        format: 'MP4',
                        url: f.url,
                        formatId: f.format_id,
                        ext: 'mp4',
                        width: f.width,
                        height: f.height,
                        filesize: f.filesize || f.filesize_approx || null,
                        fps: f.fps || null,
                    });
                }
            }
            formats.forEach((f, i) => { f.id = i; });
        }

        if (formats.length === 0) {
            return res.status(404).json({ error: 'No MP4 formats found.' });
        }

        const downloadId = uuidv4();
        downloads.set(downloadId, {
            title, thumbnail, formats, originalUrl: url, uploader, duration,
            createdAt: Date.now(),
        });

        console.log(`Found ${formats.length} formats: ${title}`);

        res.json({
            success: true,
            downloadId, title, thumbnail, uploader, duration,
            formats: formats.map((f) => ({
                id: f.id, quality: f.quality, label: f.label,
                format: f.format, filesize: f.filesize, fps: f.fps,
            })),
        });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({
            error: error.message.includes('Unsupported')
                ? 'Site not supported'
                : 'Failed to analyze URL',
        });
    }
});

app.get('/api/download/:downloadId/:formatId', async (req, res) => {
    try {
        const { downloadId, formatId } = req.params;
        const data = downloads.get(downloadId);
        if (!data) return res.status(404).json({ error: 'Session expired' });

        const format = data.formats.find((f) => f.id === parseInt(formatId));
        if (!format) return res.status(404).json({ error: 'Format not found' });

        const safeName = data.title.replace(/[^a-zA-Z0-9\s\-_]/g, '').substring(0, 80) || 'video';
        const filename = `${safeName}_${format.quality}.mp4`;

        console.log(`Proxying download: ${filename}`);

        const proto = format.url.startsWith('https') ? https : http;
        const proxyReq = proto.get(format.url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.google.com/',
            },
            timeout: 120000,
        }, (proxyRes) => {
            if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
                const redirProto = proxyRes.headers.location.startsWith('https') ? https : http;
                redirProto.get(proxyRes.headers.location, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                }, (r) => {
                    res.setHeader('Content-Type', 'video/mp4');
                    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                    if (r.headers['content-length']) res.setHeader('Content-Length', r.headers['content-length']);
                    r.pipe(res);
                });
                return;
            }
            res.setHeader('Content-Type', 'video/mp4');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            if (proxyRes.headers['content-length']) res.setHeader('Content-Length', proxyRes.headers['content-length']);
            proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
            console.error('Proxy error:', err.message);
            if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
        });
    } catch (error) {
        if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
    }
});

setInterval(() => {
    const now = Date.now();
    for (const [key, data] of downloads) {
        if (now - data.createdAt > 3600000) downloads.delete(key);
    }
}, 600000);

app.listen(PORT, () => {
    console.log(`\n  VideoGrab Pro running at http://localhost:${PORT}\n`);
});
