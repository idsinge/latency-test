# SESSION_HANDOFF.md — Current State Handoff

Last updated: 2026-05-29

LLMs reading this file: read `CLAUDE.md`, `AGENTS.md`, and `agents/CLAUDE_REVIEW.md` first. Do not modify files without explicit user approval.

---

## Current Repo State

- Working branch has completed Phase 1 through Phase 5.
- Phase 6 documentation/demo work is in progress.
- `dist/` remains gitignored and is generated with `npm run build:component`.
- `demo/` validates the built IIFE bundle via `../dist/latency-test.iife.js`.
- GitHub Pages deploys the VitePress site from `docs/.vitepress/dist/`.
- VitePress uses `base: '/latency-test/'`, so the docs site is served at `https://idsinge.github.io/latency-test/`.

---

## Recently Completed

### Src Demo Split

- `src/index.html` is now the MediaRecorder demo page.
- `src/audioworklet.html` is now the AudioWorklet demo page.
- Both pages load the same `src/scripts/index.js`.
- Recording mode is baked into the page-level `<latency-test>` attribute.
- `src/scripts/index.js` no longer references `modeSelect` or listens for `change` events.
- Mechanism verified: `latency-test-element.js` observes `recording-mode`, and `attributeChangedCallback()` maps it to `recordingMode` before user-triggered `start()`.

### Demo Shared Session Model

- `demo/index.html` now has a Connect Audio step before the tab UI.
- `demo/js/common.js` owns the shared page session:
  - `getUserMedia(MIC_CONSTRAINTS)` first.
  - `new AudioContext({ latencyHint: 0 })` second.
  - Assigns `inputStream` and `audioContext` to every `<latency-test>`.
  - Hides `#connect-section` and reveals `#demo-section` on success.
- `demo/js/context-share.js` no longer creates or tears down its own stream/context.
- `demo/js/mode-toggle.js` no longer creates or tears down its own stream/context.
- `demo/js/minimal.js`, `demo/js/multi-run.js`, and `demo/js/lifecycle.js` were not changed for this refactor.
- Critical invariant verified: no `.close()` or `getTracks()` teardown remains in `demo/js/`.

### GitHub Pages Demo Deployment Direction

- Recommendation accepted: keep `demo/` top-level, keep `dist/` gitignored, and build/copy both into the Pages artifact in CI.
- Target URLs:
  - `https://idsinge.github.io/latency-test/demo/`
  - `https://idsinge.github.io/latency-test/dist/latency-test.iife.js`
- Preferred workflow shape:
  - `npm ci`
  - `npm run docs:build`
  - `npm run build:component`
  - copy `demo/` to `docs/.vitepress/dist/demo`
  - copy `dist/` to `docs/.vitepress/dist/dist`
  - upload `docs/.vitepress/dist`

### Build Script CI Fix

- GitHub Actions failed because `dist/` is gitignored and absent on fresh runners.
- Root cause: `scripts/build-component.mjs` called `readdirSync('dist/')` before ensuring `dist/` exists.
- Fix implemented in `scripts/build-component.mjs`:
  - Import `mkdirSync` from `fs`.
  - Call `mkdirSync('dist', { recursive: true })` inside `cleanDist()` before `readdirSync('dist/')`.
- `npm run build:component` was run locally and passed.

---

## Important Decisions To Preserve

- Do not commit `dist/`; keep it generated.
- Do not move the interactive demo into `docs/public/`; `demo/` is an integration/demo fixture, not VitePress source content.
- Do not solve demo stability by adding `audioContext.resume()` or automatic test start after mic permission.
- Always create the microphone stream before creating `AudioContext` in demos and host examples. This order is required for Firefox macOS sample-rate behavior.
- The component should not close a host-provided `AudioContext` or stop a host-provided `MediaStream`.

---

## Suggested Next Session Start

1. Check `git status --short`.
2. Inspect the latest `.github/workflows/docs.yml` to confirm the Pages copy steps are present.
3. Run `npm run build:component` if touching build or Pages deployment.
4. Run `npm run docs:build` if touching docs or Pages deployment.
5. If CI failed, compare the failure against the `dist/` creation fix before changing workflow structure.

---

## Manual Browser Verification Still Needed

- Serve the repo root with `npx serve .`.
- Open `http://localhost:3000/demo/`.
- Click Connect Audio once.
- Verify Minimal repeated single runs.
- Verify Multi-Run with multiple runs.
- Verify Context Share starts using host-provided resources.
- Verify Mode Toggle runs MediaRecorder then AudioWorklet on the same shared session.
- Verify Lifecycle events still appear in order.
- Re-check Firefox macOS sound/stability, especially MediaRecorder.
