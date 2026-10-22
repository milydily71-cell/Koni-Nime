# Koni-Nime Render deployment

The Blueprint deploys the Express adapter, a self-hosted ReAnime API, and the static frontend.

1. Sync `render.yaml` in Render.
2. Wait for `koni-nime-reanime` to become live, then verify its root endpoint returns JSON with status and endpoint documentation.
3. Wait for `koni-nime-api` to become live and verify `/v1/health`.
4. Verify `/anime/search?query=one%20piece&page=1&per_page=24`, open a title, inspect `/anime/episodes/{slug}`, and test playback with `/anime/extract/{slug}?e=1&type=sub`.
5. The frontend uses the Express service URL configured as `VITE_API_BASE_URL`.

ReAnime's stream endpoint uses short-lived data; playback results are not cached. Free Render services may cold-start, and ReAnime upstream calls can be blocked or unavailable from cloud-hosting IPs. Deploying the source and verifying the live API are separate milestones.
