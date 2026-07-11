const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS },
    });
}

function cleanUrl(u) {
    return u.replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/\\x2F/g, '/');
}

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
};

function extractPornhub(html) {
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1].replace(/ - Pornhub\.com/i, '').trim() : '';
    const thumbMatch = html.match(/"thumbnailUrl"\s*:\s*"([^"]+)"/) || html.match(/"image_url"\s*:\s*"([^"]+)"/);
    const thumb = thumbMatch ? cleanUrl(thumbMatch[1]) : '';

    const qualities = [];

    const fvIdx = html.indexOf('"mediaDefinitions"');
    if (fvIdx !== -1) {
        const chunk = html.substring(fvIdx, fvIdx + 5000);
        const mediaMatch = chunk.match(/"mediaDefinitions"\s*:\s*(\[.*?\])\s*,\s*"(?:isVertical|video_unavailable)/s);
        if (mediaMatch) {
            try {
                const mediaArr = JSON.parse(mediaMatch[1].replace(/\\\//g, '/'));
                for (const item of mediaArr) {
                    if (item.format === 'hls' && item.videoUrl) {
                        const q = parseInt(item.quality) || 0;
                        if (q > 0) {
                            qualities.push({
                                quality: q,
                                label: q >= 720 ? 'HD' : 'SD',
                                m3u8: cleanUrl(item.videoUrl),
                                format: 'HLS',
                            });
                        }
                    }
                }
            } catch (e) {}
        }
    }

    if (qualities.length === 0) {
        const urls = [];
        const patterns = [
            /"videoUrl"\s*:\s*"([^"]+master\.m3u8[^"]*)"/gi,
            /video_url\s*[=:]\s*["']([^"']+\.m3u8[^"']*)["']/gi,
        ];
        for (const p of patterns) {
            let m;
            while ((m = p.exec(html)) !== null) {
                const u = cleanUrl(m[1]);
                if (u.startsWith('http') && !urls.includes(u)) {
                    urls.push(u);
                    const qMatch = u.match(/(\d+)P/);
                    const q = qMatch ? parseInt(qMatch[1]) : 0;
                    qualities.push({
                        quality: q,
                        label: q >= 720 ? 'HD' : 'SD',
                        m3u8: u,
                        format: 'HLS',
                    });
                }
            }
        }
    }

    qualities.sort((a, b) => b.quality - a.quality);
    qualities.forEach((q, i) => { q.id = i; });

    return { title, thumbnail: thumb, qualities };
}

function extractXvideos(html) {
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1].replace(/ - XVIDEOS\.COM/i, '').trim() : '';
    const thumbMatch = html.match(/"thumbnailUrl"\s*:\s*"([^"]+)"/);
    const thumb = thumbMatch ? cleanUrl(thumbMatch[1]) : '';

    const urls = [];
    const patterns = [
        /setVideoUrl\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
        /html5player\.setVideoUrl\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];
    for (const p of patterns) {
        let m;
        while ((m = p.exec(html)) !== null) {
            const u = cleanUrl(m[1]);
            if (u.startsWith('http') && !u.includes('.jpg') && !u.includes('.png') && !urls.includes(u)) {
                urls.push(u);
            }
        }
    }

    const qualities = urls.map((u, i) => {
        const qMatch = u.match(/(\d+p)/i);
        const q = qMatch ? parseInt(qMatch[1]) : 0;
        return { quality: q, label: q >= 720 ? 'HD' : 'SD', url: u, format: 'MP4', id: i };
    });

    return { title, thumbnail: thumb, qualities };
}

function extractXnxx(html) {
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1].replace(/ - XNXX\.COM/i, '').trim() : '';
    const thumbMatch = html.match(/"thumbnailUrl"\s*:\s*"([^"]+)"/);
    const thumb = thumbMatch ? cleanUrl(thumbMatch[1]) : '';

    const urls = [];
    const patterns = [
        /setVideoUrl\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
        /html5player\.setVideoUrl\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];
    for (const p of patterns) {
        let m;
        while ((m = p.exec(html)) !== null) {
            const u = cleanUrl(m[1]);
            if (u.startsWith('http') && !u.includes('.jpg') && !u.includes('.png') && !urls.includes(u)) {
                urls.push(u);
            }
        }
    }

    const qualities = urls.map((u, i) => {
        const qMatch = u.match(/(\d+p)/i);
        const q = qMatch ? parseInt(qMatch[1]) : 0;
        return { quality: q, label: q >= 720 ? 'HD' : 'SD', url: u, format: 'MP4', id: i };
    });

    return { title, thumbnail: thumb, qualities };
}

