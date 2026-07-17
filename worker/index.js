const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } }); }
function clean(u) { return u.replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/\\x2F/g, '/'); }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const GOOGLE_SHEET_WEBHOOK = 'https://script.google.com/macros/s/AKfycbxwi4nUs-ak3a762iPjHWL0SuWcqUWm5vSZDJx67itRtilgvIb7EFRlPKBNl4SuD43Ecw/exec';

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
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
    } catch (e) {}
}

function parsePage(html, url) {
    const title = (html.match(/<title>([^<]+)<\/title>/) || [])[1] || '';
    const thumb = (html.match(/"thumbnailUrl"\s*:\s*"([^"]+)"/) || html.match(/"image_url"\s*:\s*"([^"]+)"/) || html.match(/property="og:image"\s+content="([^"]+)"/) || html.match(/name="twitter:image"\s+content="([^"]+)"/) || [])[1] || '';
    const fmts = [];

    if (url.includes('pornhub')) {
        parsePornhub(html, fmts);
    } else if (url.includes('xvideos')) {
        parseXvideos(html, fmts);
    } else if (url.includes('xnxx')) {
        parseXnxx(html, fmts);
    } else if (url.includes('xhamster')) {
        parseXhamster(html, fmts);
    } else if (url.includes('redtube')) {
        parseRedtube(html, fmts);
    } else if (url.includes('spankbang')) {
        parseSpankbang(html, fmts);
    } else if (url.includes('youporn') || url.includes('porntube')) {
        parseYouporn(html, fmts);
    } else if (url.includes('eporner')) {
        parseEporner(html, fmts);
    } else {
        parseGeneric(html, fmts);
    }

    if (fmts.length === 0) parseGeneric(html, fmts);

    const used = new Set();
    const result = [];
    for (const f of fmts) {
        const h = parseInt(f.quality) || 0;
        const key = (f.m3u8 || f.url || '') + '_' + h;
        if (!used.has(key)) {
            used.add(key);
            result.push({ quality: f.quality, label: h >= 720 ? 'HD' : 'SD', format: f.format, m3u8: f.m3u8 || null, url: f.url || null });
        }
    }
    result.sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));
    result.forEach((f, i) => { f.id = i; });

    return { title: title.replace(/\s*[-|]\s*(Pornhub|XVIDEOS|XNXX|xHamster|RedTube|SpankBang|YouPorn|EPorner).*$/gi, '').trim(), thumbnail: clean(thumb), formats: result };
}

function parsePornhub(html, fmts) {
    const fvIdx = html.indexOf('"mediaDefinitions"');
    if (fvIdx > -1) {
        const chunk = html.substring(fvIdx, fvIdx + 8000);
        const m = chunk.match(/"mediaDefinitions"\s*:\s*(\[[\s\S]*?\])\s*,\s*"(?:isVertical|video_unavailable)/);
        if (m) {
            try {
                const arr = JSON.parse(m[1].replace(/\\\//g, '/'));
                for (const item of arr) {
                    if (item.format === 'hls' && item.videoUrl) {
                        const q = parseInt(item.quality) || 0;
                        if (q > 0) fmts.push({ quality: q + 'p', m3u8: clean(item.videoUrl), format: 'HLS' });
                    }
                }
            } catch (e) {}
        }
    }
    if (fmts.length === 0) {
        const re = /"videoUrl"\s*:\s*"([^"]+\.m3u8[^"]*)"/gi;
        let mm;
        while ((mm = re.exec(html)) !== null) {
            const u = clean(mm[1]);
            const q = (u.match(/(\d+)P/) || [])[1] || '0';
            fmts.push({ quality: q + 'p', m3u8: u, format: 'HLS' });
        }
    }
}

function parseXvideos(html, fmts) {
    const patterns = [
        /setVideoUrl\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
        /html5player\.setVideoUrl\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
        /"video_url"\s*:\s*"([^"]+)"/g,
        /"videoUrl"\s*:\s*"([^"]+)"/g,
        /video_url['"]\s*:\s*['"]([^'"]+)['"]/g,
        /setVideoThumbURL\s*\(\s*['"]([^'"]+\.mp4[^'"]*)['"]\s*\)/g,
    ];
    const urls = [];
    for (const p of patterns) {
        let mm;
        while ((mm = p.exec(html)) !== null) {
            const u = clean(mm[1]);
            if (u.startsWith('http') && !u.match(/\.(jpg|png|gif|webp|css|js)/i) && !urls.includes(u)) urls.push(u);
        }
    }
    for (const u of urls) {
        const q = (u.match(/(\d+)p/i) || [])[1] || '0';
        fmts.push({ quality: parseInt(q) > 0 ? q + 'p' : 'Original', url: u, format: u.includes('.m3u8') ? 'HLS' : 'MP4' });
    }
}

