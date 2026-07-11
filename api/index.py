import json
import subprocess
import uuid
import re
import urllib.request
from http.server import BaseHTTPRequestHandler

downloads = {}
WANTED_HEIGHTS = [1080, 720, 360, 240, 144]

def run_ytdlp(url):
    for python_cmd in ['python3', 'python', 'py']:
        try:
            result = subprocess.run(
                [python_cmd, '-m', 'yt_dlp', '--dump-json', '--no-playlist', '--no-warnings', url],
                capture_output=True, text=True, timeout=25
            )
            if result.returncode == 0:
                return json.loads(result.stdout)
        except Exception:
            continue
    raise Exception('yt-dlp not available')

def get_formats(info):
    all_formats = info.get('formats', [])
    formats = []

    for target_h in WANTED_HEIGHTS:
        match = next(
            (f for f in all_formats if f.get('height') == target_h and f.get('vcodec') != 'none' and f.get('url')),
            next((f for f in all_formats if f.get('height') == target_h and f.get('url')), None)
        )
        if match:
            label = 'Full HD' if target_h == 1080 else ('HD' if target_h == 720 else f'{target_h}p')
            formats.append({
                'id': len(formats), 'quality': f'{target_h}p', 'label': label,
                'format': 'MP4', 'url': match['url'], 'ext': 'mp4',
                'width': match.get('width'), 'height': match.get('height'),
                'filesize': match.get('filesize') or match.get('filesize_approx'),
                'fps': match.get('fps'),
            })

    if not formats:
        fallback = sorted(
            [f for f in all_formats if f.get('vcodec') != 'none' and f.get('url')],
            key=lambda x: x.get('height', 0), reverse=True
        )
        seen = set()
        for f in fallback:
            h = f.get('height', 0)
            if h > 0 and h not in seen:
                seen.add(h)
                formats.append({
                    'id': len(formats), 'quality': f'{h}p',
                    'label': 'Full HD' if h >= 1080 else ('HD' if h >= 720 else f'{h}p'),
                    'format': 'MP4', 'url': f['url'], 'ext': 'mp4',
                    'width': f.get('width'), 'height': f.get('height'),
                    'filesize': f.get('filesize') or f.get('filesize_approx'), 'fps': f.get('fps'),
                })
    return formats

class handler(BaseHTTPRequestHandler):
    def _json_response(self, code, data, extra_headers=None):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        if extra_headers:
            for k, v in extra_headers.items():
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/health':
            self._json_response(200, {'status': 'ok'})
        elif self.path.startswith('/api/download/'):
            parts = self.path.split('/')
            download_id = parts[3] if len(parts) > 3 else ''
            format_id = int(parts[4]) if len(parts) > 4 else -1
            data = downloads.get(download_id)
            if not data:
                self._json_response(404, {'error': 'Session expired'})
                return
            fmt = next((f for f in data['formats'] if f['id'] == format_id), None)
            if not fmt:
                self._json_response(404, {'error': 'Format not found'})
                return
            try:
                req = urllib.request.Request(fmt['url'], headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://www.google.com/',
                })
                with urllib.request.urlopen(req, timeout=60) as resp:
                    safe_name = re.sub(r'[^a-zA-Z0-9\s\-_]', '', data['title'])[:80] or 'video'
                    self.send_response(200)
                    self.send_header('Content-Type', 'video/mp4')
                    self.send_header('Content-Disposition', f'attachment; filename="{safe_name}_{fmt["quality"]}.mp4"')
                    cl = resp.headers.get('Content-Length')
                    if cl:
                        self.send_header('Content-Length', cl)
                    self.end_headers()
                    while True:
                        chunk = resp.read(65536)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
            except Exception:
                self._json_response(500, {'error': 'Download failed'})
        else:
            self._json_response(404, {'error': 'Not found'})

    def do_POST(self):
        if self.path == '/api/analyze':
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length))
            url = body.get('url', '')
            if not url:
                self._json_response(400, {'error': 'URL required'})
                return
            try:
                info = run_ytdlp(url)
                formats = get_formats(info)
                if not formats:
                    self._json_response(404, {'error': 'No MP4 formats found'})
                    return
                download_id = str(uuid.uuid4())
                downloads[download_id] = {
                    'title': info.get('title', 'Unknown'),
                    'thumbnail': info.get('thumbnail', ''),
                    'formats': formats, 'originalUrl': url,
                }
                self._json_response(200, {
                    'success': True, 'downloadId': download_id,
                    'title': info.get('title', 'Unknown'),
                    'thumbnail': info.get('thumbnail', ''),
                    'uploader': info.get('uploader', ''),
                    'duration': info.get('duration', 0),
                    'formats': [{k: v for k, v in f.items() if k != 'url'} for f in formats],
                })
            except Exception as e:
                self._json_response(500, {'error': str(e)[:200]})
        else:
            self._json_response(404, {'error': 'Not found'})

    def log_message(self, format, *args):
        print(f"[Vercel] {args[0]}")
