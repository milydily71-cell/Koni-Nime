# Koni-Nime

A mobile-first anime discovery and watch interface with a cinematic dark violet theme, built with Vite and Capacitor for Android.

## Features
- Home discovery screen and responsive anime poster grid
- Search using the Tatakai API
- Anime details and episode list
- HLS/MP4 playback when the API returns a playable source
- Local watchlist and recently watched history
- Configurable API base URL, loading/error states, and retry controls
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

## API
Default base URL: `https://api.tatakai.me`. The UI uses the documented HiAnime routes for home, search, anime info, and episode sources. The upstream API may change its schema, availability, or source support; the app displays errors rather than fabricating results. API base URL can be changed from Settings.

API documentation: https://api.tatakai.me/docs

## Attribution and legal
Tatakai is a separate upstream project. Review its license, attribution requirements, source-site terms, and applicable copyright laws before distributing this app. Koni-Nime does not host anime video content. Only access or stream content you are authorized to view.