function extractXhamster(html) {
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1].replace(/ - xHamster\.com/i, '').trim() : '';
    const thumbMatch = html.match(/"thumbnailUrl"\s*:\s*"([^"]+)"/);
    const thumb = thumbMatch ? cleanUrl(thumbMatch[1]) : '';

    const urls = [];
    const patterns = [
        /"videoUrl"\s*:\s*"([^"]+)"/g,
        /data-video-url\s*=\s*["']([^"']+)["']/g,
    ];
    for (const p of patterns) {
        let m;
        while ((m = p.exec(html)) !== null) {
            const u = cleanUrl(m[1]);
            if (u.startsWith('http') && !u.includes('.jpg') && !u.includes('.png') && !urls.includes(u)) {
                urls.push(u);
            }
        }
    }

    const qualities = urls.map((u, i) => {
        const qMatch = u.match(/(\d+p)/i);
        const q = qMatch ? parseInt(qMatch[1]) : 0;
        return { quality: q, label: q >= 720 ? 'HD' : 'SD', url: u, format: 'MP4', id: i };
    });

    return { title, thumbnail: thumb, qualities };
}

function extractRedtube(html) {
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1].replace(/ - RedTube\.com/i, '').trim() : '';
    const thumbMatch = html.match(/"thumbnailUrl"\s*:\s*"([^"]+)"/);
    const thumb = thumbMatch ? cleanUrl(thumbMatch[1]) : '';

    const urls = [];
    const patterns = [
        /"video_url"\s*:\s*"([^"]+)"/g,
        /video_url\s*[=:]\s*["']([^"']+)["']/g,
    ];
    for (const p of patterns) {
        let m;
        while ((m = p.exec(html)) !== null) {
            const u = cleanUrl(m[1]);
            if (u.startsWith('http') && !u.includes('.jpg') && !u.includes('.png') && !urls.includes(u)) {
                urls.push(u);
            }
        }
    }

    const qualities = urls.map((u, i) => {
        const qMatch = u.match(/(\d+p)/i);
        const q = qMatch ? parseInt(qMatch[1]) : 0;
        return { quality: q, label: q >= 720 ? 'HD' : 'SD', url: u, format: 'MP4', id: i };
    });

    return { title, thumbnail: thumb, qualities };
}

function extractGeneric(html) {
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1].trim() : '';
    const thumbMatch = html.match(/"thumbnailUrl"\s*:\s*"([^"]+)"/) || html.match(/"og:image"\s+content="([^"]+)"/);
    const thumb = thumbMatch ? cleanUrl(thumbMatch[1]) : '';

    const urls = [];
    const patterns = [
        /"video_url"\s*:\s*"([^"]+)"/g,
        /"videoUrl"\s*:\s*"([^"]+)"/g,
        /video_url\s*[=:]\s*["']([^"']+)["']/g,
    ];
    for (const p of patterns) {
        let m;
        while ((m = p.exec(html)) !== null) {
            const u = cleanUrl(m[1]);
            if (u.startsWith('http') && !u.includes('.jpg') && !u.includes('.png') && !urls.includes(u)) {
                urls.push(u);
            }
        }
    }

    const qualities = urls.map((u, i) => {
        const qMatch = u.match(/(\d+p)/i);
        const q = qMatch ? parseInt(qMatch[1]) : 0;
        return { quality: q, label: q >= 720 ? 'HD' : 'SD', url: u, format: 'MP4', id: i };
    });

    return { title, thumbnail: thumb, qualities };
}

function getExtractor(url) {
    if (url.includes('pornhub')) return extractPornhub;
    if (url.includes('xvideos')) return extractXvideos;
    if (url.includes('xnxx')) return extractXnxx;
    if (url.includes('xhamster')) return extractXhamster;
    if (url.includes('redtube')) return extractRedtube;
    return extractGeneric;
}

