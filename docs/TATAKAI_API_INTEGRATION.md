# Tatakai API integration notes

Koni-Nime can use the public Tatakai API as a data provider instead of maintaining a separate scraper. API documentation: https://api.tatakai.me/docs

## Integration requirements

- Keep the API base URL configurable; default to `https://api.tatakai.me`.
- Read the live API schema/OpenAPI documentation before wiring search, anime details, episodes, and stream resolution. Do not assume endpoint paths or response fields.
- Normalize provider responses into app-owned models so the UI is independent of upstream response changes.
- Handle loading, empty results, HTTP errors, timeouts, and upstream rate limits in the UI.
- Use artwork URLs returned by the provider; provide a placeholder for missing posters.
- Keep API attribution and the Tatakai API's license/disclaimer visible in project documentation.
- Do not bundle secrets or private API keys in the APK.
- Only surface streams the user is authorized to access; respect source-site terms and copyright.

## Suggested app experience

- **Home:** cinematic featured anime banner, trending and latest-updates rails.
- **Search:** debounced search, genre/status filters, poster grid, and clear empty/error states.
- **Anime details:** backdrop, poster, title, synopsis, genres, status, and episode list.
- **Player:** source/quality selection where available, loading/error recovery, episode navigation, and resume progress.
- **Library:** locally saved watchlist and watch history, with privacy-friendly storage.
- **Navigation:** compact bottom bar for Home, Search, Library, and Settings; dark charcoal surfaces with a violet/cyan accent palette.

This document is planning guidance, not a claim that these screens or API calls are already implemented. Endpoint paths and response models must be verified against the live API docs before implementation.
