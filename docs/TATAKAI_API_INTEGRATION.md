# Tatakai API integration

Koni-Nime's mobile-first UI uses the public Tatakai API as its anime catalog provider. Default base URL: `https://api.tatakai.me`. The API base can be changed in Settings.

## Routes currently wired in the client

- Home catalog: `GET /api/v1/hianime/home`
- Search: `GET /api/v1/hianime/search?q=<query>&page=1`
- Anime details: `GET /api/v1/hianime/info/<anime-id>`
- Episode sources: `GET /api/v1/hianime/episode/sources?animeEpisodeId=<episode-id>`

These routes are based on the published Tatakai API examples and should be rechecked against the live Swagger docs when the upstream API changes: https://api.tatakai.me/docs. This environment could not independently validate live responses, so response parsing is defensive and upstream connectivity/schema still needs a real build/device test.

## Implemented UI

- Cinematic dark charcoal/violet responsive layout with mobile bottom navigation
- Home catalog cards, loading placeholders, empty/error states and retry
- Search with debouncing
- Anime details, synopsis/genre display, episode list
- HLS playback via hls.js or native HLS, and direct media playback when a supported URL is returned
- Device-local watchlist and recent-watch history
- Settings for API base URL and reduced motion
- Capacitor Android packaging and GitHub Actions release APK artifact

## Build

```sh
npm install
npm run build
npx cap add android
npx cap sync android
cd android && ./gradlew assembleRelease
```

## Attribution, privacy and legal

Tatakai is an independent upstream project and may have separate license and attribution requirements. Review the source repository's current license and API usage terms before redistribution. Koni-Nime does not host video files; source availability depends on third-party providers. Only stream content you are authorized to access. Watchlist and history are stored locally in the app's browser storage and are not synced to an account.