function parseXnxx(html, fmts) {
    const patterns = [
        /setVideoUrl\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
        /html5player\.setVideoUrl\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
        /"video_url"\s*:\s*"([^"]+)"/g,
        /"videoUrl"\s*:\s*"([^"]+)"/g,
        /video_url['"]\s*:\s*['"]([^'"]+)['"]/g,
        /addVariable\s*\(\s*['"]video_url['"]\s*,\s*['"]([^'"]+)['"]\s*\)/g,
    ];
    const urls = [];
    for (const p of patterns) {
        let mm;
        while ((mm = p.exec(html)) !== null) {
            const u = clean(mm[1]);
            if (u.startsWith('http') && !u.match(/\.(jpg|png|gif|webp|css|js)/i) && !urls.includes(u)) urls.push(u);
        }
    }
    for (const u of urls) {
        const q = (u.match(/(\d+)p/i) || [])[1] || '0';
        fmts.push({ quality: parseInt(q) > 0 ? q + 'p' : 'Original', url: u, format: u.includes('.m3u8') ? 'HLS' : 'MP4' });
    }
}

function parseXhamster(html, fmts) {
    const patterns = [
        /xhplayer\s*\.\s*data\s*\(\s*\{[^}]*['"]file['"]\s*:\s*['"]([^'"]+)['"]/g,
        /file\s*:\s*['"](https?:\/\/[^'"]+\.mp4[^'"]*)['"]/g,
        /file\s*:\s*['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/g,
        /video_url\s*:\s*['"](https?:\/\/[^'"]+)['"]/g,
        /"videoUrl"\s*:\s*"([^"]+)"/g,
        /data-video-url\s*=\s*["']([^"']+\.mp4[^"']*)["']/g,
        /src\s*:\s*['"](https?:\/\/[^'"]+\.mp4[^'"]*)['"]/g,
    ];
    const urls = [];
    for (const p of patterns) {
        let mm;
        while ((mm = p.exec(html)) !== null) {
            const u = clean(mm[1]);
            if (u.startsWith('http') && !u.match(/\.(jpg|png|gif|webp|css|js)/i) && !urls.includes(u)) urls.push(u);
        }
    }
    for (const u of urls) {
        const q = (u.match(/(\d+)p/i) || [])[1] || '0';
        fmts.push({ quality: parseInt(q) > 0 ? q + 'p' : 'Original', url: u, format: u.includes('.m3u8') ? 'HLS' : 'MP4' });
    }
}

function parseRedtube(html, fmts) {
    const patterns = [
        /videoUrl\s*[:=]\s*['"]([^'"]+\.m3u8[^'"]*)['"]/g,
        /videoUrl\s*[:=]\s*['"]([^'"]+\.mp4[^'"]*)['"]/g,
        /"video_url"\s*:\s*"([^"]+)"/g,
        /"videoUrl"\s*:\s*"([^"]+)"/g,
        /setVideoUrl\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
        /mediaDefinition\s*\[\s*\d+\s*\]\s*\.videoUrl\s*=\s*['"]([^'"]+)['"]/g,
        /source\s+src=['"]([^'"]+\.mp4[^'"]*)['"]/g,
    ];
    const urls = [];
    for (const p of patterns) {
        let mm;
        while ((mm = p.exec(html)) !== null) {
            const u = clean(mm[1]);
            if (u.startsWith('http') && !u.match(/\.(jpg|png|gif|webp|css|js)/i) && !urls.includes(u)) urls.push(u);
        }
    }
    for (const u of urls) {
        const q = (u.match(/(\d+)p/i) || [])[1] || '0';
        fmts.push({ quality: parseInt(q) > 0 ? q + 'p' : 'Original', url: u, format: u.includes('.m3u8') ? 'HLS' : 'MP4' });
    }
}

function parseSpankbang(html, fmts) {
    const patterns = [
        /video_url\s*[:=]\s*['"]([^'"]+)['"]/g,
        /"videoUrl"\s*:\s*"([^"]+)"/g,
        /video_url_default\s*[:=]\s*['"]([^'"]+)['"]/g,
        /data-video\s*=\s*["']([^"']+)["']/g,
        /source\s+src=['"]([^'"]+)['"]/g,
        /file\s*:\s*['"](https?:\/\/[^'"]+)['"]/g,
    ];
    const urls = [];
    for (const p of patterns) {
        let mm;
        while ((mm = p.exec(html)) !== null) {
            const u = clean(mm[1]);
            if (u.startsWith('http') && !u.match(/\.(jpg|png|gif|webp|css|js)/i) && !urls.includes(u)) urls.push(u);
        }
    }
    for (const u of urls) {
        const q = (u.match(/(\d+)p/i) || [])[1] || '0';
        fmts.push({ quality: parseInt(q) > 0 ? q + 'p' : 'Original', url: u, format: u.includes('.m3u8') ? 'HLS' : 'MP4' });
    }
}

