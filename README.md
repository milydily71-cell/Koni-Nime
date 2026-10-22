# Koni-Nime

A mobile-first anime discovery and watch interface with a cinematic dark violet theme, built with Vite and Capacitor for Android.

## Features
- Home discovery using Kuhi API spotlight, popular and recent endpoints
- Search using the Kuhi API
- AniList-backed anime details and episode list
- HLS/MP4 playback using the API's stream extraction endpoint when a compatible stream is available
- Local watchlist and recently watched history
- Configurable Kuhi API base URL, loading/error states, and retry controls
- GitHub Actions workflow for Android APK artifacts

## Run locally
Requires Node.js 20+ and npm.

```sh
npm install
npm run dev
```

## Build Android APK locally
```sh
npm install
npm run build
npx cap add android
npx cap sync android
cd android
./gradlew assembleDebug
```

## API setup

Koni-Nime now targets the API in [aryaniiil/anime-api](https://github.com/aryaniiil/anime-api), whose FastAPI app exposes endpoints such as `/anime/spotlight`, `/anime/search?query=...`, `/anime/info/{anilist_id}`, `/anime/episodes/{anilist_id}`, and `/anime/extract/{query}?e=1&type=sub`.

**Important:** that GitHub repository contains API source code; it does not provide a confirmed public API base URL. Deploy/run the API server first, then open Koni-Nime → Settings and enter its public HTTPS base URL (without a trailing slash). The server must be reachable from the Android device and allow CORS requests from the app's origin. For local testing, follow the upstream repository's installation instructions and use a LAN-reachable host address for a physical Android device.

API source and endpoint documentation: https://github.com/aryaniiil/anime-api

## Attribution, privacy and legal
The API project describes itself as experimental and does not guarantee uptime or data accuracy. Koni-Nime does not host anime video content. Source availability and playback compatibility depend on the configured server and third-party providers. Only access or stream content you are authorized to view.
