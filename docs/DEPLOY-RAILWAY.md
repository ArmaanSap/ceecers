# Deploying MARVIN on Railway

MARVIN is a static site plus one small Node server (`scripts/serve.mjs`, no npm dependencies). `dist/` is committed; there is no build step on Railway.

1. Put the project in a GitHub repo (`git init`, commit, push). `.env` is git-ignored; never commit your key.
2. Railway: New Project, Deploy from GitHub repo. It finds the `Dockerfile` and `railway.json` automatically.
3. Service variables:
   - `ANTHROPIC_API_KEY` : your key (server only; the browser never sees it). Without it CAPCOM runs scripted.
   - `TRUST_PROXY=1` : per-visitor CAPCOM rate limits behind Railway's proxy.
   - `CAPCOM_MAX_PER_MIN=120` (optional) : whole-server cap on live calls, protects your bill.
   - `CAPCOM_MODEL` (optional).
   Railway sets `PORT`; the server listens on it and on 0.0.0.0.
4. Settings, Networking: Generate Domain. It is https, which WebXR (Quest VR) requires.
5. Health check is `/healthz` (already in `railway.json`).

Checks after deploy: open the domain; `/healthz` says `ok`; `/api/capcom/status` shows `{"live":true,...}`; About page ZIP link downloads; on a Quest, DEM 3D shows an enabled Enter VR.

Notes
- Before every deploy run `npm run build` (tests + fresh ZIP), commit `dist/`, push.
- Image is about 150 MB; first load of the 3D view fetches several MB of terrain and imagery (gzip on text, ETag revalidation).
- Esri imagery and Google Fonts load from their own servers in the visitor's browser; nothing to configure.
- Keep `docs/` and `tools/` out of the image (`.dockerignore`); they stay in the repo.
- Free-tier sleeping or memory limits: the server keeps gzip copies of text assets in memory (tens of MB). Use at least 512 MB.