function parseYouporn(html, fmts) {
    const patterns = [
        /flashvars\.video_url\s*=\s*['"]([^'"]+)['"]/g,
        /video_url\s*[:=]\s*['"]([^'"]+)['"]/g,
        /"videoUrl"\s*:\s*"([^"]+)"/g,
        /setVideoUrl\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
        /source\s+src=['"]([^'"]+)['"]/g,
    ];
    const urls = [];
    for (const p of patterns) {
        let mm;
        while ((mm = p.exec(html)) !== null) {
            const u = clean(mm[1]);
            if (u.startsWith('http') && !u.match(/\.(jpg|png|gif|webp|css|js)/i) && !urls.includes(u)) urls.push(u);
        }
    }
    for (const u of urls) {
        const q = (u.match(/(\d+)p/i) || [])[1] || '0';
        fmts.push({ quality: parseInt(q) > 0 ? q + 'p' : 'Original', url: u, format: u.includes('.m3u8') ? 'HLS' : 'MP4' });
    }
}

function parseEporner(html, fmts) {
    const patterns = [
        /videoUrl\s*[:=]\s*['"]([^'"]+\.mp4[^'"]*)['"]/g,
        /"video_url"\s*:\s*"([^"]+\.mp4[^"]*)"/g,
        /source\s+src=['"]([^'"]+\.mp4[^'"]*)['"]/g,
        /file\s*:\s*['"](https?:\/\/[^'"]+\.mp4[^'"]*)['"]/g,
        /video_src\s*[:=]\s*['"]([^'"]+)['"]/g,
    ];
    const urls = [];
    for (const p of patterns) {
        let mm;
        while ((mm = p.exec(html)) !== null) {
            const u = clean(mm[1]);
            if (u.startsWith('http') && !u.match(/\.(jpg|png|gif|webp|css|js)/i) && !urls.includes(u)) urls.push(u);
        }
    }
    for (const u of urls) {
        const q = (u.match(/(\d+)p/i) || [])[1] || '0';
        fmts.push({ quality: parseInt(q) > 0 ? q + 'p' : 'Original', url: u, format: 'MP4' });
    }
}

function parseGeneric(html, fmts) {
    const patterns = [
        /setVideoUrl\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
        /html5player\.setVideoUrl\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
        /"video_url"\s*:\s*"([^"]+)"/g,
        /"videoUrl"\s*:\s*"([^"]+)"/g,
        /video_url['"]\s*:\s*['"]([^'"]+)['"]/g,
        /videoUrl\s*[:=]\s*['"]([^'"]+)['"]/g,
        /source\s+src=['"]([^'"]+\.mp4[^'"]*)['"]/g,
        /file\s*:\s*['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/g,
        /file\s*:\s*['"](https?:\/\/[^'"]+\.mp4[^'"]*)['"]/g,
        /src\s*:\s*['"](https?:\/\/[^'"]+\.mp4[^'"]*)['"]/g,
        /content\s*=\s*['"](https?:\/\/[^'"]+\.mp4[^'"]*)['"]/g,
    ];
    const urls = [];
    for (const p of patterns) {
        let mm;
        while ((mm = p.exec(html)) !== null) {
            const u = clean(mm[1]);
            if (u.startsWith('http') && !u.match(/\.(jpg|png|gif|webp|css|js|svg)/i) && !urls.includes(u)) urls.push(u);
        }
    }
    for (const u of urls) {
        const q = (u.match(/(\d+)p/i) || [])[1] || '0';
        fmts.push({ quality: parseInt(q) > 0 ? q + 'p' : 'Original', url: u, format: u.includes('.m3u8') ? 'HLS' : 'MP4' });
    }
}

function getSiteReferer(videoUrl) {
    if (videoUrl.includes('pornhub')) return 'https://www.pornhub.com/';
    if (videoUrl.includes('xvideos')) return 'https://www.xvideos.com/';
    if (videoUrl.includes('xnxx')) return 'https://www.xnxx.com/';
    if (videoUrl.includes('xhamster')) return 'https://xhamster.com/';
    if (videoUrl.includes('redtube')) return 'https://www.redtube.com/';
    if (videoUrl.includes('spankbang')) return 'https://spankbang.com/';
    if (videoUrl.includes('youporn')) return 'https://www.youporn.com/';
    if (videoUrl.includes('eporner')) return 'https://www.eporner.com/';
    if (videoUrl.includes('brazzers')) return 'https://www.brazzers.com/';
    return 'https://www.google.com/';
}

