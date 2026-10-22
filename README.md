# Koni-Nime

Mobile-first anime discovery frontend with a Node.js/Express compatibility API and a self-hosted ReAnime.to API service.

## Provider architecture

- The frontend calls the Koni-Nime API at `https://koni-nime-api.onrender.com`.
- Koni-Nime's Express API adapts ReAnime API responses for the existing frontend routes.
- The ReAnime service is built from `walterwhite-69/ReAnime.to-API` using `deploy/reanime.Dockerfile`.
- Metadata, episode discovery, servers and stream resolution depend on ReAnime.to and its upstream providers. ReAnime is a third-party source, not a Koni-Nime-owned content catalog.

## Run the Koni-Nime API locally

Requires Node.js 20+.

    cd api
    npm install
    npm test
    npm start

Set `REANIME_API_BASE` to the URL where the ReAnime API is running. The default is `https://koni-nime-reanime.onrender.com`.

## Render deployment

The Blueprint in `render.yaml` defines three services:
- `koni-nime-api`: this repository's Express adapter.
- `koni-nime-reanime`: a Docker service that installs Python requirements and Node.js runtime, then runs the upstream ReAnime FastAPI application and decrypt helper.
- `koni-nime`: the static Vite frontend.

Connect the repository to Render and apply/sync the Blueprint. Check `/v1/health` on the Express service and `/` on the ReAnime service. Free services may sleep after inactivity, so the first request can be slow. ReAnime stream URLs are short-lived; the Koni-Nime adapter does not cache resolved playback URLs.

## Compatibility endpoints

- `GET /anime/spotlight`, `/anime/popular`, `/anime/recent`
- `GET /anime/search?query=...`
- `GET /anime/info/:slug`
- `GET /anime/episodes/:slug`
- `GET /anime/extract/:slug?e=1&type=sub&provider=HD-2`
- Versioned endpoints are under `/v1`.

## Android debug build

The GitHub Actions workflow builds a debug APK for testing. It is not a Play Store release.

## Legal and reliability note

Koni-Nime does not host video files. Use only content and streams you are authorized to access. Review the upstream repository's license and the content provider's terms before public deployment. Upstream scraping and stream access can break when ReAnime.to or FlixCloud changes or blocks hosting IPs.
