# Deployment

## One-click Render blueprint

1. Push this repository to GitHub (the blueprint is `render.yaml` at the repository root).
2. In Render, choose **New → Blueprint**, connect `milydily71-cell/Koni-Nime`, and deploy the blueprint.
3. Render builds the Android-independent web frontend as a static site and builds the Kuhi API as a separate Docker web service. The API Docker image clones `https://github.com/aryaniiil/anime-api` at build time and installs its requirements.
4. Wait until both services are healthy. The API root path `/` is used for the health check.
5. If Render assigns the API a different hostname than `https://koni-nime-api.onrender.com`, update `VITE_API_BASE_URL` on the static site to the actual API URL and redeploy the static site.
6. Verify `https://YOUR-API-HOST/anime/spotlight` returns JSON, then open the deployed Koni-Nime site and test search/details.

## Android APK

The GitHub Actions workflow builds an installable debug APK on every push to `main`. Open the Actions run, then download the `Koni-Nime-debug-apk` artifact after the run succeeds. The APK is not a Play Store release and is debug-signed.

## Important notes

- The API is an experimental third-party project. Provider availability, external services, and streaming compatibility can change without notice.
- A Render free instance may sleep when idle, so the first request after inactivity can be slow.
- Do not commit private API keys or hosting credentials to this repository.
- The app's Settings screen can override the API URL stored in the build.
