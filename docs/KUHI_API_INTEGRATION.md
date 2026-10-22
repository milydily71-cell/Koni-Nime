# Kuhi API integration

Koni-Nime's frontend now targets the FastAPI service in [aryaniiil/anime-api](https://github.com/aryaniiil/anime-api). No Tatakai routes or default host are used.

## Endpoints wired in the client

- Spotlight/home: `GET /anime/spotlight`
- Popular: `GET /anime/popular?page=1&per_page=24`
- Recent: `GET /anime/recent?page=1&per_page=24`
- Search: `GET /anime/search?query=<query>&page=1&per_page=24`
- Details: `GET /anime/info/<anilist-id>`
- Episode metadata fallback: `GET /anime/episodes/<anilist-id>`
- Stream extraction: `GET /anime/extract/<anilist-id>?e=<episode-number>&type=sub`
- HLS proxy when a source includes a referer: `GET /proxy_m3u8?url=<encoded-url>&referer=<encoded-referer>`

## API base URL

The upstream GitHub repository is source code, not a confirmed public server. The app therefore has no invented default host. Deploy the API, then set its public base URL in Koni-Nime Settings. Use the base origin only, with no trailing slash. The API server must be reachable from the Android device and allow CORS requests.

## Response mapping

- Catalog endpoints return a `results` array of AniList-style media objects.
- AniList titles are nested objects; cover art is read from `coverImage.large` or `coverImage.extraLarge`.
- Anime details return the media object directly, including the episode count.
- The client generates episode-number rows from the episode count and requests streams through `/anime/extract/{id}`; this API does not use Tatakai's episode-source route.
- Stream selection prefers HLS and falls back to a direct MP4/DASH URL when returned. Embed-only sources are reported as unsupported by the in-app video element.

## Testing status

The client is adapted to the upstream route definitions and response shapes in the source repository. It still requires a deployed API URL and an Android build/device test to verify real connectivity and stream compatibility. The upstream project identifies itself as experimental.

## Build

```sh
npm install
npm run build
npx cap sync android
```
