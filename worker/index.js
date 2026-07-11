const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } }); }
function clean(u) { return u.replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/\\x2F/g, '/'); }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function parsePage(html, url) {
    const title = (html.match(/<title>([^<]+)<\/title>/) || [])[1] || '';
    const thumb = (html.match(/"thumbnailUrl"\s*:\s*"([^"]+)"/) || html.match(/"image_url"\s*:\s*"([^"]+)"/) || [])[1] || '';
    const fmts = [];

    if (url.includes('pornhub')) {
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
    } else {
        const patterns = [/setVideoUrl\s*\(\s*['"]([^'"]+)['"]\s*\)/g, /html5player\.setVideoUrl\s*\(\s*['"]([^'"]+)['"]\s*\)/g, /"video_url"\s*:\s*"([^"]+)"/g, /"videoUrl"\s*:\s*"([^"]+)"/g];
        const urls = [];
        for (const p of patterns) { let mm; while ((mm = p.exec(html)) !== null) { const u = clean(mm[1]); if (u.startsWith('http') && !u.match(/\.(jpg|png|gif|webp)/) && !urls.includes(u)) urls.push(u); } }
        for (const u of urls) {
            const q = (u.match(/(\d+)p/i) || [])[1] || '0';
            fmts.push({ quality: parseInt(q) > 0 ? q + 'p' : 'Original', url: u, format: 'MP4' });
        }
    }

    const wanted = [1080, 720, 480, 360, 240, 144];
    const used = new Set();
    const result = [];
    for (const f of fmts) {
        const h = parseInt(f.quality) || 0;
        const key = f.m3u8 ? 'hls_' + h : 'mp4_' + h;
        if (!used.has(key)) { used.add(key); result.push({ quality: f.quality, label: h >= 720 ? 'HD' : 'SD', format: f.format, m3u8: f.m3u8 || null, url: f.url || null }); }
    }
    result.sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));
    result.forEach((f, i) => { f.id = i; });

    return { title: title.replace(/ - Pornhub\.com| - XVIDEOS| - XNXX| - xHamster| - RedTube/gi, '').trim(), thumbnail: clean(thumb), formats: result };
}

async function resolveM(masterUrl) {
    const r = await fetch(masterUrl, { headers: { 'User-Agent': UA, 'Referer': 'https://www.pornhub.com/' } });
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
    const r2 = await fetch(target, { headers: { 'User-Agent': UA, 'Referer': 'https://www.pornhub.com/' } });
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
                const resp = await fetch(videoUrl, { headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.5', 'Referer': 'https://www.google.com/' }, redirect: 'follow' });
                if (!resp.ok) return json({ error: 'Page fetch failed (' + resp.status + ')' }, 500);
                const html = await resp.text();
                const result = parsePage(html, videoUrl);
                if (result.formats.length === 0) return json({ error: 'No video sources found' }, 404);
                return json({ success: true, downloadId: crypto.randomUUID(), title: result.title || 'Unknown Video', thumbnail: result.thumbnail, originalUrl: videoUrl, formats: result.formats.slice(0, 10) });
            } catch (e) { return json({ error: e.message || 'Failed' }, 500); }
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
                const resp = await fetch(decodeURIComponent(target), { headers: { 'User-Agent': UA, 'Referer': 'https://www.pornhub.com/' }, redirect: 'follow' });
                return new Response(resp.body, { status: resp.status, headers: { 'Content-Type': resp.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400', ...CORS } });
            } catch { return json({ error: 'Proxy failed' }, 500); }
        }

        return json({ error: 'Not found' }, 404);
    }
};
