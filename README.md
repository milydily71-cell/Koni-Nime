# Koni-Nime

A mobile-first anime discovery and watch interface with a cinematic dark violet theme, built with Vite and Capacitor for Android.

## Features

- Koni-Nime's own Node.js + Express API, with stable versioned and backwards-compatible routes for the current web/APK client
- AniList and Miruro metadata adapters with normalized synopsis, posters, genres and ratings
- Episode discovery, provider episode deduplication and playback-source resolution through the configured Miruro adapter
- In-memory response caching, concurrent cache-miss coalescing, upstream timeouts, input validation, rate limiting and structured JSON errors
- HLS/MP4 playback when a compatible, authorized stream is available
- Local watchlist and recently watched history
- Configurable API base URL, loading/error states and retry controls
- GitHub Actions workflows for API tests and installable Android debug APK artifacts
- Render Blueprint for deploying the frontend and owned API service

## Run the API locally

Requires Node.js 20+. Run from the repository root:

    cd api
    npm install
    npm test
    npm start

The API listens on port 8000 by default. For the Vite frontend, return to the repository root and run npm install and npm run dev.

## Build Android APK locally

    npm install
    npm run build
    npx cap sync android
    cd android
    ./gradlew assembleDebug

## Deploy frontend and API

The Render Blueprint is in render.yaml. See docs/DEPLOYMENT.md. The API is built from this repository's api/ source through deploy/api.Dockerfile; it no longer clones the Kuhi API repository at build time.

The Android APK workflow creates a debug-signed test APK. It is not a Play Store release.

## API

- Health: GET /v1/health
- Catalog: GET /v1/anime/popular, GET /v1/anime/recent
- Search: GET /v1/anime/search?q=naruto
- Details: GET /v1/anime/:id
- Episodes: GET /v1/anime/:id/episodes
- Playback sources: GET /v1/episodes/:id/servers?animeId=20&episode=1
- Compatibility routes: /anime/spotlight, /anime/popular, /anime/recent, /anime/search, /anime/info/:id, /anime/episodes/:id, /anime/extract/:id

The API normalizes third-party metadata and resolves episode/source information when the configured provider is reachable. It does not host video content or guarantee third-party uptime. Only access or stream content you are authorized to view.
