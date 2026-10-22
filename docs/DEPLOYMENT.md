# Deployment

## Render Blueprint

1. Connect the repository milydily71-cell/Koni-Nime to Render and create or update the Blueprint from render.yaml.
2. The koni-nime-api web service builds from deploy/api.Dockerfile and runs this repository's own Node.js/Express API. It no longer clones the third-party Kuhi API at build time.
3. The koni-nime static site builds the Vite frontend and sets VITE_API_BASE_URL to the API's public HTTPS URL.
4. After deployment, check https://YOUR-API-HOST/v1/health.
5. Verify metadata routes such as /v1/anime/search?q=naruto and /v1/anime/20. Episode and playback routes depend on the configured Miruro provider being reachable.
6. In app Settings, the API base URL can override the build-time URL.

## API routes

- GET /health and /v1/health — health checks.
- GET /anime/spotlight, /anime/popular, /anime/recent — compatibility catalog endpoints.
- GET /anime/search?query=... — compatibility search.
- GET /anime/info/:id — metadata and synopsis.
- GET /anime/episodes/:id — provider episode data for the current client.
- GET /anime/extract/:id?e=1&type=sub — playback source resolution.
- GET /v1/anime/popular, /v1/anime/recent, /v1/anime/search?q=..., /v1/anime/:id, /v1/anime/:id/episodes.
- GET /v1/episodes/:id/servers?animeId=20&episode=1 and /v1/episodes/:id/stream?animeId=20&episode=1.

The API normalizes AniList and Miruro metadata, caches responses in memory, coalesces concurrent cache misses, limits request rates, validates inputs, applies upstream timeouts, and returns structured JSON errors. AniList is the metadata fallback; Miruro is the configured episode/playback adapter. No episode counts or stream URLs are fabricated when a provider fails.

## Configuration

- PORT — provided by Render.
- MIRURO_API_BASE — defaults to https://mirurotvapi.vercel.app/api.
- ANILIST_API_URL — defaults to https://graphql.anilist.co.
- UPSTREAM_TIMEOUT_MS — upstream request timeout, default 12000.
- CORS_ORIGIN — optional allowed origin; defaults to *.
- RATE_LIMIT_WINDOW_MS and RATE_LIMIT_MAX — in-memory rate limit settings.

The cache and rate limiter are per instance and reset on restart. Use managed Redis and a persistent database if you need shared caching, stored catalog snapshots, accounts or durable analytics.

## Android APK

The Android workflow builds a debug APK on pushes to main. Download the artifact from the successful GitHub Actions run. It is for testing, not a Play Store release.

## Limitations and legal

Metadata comes from third-party metadata providers. Episode discovery and stream resolution depend on the external Miruro API and its providers. This API does not host video content, guarantee source availability or bypass provider access controls. Use only sources and content you are authorized to access.
