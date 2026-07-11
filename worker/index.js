const SITES = {
    pornhub: {
        extract: (html) => {
            const urls = [];
            const titleMatch = html.match(/<title>([^<]+)<\/title>/);
            const title = titleMatch ? titleMatch[1].replace(/ - Pornhub\.com/i, '').trim() : '';
            const thumbMatch = html.match(/"thumbnailUrl"\s*:\s*"([^"]+)"/) || html.match(/"image_url"\s*:\s*"([^"]+)"/);
            const thumb = thumbMatch ? thumbMatch[1] : '';

            const isThumbnail = (u) => {
                const lower = u.toLowerCase();
                return lower.includes('/rs:fit:') || lower.includes('/plain/') ||
                       lower.includes('/rs:fill:') || lower.includes('/rs:w:') ||
                       lower.includes('/rs:h:') || lower.includes('.jpg') ||
                       lower.includes('.png') || lower.includes('.gif') ||
                       lower.includes('.webp') || lower.includes('thumbnail') ||
                       lower.includes('/thumb') || lower.includes('/poster') ||
                       lower.includes('vts:401') || lower.includes('vts:2000');
            };

            // Method 1: flashvars with video_url
            const flashvarsMatch = html.match(/var\s+flashvars\s*=\s*\{([^}]+)\}/);
            if (flashvarsMatch) {
                const fv = flashvarsMatch[1];
                const vu = fv.match(/"video_url"\s*:\s*"([^"]+)"/);
                if (vu) {
                    let u = vu[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/\\x2F/g, '/');
                    if (!isThumbnail(u)) urls.push(u);
                }
                const vut = fv.match(/"video_url_text"\s*:\s*"([^"]+)"/);
                if (vut) {
                    let u = vut[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/\\x2F/g, '/');
                    if (!isThumbnail(u)) urls.push(u);
                }
                const vu720 = fv.match(/"video_url_720p"\s*:\s*"([^"]+)"/);
                if (vu720) {
                    let u = vu720[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/\\x2F/g, '/');
                    if (!isThumbnail(u)) urls.push(u);
                }
                const vu480 = fv.match(/"video_url_480p"\s*:\s*"([^"]+)"/);
                if (vu480) {
                    let u = vu480[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/\\x2F/g, '/');
                    if (!isThumbnail(u)) urls.push(u);
                }
                const vu240 = fv.match(/"video_url_240p"\s*:\s*"([^"]+)"/);
                if (vu240) {
                    let u = vu240[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/\\x2F/g, '/');
                    if (!isThumbnail(u)) urls.push(u);
                }
            }

            // Method 2: Direct script patterns
            const scriptPatterns = [
                /flashvars\s*\[["']video_url["']\]\s*=\s*["']([^"']+)["']/g,
                /flashvars\s*\[["']video_url_text["']\]\s*=\s*["']([^"']+)["']/g,
                /video_url\s*[=:]\s*["']([^"']+\.mp4[^"']*)["']/gi,
                /video_url\s*[=:]\s*["']([^"']+\.mp4[^"']*)["']/gi,
            ];

            for (const p of scriptPatterns) {
                let m;
                while ((m = p.exec(html)) !== null) {
                    let u = (m[1]).replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/\\x2F/g, '/');
                    if (!isThumbnail(u) && u.startsWith('http') && !urls.includes(u)) {
                        urls.push(u);
                    }
                }
            }

            // Method 3: Find phncdn CDN mp4 URLs (actual videos, NOT thumbnails)
            const cdnPattern = /https?:\/\/[a-z0-9\-]+\.phncdn\.com\/[^"'\s\\]*\.mp4[^"'\s\\]*/gi;
            let cm;
            while ((cm = cdnPattern.exec(html)) !== null) {
                let u = cm[0].replace(/\\\//g, '/').replace(/\\x2F/g, '/');
                if (!isThumbnail(u) && !urls.includes(u)) {
                    urls.push(u);
                }
            }

            // Method 4: Find ew-cf/ew-ncf pornhub CDN video URLs
            const phCdnPattern = /https?:\/\/(?:ew-cf|ew-ncf|ci|dl)\.pornhub\.com\/[^"'\s\\]*\.mp4[^"'\s\\]*/gi;
            let pm;
            while ((pm = phCdnPattern.exec(html)) !== null) {
                let u = pm[0].replace(/\\\//g, '/');
                if (!isThumbnail(u) && !urls.includes(u)) {
                    urls.push(u);
                }
            }

            return { title, thumbnail: thumb, urls };
        },
    },
    xvideos: {
        extract: (html) => {
            const urls = [];
            const titleMatch = html.match(/<title>([^<]+)<\/title>/);
            const title = titleMatch ? titleMatch[1].replace(/ - XVIDEOS\.COM/i, '').trim() : '';
            const thumbMatch = html.match(/"thumbnailUrl"\s*:\s*"([^"]+)"/);
            const thumb = thumbMatch ? thumbMatch[1] : '';

            const isThumbnail = (u) => {
                const lower = u.toLowerCase();
                return lower.includes('.jpg') || lower.includes('.png') ||
                       lower.includes('.gif') || lower.includes('.webp') ||
                       lower.includes('thumbnail') || lower.includes('/thumb');
            };

            const patterns = [
                /setVideoUrl\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
                /html5player\.setVideoUrl\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
                /video_url\s*[=:]\s*["']([^"']+)["']/g,
                /setVideoTitle\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
            ];

            for (const p of patterns) {
                let m;
                while ((m = p.exec(html)) !== null) {
                    let u = (m[1]).replace(/\\u002F/g, '/').replace(/\\\//g, '/');
                    if (!isThumbnail(u) && u.startsWith('http') && !urls.includes(u)) {
                        urls.push(u);
                    }
                }
            }
            return { title, thumbnail: thumb, urls };
        },
    },
    xnxx: {
        extract: (html) => {
            const urls = [];
            const titleMatch = html.match(/<title>([^<]+)<\/title>/);
            const title = titleMatch ? titleMatch[1].replace(/ - XNXX\.COM/i, '').trim() : '';
            const thumbMatch = html.match(/"thumbnailUrl"\s*:\s*"([^"]+)"/);
            const thumb = thumbMatch ? thumbMatch[1] : '';

            const isThumbnail = (u) => {
                const lower = u.toLowerCase();
                return lower.includes('.jpg') || lower.includes('.png') ||
                       lower.includes('.gif') || lower.includes('.webp') ||
                       lower.includes('thumbnail') || lower.includes('/thumb');
            };

            const patterns = [
                /setVideoUrl\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
                /html5player\.setVideoUrl\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
                /video_url\s*[=:]\s*["']([^"']+)["']/g,
            ];

            for (const p of patterns) {
                let m;
                while ((m = p.exec(html)) !== null) {
                    let u = (m[1]).replace(/\\u002F/g, '/').replace(/\\\//g, '/');
                    if (!isThumbnail(u) && u.startsWith('http') && !urls.includes(u)) {
                        urls.push(u);
                    }
                }
            }
            return { title, thumbnail: thumb, urls };
        },
    },
    xhamster: {
        extract: (html) => {
            const urls = [];
            const titleMatch = html.match(/<title>([^<]+)<\/title>/);
            const title = titleMatch ? titleMatch[1].replace(/ - xHamster\.com/i, '').trim() : '';
            const thumbMatch = html.match(/"thumbnailUrl"\s*:\s*"([^"]+)"/);
            const thumb = thumbMatch ? thumbMatch[1] : '';

            const isThumbnail = (u) => {
                const lower = u.toLowerCase();
                return lower.includes('.jpg') || lower.includes('.png') ||
                       lower.includes('.gif') || lower.includes('.webp') ||
                       lower.includes('thumbnail') || lower.includes('/thumb');
            };

            const patterns = [
                /"videoUrl"\s*:\s*"([^"]+)"/g,
                /data-video-url\s*=\s*["']([^"']+)["']/g,
            ];

            for (const p of patterns) {
                let m;
                while ((m = p.exec(html)) !== null) {
                    let u = (m[1]).replace(/\\u002F/g, '/').replace(/\\\//g, '/');
                    if (!isThumbnail(u) && u.startsWith('http') && !urls.includes(u)) {
                        urls.push(u);
                    }
                }
            }
            return { title, thumbnail: thumb, urls };
        },
    },
    redtube: {
        extract: (html) => {
            const urls = [];
            const titleMatch = html.match(/<title>([^<]+)<\/title>/);
            const title = titleMatch ? titleMatch[1].replace(/ - RedTube\.com/i, '').trim() : '';
            const thumbMatch = html.match(/"thumbnailUrl"\s*:\s*"([^"]+)"/);
            const thumb = thumbMatch ? thumbMatch[1] : '';

            const isThumbnail = (u) => {
                const lower = u.toLowerCase();
                return lower.includes('.jpg') || lower.includes('.png') ||
                       lower.includes('.gif') || lower.includes('.webp') ||
                       lower.includes('thumbnail');
            };

            const patterns = [
                /"video_url"\s*:\s*"([^"]+)"/g,
                /video_url\s*[=:]\s*["']([^"']+)["']/g,
            ];

            for (const p of patterns) {
                let m;
                while ((m = p.exec(html)) !== null) {
                    let u = (m[1]).replace(/\\u002F/g, '/').replace(/\\\//g, '/');
                    if (!isThumbnail(u) && u.startsWith('http') && !urls.includes(u)) {
                        urls.push(u);
                    }
                }
            }
            return { title, thumbnail: thumb, urls };
        },
    },
    generic: {
        extract: (html) => {
            const urls = [];
            const titleMatch = html.match(/<title>([^<]+)<\/title>/);
            const title = titleMatch ? titleMatch[1].trim() : '';
            const thumbMatch = html.match(/"thumbnailUrl"\s*:\s*"([^"]+)"/) || html.match(/"og:image"\s*content="([^"]+)"/);
            const thumb = thumbMatch ? thumbMatch[1] : '';

            const isThumbnail = (u) => {
                const lower = u.toLowerCase();
                return lower.includes('.jpg') || lower.includes('.png') ||
                       lower.includes('.gif') || lower.includes('.webp') ||
                       lower.includes('thumbnail') || lower.includes('/thumb') ||
                       lower.includes('/rs:fit:');
            };

            const patterns = [
                /"video_url"\s*:\s*"([^"]+)"/g,
                /"videoUrl"\s*:\s*"([^"]+)"/g,
                /video_url\s*[=:]\s*["']([^"']+)["']/g,
            ];

            for (const p of patterns) {
                let m;
                while ((m = p.exec(html)) !== null) {
                    let u = (m[1]).replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/\\x2F/g, '/');
                    if (!isThumbnail(u) && u.startsWith('http') && !urls.includes(u)) {
                        urls.push(u);
                    }
                }
            }
            return { title, thumbnail: thumb, urls };
        },
    },
};

