# AGENTS.md

## Cursor Cloud specific instructions

This repo is a single, frontend-only PWA: **Card Centering Grader — Tree Frog Grading**. It is a Vite + React 19 + TypeScript app. All logic (image processing, centering math, grading, persistence) runs in the browser. There is **no backend, no database, and no external API**; saved cards use IndexedDB and settings use `localStorage`.

### Git remotes

Use **GitHub only** (`github` → `https://github.com/faebeanie94/tfg-centering.git`). Do not push to or open PRs against the GitLab `origin` remote unless the user asks. See `.cursor/rules/github-workflow.mdc`.

### Services / commands

There is one service (the Vite dev server). Standard commands live in `package.json` (`dev`, `build`, `preview`):

- Run (dev): `npm run dev` — serves on port `5173`. Use `npm run dev -- --host` to expose on the VM network.
- Typecheck + build: `npm run build` (runs `tsc -b` then `vite build`). This is also the only typecheck; there is **no separate lint script**.
- Preview a production build: `npm run preview` (port `4173`).

### Non-obvious notes

- Camera and DeviceOrientation/Motion features do not work in the headless cloud VM. To exercise the grading flow end-to-end, use the **"Upload Image"** button on the home screen (a hidden `<input type="file">`) instead of "Take Photo". Flow: upload image → "Perspective Fix" screen (click **Skip**) → **Border Editor**, which displays border widths (mm), L|R and T|B percentages, and the TFG grade.
- The Border Editor initializes its green (card edge) and yellow (artwork border) handles at default rectangles; it does not auto-detect the uploaded card's borders, so a freshly uploaded image shows a default (often centered) grade until handles are dragged.
- Node 20 is used in the production `Dockerfile`; Node 22 also works fine for local dev/build.
- PR preview apps are named `tfg-centering-pr-<number>` on Fly and require the `FLY_API_TOKEN` GitHub secret.