async function resolveM(masterUrl) {
    const mReferer = getSiteReferer(masterUrl);
    const r = await fetch(masterUrl, { headers: { 'User-Agent': UA, 'Referer': mReferer } });
    const t = await r.text();
    const lines = t.split('\n').map(l => l.trim()).filter(Boolean);
    const variants = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#EXT-X-STREAM-INF:')) {
            const next = lines[i + 1];
            if (next && !next.startsWith('#')) {
                const res = (lines[i].match(/RESOLUTION=\d+x(\d+)/) || [])[1] || '0';
                let vu = next;
                if (!vu.startsWith('http')) vu = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1) + vu;
                variants.push({ height: parseInt(res), url: vu });
            }
        }
    }
    variants.sort((a, b) => b.height - a.height);
    const target = variants.length > 0 ? variants[0].url : masterUrl;
    const r2 = await fetch(target, { headers: { 'User-Agent': UA, 'Referer': mReferer } });
    const t2 = await r2.text();
    const l2 = t2.split('\n').map(l => l.trim()).filter(Boolean);
    const base = target.substring(0, target.lastIndexOf('/') + 1);
    const segs = [];
    for (const l of l2) { if (!l.startsWith('#') && l) segs.push(l.startsWith('http') ? l : base + l); }
    return { segments: segs, quality: variants.length > 0 ? variants[0].height : 0 };
}

export default {
    async fetch(request) {
        const url = new URL(request.url);
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

        if (url.pathname === '/api/health') return json({ status: 'ok', worker: true, t: Date.now() });

        if (url.pathname === '/api/analyze' && request.method === 'POST') {
            try {
                const { url: videoUrl } = await request.json();
                if (!videoUrl) return json({ error: 'URL required' }, 400);
                const siteReferer = getSiteReferer(videoUrl);
                const resp = await fetch(videoUrl, { headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.5', 'Referer': siteReferer, 'Cookie': '' }, redirect: 'follow' });
                if (!resp.ok) return json({ error: 'Page fetch failed (' + resp.status + ')' }, 500);
                const html = await resp.text();
                const result = parsePage(html, videoUrl);
                if (result.formats.length === 0) return json({ error: 'No video sources found. Site may require authentication or uses protected streams.' }, 404);
                return json({ success: true, downloadId: crypto.randomUUID(), title: result.title || 'Unknown Video', thumbnail: result.thumbnail, originalUrl: videoUrl, formats: result.formats.slice(0, 10) });
            } catch (e) { return json({ error: e.message || 'Failed' }, 500); }
        }

        if (url.pathname === '/api/log-download' && request.method === 'POST') {
            try {
                const body = await request.json();
                const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'Unknown';
                const ua = request.headers.get('user-agent') || 'Unknown';
                const now = new Date();
                const row = {
                    timestamp: now.toISOString(),
                    date: now.toLocaleDateString('en-US'),
                    time: now.toLocaleTimeString('en-US'),
                    title: body.title || 'Unknown',
                    url: body.url || '',
                    quality: body.quality || '',
                    format: body.format || '',
                    device: parseDevice(ua),
                    browser: parseBrowser(ua),
                    os: parseOS(ua),
                    ip: ip,
                    uploader: body.uploader || '',
                    duration: body.duration || '',
                };
                logToSheet(row);
                return json({ success: true });
            } catch (e) { return json({ error: 'Failed' }, 500); }
        }

        if (url.pathname === '/api/segments' && request.method === 'POST') {
            try {
                const { m3u8 } = await request.json();
                if (!m3u8) return json({ error: 'm3u8 required' }, 400);
                const result = await resolveM(m3u8);
                if (!result.segments.length) return json({ error: 'No segments found' }, 404);
                return json({ success: true, segments: result.segments, totalSegments: result.segments.length, quality: result.quality });
            } catch (e) { return json({ error: e.message || 'Failed' }, 500); }
        }

        if (url.pathname === '/api/proxy' && request.method === 'GET') {
            try {
                const target = url.searchParams.get('url');
                if (!target) return json({ error: 'url required' }, 400);
                const decoded = decodeURIComponent(target);
                const proxyReferer = getSiteReferer(decoded);
                const resp = await fetch(decoded, { headers: { 'User-Agent': UA, 'Referer': proxyReferer }, redirect: 'follow' });
                return new Response(resp.body, { status: resp.status, headers: { 'Content-Type': resp.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400', ...CORS } });
            } catch { return json({ error: 'Proxy failed' }, 500); }
        }

        return json({ error: 'Not found' }, 404);
    }
};
