# Koni-Nime

A mobile-first anime discovery and watch interface with a cinematic dark violet theme, built with Vite and Capacitor for Android.

## Features
- Home discovery using Kuhi API spotlight, popular and recent endpoints
- Search using the Kuhi API
- AniList-backed anime details and episode list
- HLS/MP4 playback using the API's stream extraction endpoint when a compatible stream is available
- Local watchlist and recently watched history
- Configurable Kuhi API base URL, loading/error states, and retry controls
- GitHub Actions workflow for installable Android debug APK artifacts
- Render Blueprint for deploying the web frontend and a Kuhi API service

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

## Deploy frontend and API

A Render deployment blueprint is included at [render.yaml](render.yaml). Follow [the deployment guide](docs/DEPLOYMENT.md) to create the static frontend and API service. Creating the blueprint in Render requires a Render account and authorization to connect this GitHub repository; the presence of the blueprint does not mean the services are already deployed.

The Android APK workflow runs on pushes to `main`. When it succeeds, download the `Koni-Nime-debug-apk` artifact from [GitHub Actions](https://github.com/milydily71-cell/Koni-Nime/actions). It is a debug-signed test APK, not a Play Store release.

## API setup

Koni-Nime targets the FastAPI project at [aryaniiil/anime-api](https://github.com/aryaniiil/anime-api), which exposes endpoints such as `/anime/spotlight`, `/anime/search?query=...`, `/anime/info/{anilist_id}`, `/anime/episodes/{anilist_id}`, and `/anime/extract/{query}?e=1&type=sub`.

The upstream repository is source code, not a confirmed public API base URL. If you are not using the Render blueprint, deploy or run the API server first, then open Koni-Nime → Settings and enter its public HTTPS base URL (without a trailing slash). The server must be reachable from the Android device and allow CORS requests from the app's origin. For local testing, use a LAN-reachable host address on a physical Android device.

## Attribution, privacy and legal
The upstream API project describes itself as experimental and does not guarantee uptime or data accuracy. Koni-Nime does not host anime video content. Source availability and playback compatibility depend on the configured server and third-party providers. Only access or stream content you are authorized to view.
