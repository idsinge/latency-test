# SESSION_HANDOFF.md — Current State Handoff

Last updated: 2026-06-02

LLMs reading this file: read `CLAUDE.md`, `AGENTS.md`, and `agents/CLAUDE_REVIEW.md` first. Do not modify files without explicit user approval.

See `agents/KNOWN_ISSUES.md` for open findings from code reviews (Codex, DeepSeek) that were not fixed immediately.

---

## Current Repo State

- Working branch: `webcomponent`. PR #8 (`webcomponent` → `main`) is open.
- Phases 1–7 are complete. v1.0.1 is live on npm as `@adasp/latency-test`.
- `dist/` remains gitignored — generated with `npm run build:component`.
- `demo/` validates the built IIFE bundle via `../dist/latency-test.iife.js`. Run with `npm run build:component && npm run demo`.
- `src/dev-test/` contains local dev-only test pages served by `npm run dev` (no build needed).
- GitHub Pages deploys the VitePress docs site from `docs/.vitepress/dist/` via `.github/workflows/docs.yml`.
- VitePress base is `/latency-test/` → site at `https://idsinge.github.io/latency-test/`.

---

## Recently Completed (this session)

### Phase 7 — npm publication
- Package scope renamed from `@hi-audio` to `@adasp` across all files.
- `src/index.d.ts` created with full TypeScript declarations (`LatencyTestElement`, `LatencyTestEventMap`, all detail interfaces). Ships as `dist/index.d.ts`.
- `package.json`: `types`, `exports.types`, `prepublishOnly`, `publishConfig`, `engines` fields added.
- `scripts/build-component.mjs`: copies `src/index.d.ts` → `dist/index.d.ts` after builds; updated to `node:fs`/`node:path`.
- All Draft/unpublished notices removed from docs and framework examples.
- Framework TypeScript sections updated to use `import type { LatencyTestElement } from '@adasp/latency-test'`.
- Published `@adasp/latency-test@1.0.0` — live on npm, jsDelivr, unpkg (all confirmed).

### v1.0.1 — truth and hardening patch
- **Worker errors surfaced:** `worker.error` and `worker.messageerror` now route through `onError`, guarded with `if (!this.stopped)` to suppress late/stale errors.
- **Startup cleanup:** `start()` catch block stops controller, resets `#pendingRuns = 0` and `#stopped = true`, stops self-owned stream. Prevents resource leaks and spurious `latency-complete(aborted)`.
- **Property defaults:** class field defaults added to `LatencyTestElement` so all public properties return typed values before first assignment.
- **Type accuracy:** `signalType` narrowed to `'mls'`; duplicate `inputGain` removed; JSDoc caveats on `inputGain` and `mediarecorder-2ch`; `aborted?: true` and `bufferSize` added.
- **Docs accuracy:** "Multiple Signal Types" → "MLS-Based Measurement"; all remaining Draft notices removed; demo Mode Toggle `latency-complete` payload bug fixed (`e.detail.latency` → `e.detail.mean`); `dist/index.d.ts` added to build-output.md; demo instructions clarified; `engines` field added to `package.json`.
- Published `@adasp/latency-test@1.0.1`. Tag `v1.0.1` pushed.

---

## Pending Tasks (ordered by priority)

### Immediate
- [ ] Merge PR #8 (`webcomponent` → `main`)

### Independent (no ordering dependency)
- [ ] **CI workflow** — Add `.github/workflows/ci.yml` for PR/push: `npm ci` → `npm test` → `npm run build:component` → `npm run docs:build` → `npm pack --dry-run`. Currently only docs deployment workflow exists.
- [ ] **Node version alignment in CI** — `.github/workflows/docs.yml` uses Node 24; `.nvmrc` pins 18.12.1; `package.json` now has `engines: >=18`. CI should be consistent (Node 20 LTS recommended as a neutral choice).
- [ ] **CDN version pinning** (P3) — `docs/install.md` CDN examples use unversioned URLs. Consider adding a note recommending `@adasp/latency-test@1.0.1` pinned URLs alongside the latest examples.

### Gates Phase 3b
- [ ] **Browser verification matrix** — Manual testing needed before adding a third recording path. Scenarios to verify:
  - MediaRecorder mode: repeated `number-of-tests=1` clicks (5–10×) → expect stable
  - MediaRecorder mode: `number-of-tests=3` → expect all 3 runs stable
  - AudioWorklet mode: repeated `number-of-tests=1` clicks → expect stable
  - AudioWorklet mode: `number-of-tests=3` → expect all 3 runs stable
  - Browsers: Chrome, Firefox, Safari (macOS); iOS Safari if available
  - Rule: always call `getUserMedia` before `new AudioContext()` in demo/host code

### Phase 3b (after verification matrix)
- [ ] Implement `recording-mode="mediarecorder-2ch"` — full spec in `agents/CLAUDE_REVIEW.md` Phase 3b. Key points:
  - Route: MLS `AudioBufferSourceNode` → `ChannelMergerNode` input 0; `createMediaStreamSource(stream)` → input 1; merger → `MediaStreamDestinationNode` → `MediaRecorder`
  - After decode: `getChannelData(0)` = ref, `getChannelData(1)` = mic
  - Guard against mono downmix: emit `latency-error` if `numberOfChannels < 2`
  - MIME type: use `MediaRecorder.isTypeSupported()` to select stereo-capable type
  - Cleanup: disconnect `micSource`, `channelMerger`, `destNode` on stop

### Phase 4 remainder
- [ ] Host-side histogram — `latency-complete` fires with `{ results[], mean, std, min, max }`. Demo page should render a simple histogram from the results array.

### Phase 6 remainder
- [ ] Framework example end-to-end verification — CLAUDE_REVIEW.md gate: before removing the Draft label from any framework example, verify it works against the installed published package (not local source). Currently all Draft labels are removed; if examples are found to be wrong during verification, a patch would be needed.

### Deferred to v2
- `input-gain` GainNode wiring (attribute is observed and typed; currently no-op — use host-gain pattern in the meantime)
- `signal-type="chirp"` and `"golay"` implementation
- `recording-mode="audioworklet"` as the v2 default (breaking change — bump major)
- Phase 8: experimentation toolkit (histogram, waveform, cross-correlation visualisation, config export)

---

## Important Decisions To Preserve

- Do not commit `dist/` — keep it generated.
- Do not move the interactive demo into `docs/public/` — `demo/` is an integration fixture, not VitePress source.
- Always call `getUserMedia` before `new AudioContext()` in demos and host examples — required for correct Firefox macOS sample rate selection.
- The component must not close a host-provided `AudioContext` or stop a host-provided `MediaStream`.
- Three `recording-mode` values each measure a **different pipeline** — do not flatten them. The differences are research data.
- `signalType` is `'mls'` only in v1 — the attribute is observed but the controller never reads it. Do not implement chirp/Golay without updating the full algorithm path.
- `input-gain` is observed and typed but intentionally has no effect in v1. Do not wire a GainNode without updating `src/index.d.ts` and the docs.

---

## npm Release Procedure

```bash
# For a new patch/minor/major after code changes are committed:
npm version patch   # or minor / major
git push --follow-tags
npm publish
```

`prepublishOnly` auto-runs `npm run build:component` before every publish.

Version strategy: v1.x keeps `"mediarecorder"` as default; v2.0.0 switches default to `"audioworklet"` (breaking).