async function resolveM3u8(masterUrl) {
    const resp = await fetch(masterUrl, {
        headers: { ...HEADERS, 'Referer': 'https://www.pornhub.com/' },
    });
    const text = await resp.text();
    const lines = text.split('\n').filter(l => l.trim());

    if (lines.length < 2) return null;

    const variantLines = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#EXT-X-STREAM-INF:')) {
            const nextLine = lines[i + 1];
            if (nextLine && !nextLine.startsWith('#')) {
                const bwMatch = lines[i].match(/BANDWIDTH=(\d+)/);
                const resMatch = lines[i].match(/RESOLUTION=(\d+)x(\d+)/);
                let variantUrl = nextLine;
                if (!variantUrl.startsWith('http')) {
                    const base = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1);
                    variantUrl = base + nextLine;
                }
                variantLines.push({
                    bandwidth: bwMatch ? parseInt(bwMatch[1]) : 0,
                    width: resMatch ? parseInt(resMatch[1]) : 0,
                    height: resMatch ? parseInt(resMatch[2]) : 0,
                    url: variantUrl,
                });
            }
        }
    }

    if (variantLines.length === 0) {
        if (text.includes('#EXTINF') || text.includes('#EXT-X-MAP')) {
            const baseUrl = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1);
            const segmentUrls = [];
            for (const line of lines) {
                if (!line.startsWith('#') && line.trim()) {
                    let segUrl = line;
                    if (!segUrl.startsWith('http')) segUrl = baseUrl + segUrl;
                    segmentUrls.push(segUrl);
                }
            }
            return { segments: segmentUrls, totalSegments: segmentUrls.length };
        }
        return null;
    }

    variantLines.sort((a, b) => b.height - a.height);

    const variantResp = await fetch(variantLines[0].url, {
        headers: { ...HEADERS, 'Referer': 'https://www.pornhub.com/' },
    });
    const variantText = await variantResp.text();
    const vLines = variantText.split('\n').filter(l => l.trim());
    const baseUrl = variantLines[0].url.substring(0, variantLines[0].url.lastIndexOf('/') + 1);
    const segments = [];

    for (const line of vLines) {
        if (!line.startsWith('#') && line.trim()) {
            let segUrl = line;
            if (!segUrl.startsWith('http')) segUrl = baseUrl + segUrl;
            segments.push(segUrl);
        }
    }

    return {
        segments,
        totalSegments: segments.length,
        quality: variantLines[0].height,
    };
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: CORS });
        }

        if (url.pathname === '/api/health') {
            return jsonResponse({ status: 'ok', worker: true, timestamp: Date.now() });
        }

        if (url.pathname === '/api/sites') {
            return jsonResponse({
                sites: ['pornhub', 'xvideos', 'xnxx', 'xhamster', 'redtube'],
            });
        }

        if (url.pathname === '/api/analyze' && request.method === 'POST') {
            try {
                const body = await request.json();
                const videoUrl = body.url;
                if (!videoUrl) return jsonResponse({ error: 'URL required' }, 400);

                const extractor = getExtractor(videoUrl);

                const pageResponse = await fetch(videoUrl, {
                    headers: { ...HEADERS, 'Referer': 'https://www.google.com/' },
                    redirect: 'follow',
                });

                if (!pageResponse.ok) {
                    return jsonResponse({ error: `Failed to fetch page (${pageResponse.status})` }, 500);
                }

                const html = await pageResponse.text();
                const result = extractor(html);

                if (result.qualities.length === 0) {
                    return jsonResponse({ error: 'No video sources found. This site may require JavaScript.' }, 404);
                }

                const formats = [];
                const wanted = [1080, 720, 480, 360, 240, 144];
                const usedQualities = new Set();

                for (const q of result.qualities) {
                    const h = q.quality;
                    if (h > 0 && wanted.includes(h) && !usedQualities.has(h)) {
                        usedQualities.add(h);
                        formats.push({
                            id: formats.length,
                            quality: h + 'p',
                            label: q.label,
                            format: q.format || 'MP4',
                            m3u8: q.m3u8 || null,
                            url: q.url || null,
                        });
                    }
                }

                if (formats.length === 0) {
                    for (const q of result.qualities) {
                        if (!usedQualities.has(q.quality)) {
                            usedQualities.add(q.quality);
                            formats.push({
                                id: formats.length,
                                quality: q.quality > 0 ? q.quality + 'p' : 'Original',
                                label: q.label,
                                format: q.format || 'MP4',
                                m3u8: q.m3u8 || null,
                                url: q.url || null,
                            });
                        }
                    }
                }

                formats.sort((a, b) => {
                    const ha = parseInt(a.quality) || 999;
                    const hb = parseInt(b.quality) || 999;
                    return hb - ha;
                });
                formats.forEach((f, i) => { f.id = i; });

                return jsonResponse({
                    success: true,
                    downloadId: crypto.randomUUID(),
                    title: result.title || 'Unknown Video',
                    thumbnail: result.thumbnail,
                    originalUrl: videoUrl,
                    formats: formats.slice(0, 10),
                });
            } catch (err) {
                return jsonResponse({ error: err.message || 'Analysis failed' }, 500);
            }
        }

        if (url.pathname === '/api/segments' && request.method === 'POST') {
            try {
                const body = await request.json();
                const m3u8Url = body.m3u8;
                if (!m3u8Url) return jsonResponse({ error: 'm3u8 URL required' }, 400);

                const result = await resolveM3u8(m3u8Url);
                if (!result || !result.segments || result.segments.length === 0) {
                    return jsonResponse({ error: 'No segments found in m3u8' }, 404);
                }

                return jsonResponse({
                    success: true,
                    segments: result.segments,
                    totalSegments: result.totalSegments,
                    quality: result.quality || 0,
                });
            } catch (err) {
                return jsonResponse({ error: err.message || 'Segment resolution failed' }, 500);
            }
        }

        if (url.pathname === '/api/proxy' && request.method === 'GET') {
            try {
                const targetUrl = url.searchParams.get('url');
                if (!targetUrl) return jsonResponse({ error: 'URL param required' }, 400);

                const resp = await fetch(decodeURIComponent(targetUrl), {
                    headers: {
                        'User-Agent': 'Mozilla/5.0',
                        'Referer': 'https://www.pornhub.com/',
                    },
                    redirect: 'follow',
                });

                const contentType = resp.headers.get('content-type') || 'application/octet-stream';
                const newHeaders = new Headers({
                    'Content-Type': contentType,
                    'Cache-Control': 'public, max-age=86400',
                    ...CORS,
                });

                return new Response(resp.body, { status: resp.status, headers: newHeaders });
            } catch {
                return jsonResponse({ error: 'Proxy failed' }, 500);
            }
        }

        if (url.pathname === '/api/proxy-segments' && request.method === 'POST') {
            try {
                const body = await request.json();
                const segments = body.segments;
                if (!segments || !Array.isArray(segments) || segments.length === 0) {
                    return jsonResponse({ error: 'segments array required' }, 400);
                }

                const maxSegments = 500;
                const segs = segments.slice(0, maxSegments);

                const reader = {
                    index: 0,
                    segments: segs,
                };

                const stream = new ReadableStream({
                    async pull(controller) {
                        if (reader.index >= reader.segments.length) {
                            controller.close();
                            return;
                        }
                        try {
                            const resp = await fetch(reader.segments[reader.index], {
                                headers: {
                                    'User-Agent': 'Mozilla/5.0',
                                    'Referer': 'https://www.pornhub.com/',
                                },
                            });
                            const buffer = await resp.arrayBuffer();
                            controller.enqueue(new Uint8Array(buffer));
                        } catch (e) {
                            // skip failed segment
                        }
                        reader.index++;
                    },
                });

                return new Response(stream, {
                    status: 200,
                    headers: {
                        'Content-Type': 'video/mp2t',
                        'Transfer-Encoding': 'chunked',
                        ...CORS,
                    },
                });
            } catch (err) {
                return jsonResponse({ error: err.message || 'Segment proxy failed' }, 500);
            }
        }

        if (url.pathname === '/api/download' && request.method === 'GET') {
            try {
                const targetUrl = url.searchParams.get('url');
                if (!targetUrl) return jsonResponse({ error: 'url param required' }, 400);
                return Response.redirect(decodeURIComponent(targetUrl), 302);
            } catch {
                return jsonResponse({ error: 'Download failed' }, 500);
            }
        }

        return jsonResponse({ error: 'Not found' }, 404);
    },
};
