# AGENTS.md

## Project overview

**Card Centering Grader — Tree Frog Grading**. A Vite + React 19 + TypeScript PWA, plus an Express backend in `server/`.

- **Frontend:** image processing, centering math and grading all run in the browser. Saved cards use IndexedDB and settings use `localStorage`.
- **Backend:** stores submissions and card images, using Postgres (`DATABASE_URL`) and Supabase (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`). See `server/.env.example`.

### Git workflow

Use **GitHub only** (`https://github.com/faebeanie94/tfg-centering`). Remote names differ between checkouts, so run `git remote -v` and use the one that points at that URL: in local checkouts it is `origin`, with no separate `github` remote. Do not push to or open PRs against a GitLab remote unless the user asks.

- Push a branch: `git push -u origin HEAD`
- Open a PR: `gh pr create --repo faebeanie94/tfg-centering`
- Name feature branches `feature/<short-description>`

### Services / commands

Frontend commands live in `package.json` (`dev`, `build`, `preview`):

- Run (dev): `npm run dev` — serves on port `5173` and proxies `/api` to the backend on port `3001`.
- Typecheck + build: `npm run build` (runs `tsc -b` then `vite build`). This is also the only typecheck; there is **no separate lint script**.
- Preview a production build: `npm run preview` (port `4173`).

Backend commands run from `server/`:

- Run (dev): `npm run dev` — serves on port `3001`.
- Tests: `npm test` (Jest). See `server/TESTING.md`.

Detection checks are standalone scripts, for example `node scripts/test-still-card-detect.mjs`. CI does not run them or the backend tests, and some scripts currently fail.

### Non-obvious notes

- Camera and DeviceOrientation/Motion features do not work in headless environments. To exercise the grading flow end-to-end, use the **"Choose from Photos"** button on the home screen (a hidden `<input type="file">`) instead of "Take Photo". Flow: choose image → card size picker (only when Card size is set to ask after each photo) → auto-crop → **Border Editor**, which displays border widths (mm), L|R and T|B percentages, and the TFG grade. Perspective Fix is optional, from the editor's **⋯** menu.
- The Border Editor seeds its card edge and artwork border from auto-crop detection. Borders it could not detect are marked estimated with **~** in the readout, so check them and drag the handles to correct.
- Without the backend running, `/api` calls fail with 500s and the library shows no submissions. Capture and the editor still work.
- CI uses Node 20 and the production `Dockerfile` uses Node 22; both work for local dev/build.
- The production image runs the backend (port `3001`) and ships the built frontend.
- Production deploys to Fly app `tfg-centering` (https://tfg-centering.fly.dev) via GitHub Actions on pushes to `main`, using the `FLY_API_TOKEN` secret. CI only runs the build, and the deploy does not wait for it.