function getSiteExtractor(url) {
    if (url.includes('pornhub')) return SITES.pornhub;
    if (url.includes('xvideos')) return SITES.xvideos;
    if (url.includes('xnxx')) return SITES.xnxx;
    if (url.includes('xhamster')) return SITES.xhamster;
    if (url.includes('redtube')) return SITES.redtube;
    return SITES.generic;
}

function classifyQuality(url) {
    const l = url.toLowerCase();
    if (l.includes('1080') || l.includes('1920')) return { quality: '1080p', label: 'Full HD' };
    if (l.includes('720') || l.includes('1280')) return { quality: '720p', label: 'HD' };
    if (l.includes('480')) return { quality: '480p', label: 'SD' };
    if (l.includes('360')) return { quality: '360p', label: '360p' };
    if (l.includes('240')) return { quality: '240p', label: '240p' };
    if (l.includes('144')) return { quality: '144p', label: '144p' };
    return { quality: 'unknown', label: 'Original' };
}

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
                sites: ['pornhub', 'xvideos', 'xnxx', 'xhamster', 'redtube', 'youporn', 'spankwire', 'beeg', 'eporner', 'daftsex', 'sxyprn', 'hclips', 'txxx', 'camwhores'],
            });
        }

        if (url.pathname === '/api/analyze' && request.method === 'POST') {
            try {
                const body = await request.json();
                const videoUrl = body.url;
                if (!videoUrl) return jsonResponse({ error: 'URL required' }, 400);

                const extractor = getSiteExtractor(videoUrl);

                const pageResponse = await fetch(videoUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Referer': 'https://www.google.com/',
                    },
                    redirect: 'follow',
                });

                if (!pageResponse.ok) {
                    return jsonResponse({ error: `Failed to fetch page (${pageResponse.status})` }, 500);
                }

                const html = await pageResponse.text();
                const result = extractor.extract(html);

                if (result.urls.length === 0) {
                    return jsonResponse({ error: 'No video sources found. This site may use JavaScript-based loading.' }, 404);
                }

                const wanted = [1080, 720, 360, 240, 144];
                const formats = [];
                const usedQualities = new Set();

                for (const rawUrl of result.urls) {
                    if (rawUrl.includes('.m3u8') || rawUrl.includes('.m3u8?')) continue;

                    const q = classifyQuality(rawUrl);
                    const height = parseInt(q.quality) || 0;

                    if (height > 0 && wanted.includes(height) && !usedQualities.has(height)) {
                        usedQualities.add(height);
                        formats.push({
                            id: formats.length,
                            quality: q.quality,
                            label: q.label,
                            format: 'MP4',
                            url: rawUrl,
                        });
                    }
                }

                if (formats.length === 0) {
                    const seen = new Set();
                    for (const rawUrl of result.urls) {
                        if (rawUrl.includes('.m3u8') || rawUrl.includes('.m3u8?')) continue;
                        if (!rawUrl.includes('.mp4') && !rawUrl.includes('.webm') && !rawUrl.includes('.avi')) continue;

                        const q = classifyQuality(rawUrl);
                        const h = parseInt(q.quality) || 0;
                        if (!seen.has(rawUrl)) {
                            seen.add(rawUrl);
                            formats.push({
                                id: formats.length,
                                quality: h > 0 ? h + 'p' : 'Original',
                                label: q.label,
                                format: 'MP4',
                                url: rawUrl,
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
                    uploader: '',
                    duration: 0,
                    formats: formats.slice(0, 10).map(f => ({
                        id: f.id,
                        quality: f.quality,
                        label: f.label,
                        format: 'MP4',
                        url: f.url,
                    })),
                });
            } catch (err) {
                return jsonResponse({ error: err.message || 'Analysis failed' }, 500);
            }
        }

        if (url.pathname.startsWith('/api/proxy') && request.method === 'GET') {
            try {
                const targetUrl = url.searchParams.get('url');
                if (!targetUrl) return jsonResponse({ error: 'URL param required' }, 400);

                const resp = await fetch(decodeURIComponent(targetUrl), {
                    headers: {
                        'User-Agent': 'Mozilla/5.0',
                        'Referer': 'https://www.google.com/',
                    },
                    redirect: 'follow',
                });

                const contentType = resp.headers.get('content-type') || 'image/jpeg';
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
