import json
import subprocess
import uuid
import os
import re
from http.server import BaseHTTPRequestHandler

downloads = {}

WANTED_HEIGHTS = [1080, 720, 360, 240, 144]

def run_ytdlp(url, extra_args=None):
    cmd = ['python', '-m', 'yt_dlp', '--dump-json', '--no-playlist', '--no-warnings']
    if extra_args:
        cmd.extend(extra_args)
    cmd.append(url)
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        raise Exception(result.stderr or 'yt-dlp failed')
    return json.loads(result.stdout)

def get_formats(info):
    all_formats = info.get('formats', [])
    formats = []

    for target_h in WANTED_HEIGHTS:
        match = next(
            (f for f in all_formats if f.get('height') == target_h and f.get('vcodec') != 'none' and f.get('url')),
            next(
                (f for f in all_formats if f.get('height') == target_h and f.get('url')),
                None
            )
        )
        if match:
            label = 'Full HD' if target_h == 1080 else ('HD' if target_h == 720 else f'{target_h}p')
            formats.append({
                'id': len(formats),
                'quality': f'{target_h}p',
                'label': label,
                'format': 'MP4',
                'url': match['url'],
                'ext': 'mp4',
                'width': match.get('width'),
                'height': match.get('height'),
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
                    'id': len(formats),
                    'quality': f'{h}p',
                    'label': 'Full HD' if h >= 1080 else ('HD' if h >= 720 else f'{h}p'),
                    'format': 'MP4',
                    'url': f['url'],
                    'ext': 'mp4',
                    'width': f.get('width'),
                    'height': f.get('height'),
                    'filesize': f.get('filesize') or f.get('filesize_approx'),
                    'fps': f.get('fps'),
                })

    return formats

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/api/analyze':
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length))
            url = body.get('url', '')

            if not url:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'URL required'}).encode())
                return

            try:
                info = run_ytdlp(url)
                formats = get_formats(info)

                if not formats:
                    self.send_response(404)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'error': 'No MP4 formats found'}).encode())
                    return

                download_id = str(uuid.uuid4())
                downloads[download_id] = {
                    'title': info.get('title', 'Unknown'),
                    'thumbnail': info.get('thumbnail', ''),
                    'formats': formats,
                    'originalUrl': url,
                }

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'success': True,
                    'downloadId': download_id,
                    'title': info.get('title', 'Unknown'),
                    'thumbnail': info.get('thumbnail', ''),
                    'uploader': info.get('uploader', ''),
                    'duration': info.get('duration', 0),
                    'formats': [
                        {k: v for k, v in f.items() if k != 'url'}
                        for f in formats
                    ],
                }).encode())

            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/api/health'):
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'ok'}).encode())
        elif self.path.startswith('/api/download/'):
            parts = self.path.split('/')
            download_id = parts[3] if len(parts) > 3 else ''
            format_id = int(parts[4]) if len(parts) > 4 else -1

            data = downloads.get(download_id)
            if not data:
                self.send_response(404)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Session expired'}).encode())
                return

            fmt = next((f for f in data['formats'] if f['id'] == format_id), None)
            if not fmt:
                self.send_response(404)
                self.end_headers()
                return

            import urllib.request
            try:
                req = urllib.request.Request(fmt['url'], headers={
                    'User-Agent': 'Mozilla/5.0',
                    'Referer': 'https://www.google.com/',
                })
                with urllib.request.urlopen(req, timeout=120) as resp:
                    self.send_response(200)
                    safe_name = re.sub(r'[^a-zA-Z0-9\s\-_]', '', data['title'])[:80] or 'video'
                    self.send_header('Content-Type', 'video/mp4')
                    self.send_header('Content-Disposition', f'attachment; filename="{safe_name}_{fmt["quality"]}.mp4"')
                    content_length = resp.headers.get('Content-Length')
                    if content_length:
                        self.send_header('Content-Length', content_length)
                    self.end_headers()
                    while True:
                        chunk = resp.read(65536)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
            except Exception as e:
                self.send_response(500)
                self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        print(f"[API] {args[0]}")
