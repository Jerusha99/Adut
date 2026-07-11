# VideoGrab Pro

Advanced Video Downloader Dashboard with beautiful UI. Powered by yt-dlp supporting 1000+ sites.

## Features

- Download videos in MP4: 1080p, 720p, 360p, 240p, 144p
- Beautiful glassmorphism dark UI with animations
- Download history with localStorage
- Supports Pornhub, XVideos, XNXX, XHamster, RedTube + 1000 more sites
- REST API for integration

## Deploy to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) and import the repo
3. Vercel will auto-detect the Python API + static frontend
4. Deploy!

## Deploy to Railway (recommended for full yt-dlp)

1. Go to [railway.app](https://railway.app)
2. Create new project from GitHub repo
3. Railway auto-detects the Dockerfile
4. Deploy!

## Deploy to Render

1. Go to [render.com](https://render.com)
2. Create new Web Service from GitHub
3. Uses `render.yaml` config
4. Deploy!

## Local Development

```bash
npm install
python -m pip install yt-dlp
node server.js
```

Open http://localhost:3001

## API

```
POST /api/analyze   { "url": "video-url" }    -> Returns formats
GET  /api/download/:id/:formatId               -> Downloads video
GET  /api/health                               -> Health check
```
