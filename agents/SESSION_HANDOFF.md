# SESSION_HANDOFF.md — Current State Handoff

Last updated: 2026-06-04

LLMs reading this file: read `CLAUDE.md`, `AGENTS.md`, and `agents/CLAUDE_REVIEW.md` first. Do not modify files without explicit user approval.

See `agents/KNOWN_ISSUES.md` for open findings from code reviews (Codex, DeepSeek) that were not fixed immediately.

---

## Current Repo State

- Working branch: `webcomponent`. All PRs merged — branch is ahead of `main` with active development.
- Phases 1–7 complete. **v1.0.2** is live on npm as `@adasp/latency-test`.
- `dist/` remains gitignored — generated with `npm run build:component`.
- `demo/` validates the built IIFE bundle via `../dist/latency-test.iife.js`. Run with `npm run build:component && npm run demo`.
- `src/dev-test/` contains local dev-only test pages served by `npm run dev` (no build needed).
- GitHub Pages deploys the VitePress docs site from `docs/.vitepress/dist/` via `.github/workflows/docs.yml`.
- VitePress base is `/latency-test/` → site at `https://idsinge.github.io/latency-test/`.
- `.nvmrc` pins Node 22. `docs.yml` CI uses Node 24. CDN URLs in `docs/install.md` are pinned to `@1.0.2`.

---

## Recently Completed (2026-06-04)

### Node version + CDN pinning (commit `b5ca800`)
- `.nvmrc` bumped from `18.12.1` to `22` (Node 18 LTS ended April 2025).
- All CDN URLs in `docs/install.md` pinned from unversioned to `@1.0.2` (6 occurrences, jsDelivr + unpkg).
- `docs/install.md` requirements line updated to reflect Node 22.

### AudioWorklet pipeline validity documentation (commit `445884a`)
- `docs/api.md`: `"audioworklet"` description qualified from "accuracy reference" to "accuracy reference for the component's own minimal capture graph".
- `docs/api.md`: New subsection `### Recording mode and pipeline validity` added between the attributes table and `### Example`. Explains that `recording-mode` should match the host app's real capture pipeline; that the AudioWorklet path is a lower-bound estimate for complex host graphs; and names the three factors: render quantum / buffer size, graph topology, scheduling jitter.
- `agents/CLAUDE_REVIEW.md`: Decision #15 added — "AudioWorklet results are representative only of the measured graph."
- `agents/CLAUDE_REVIEW.md`: Phase 3 architecture note extended with an AudioWorklet representativeness caveat block.
- `agents/CLAUDE_REVIEW.md`: Decision #11 corrected — `buffer-size` was incorrectly described as "deferred"; it is wired through to the processor, but nonzero flush behavior is not yet implemented. Default `0` accumulates and posts once on stop.

### Browser verification matrix — complete
- Manual testing completed across Chrome, Firefox, Safari (macOS), iOS Safari.
- Both `mediarecorder` and `audioworklet` modes verified stable across repeated runs and multi-run sequences.
- Phase 3b is now unblocked.

### v1.0.2 (committed 2026-06-03, tag pushed)
- Build fix: worker Blob URL inlining for IIFE (`import.meta.url` was unresolved in IIFE context).
- `#handleError` race: cleanup runs before emit; `latency-complete` fires before `latency-error` on retry.
- Worker construction moved inside try/catch.
- All public docs and agent docs corrected for host-owned resource model.
- Chrome/Edge Verbose note added to `docs/api.md` debug section.

---

## Pending Tasks (ordered by priority)

### Phase 3b — next up, now unblocked
- [ ] Implement `recording-mode="mediarecorder-2ch"` — full spec in `agents/CLAUDE_REVIEW.md` Phase 3b. Key points:
  - Route: MLS `AudioBufferSourceNode` → `ChannelMergerNode` input 0; `createMediaStreamSource(stream)` → input 1; merger → `MediaStreamDestinationNode` → `MediaRecorder`
  - After decode: `getChannelData(0)` = ref, `getChannelData(1)` = mic
  - Guard against mono downmix: emit `latency-error` if `numberOfChannels < 2`
  - MIME type: use `MediaRecorder.isTypeSupported()` to select stereo-capable type
  - Cleanup: disconnect `micSource`, `channelMerger`, `destNode` on stop

### Phase 4 remainder
- [ ] Host-side histogram — `latency-complete` fires with `{ results[], mean, std, min, max }`. Demo page should render a simple histogram from the results array.

### Phase 6 remainder
- [ ] Framework example end-to-end verification — before treating any framework example as verified, test it against the installed published package (not local source). All Draft labels are already removed; if examples are found wrong during verification, a patch is needed.

### Independent
- [ ] **CI Node version consistency** — `.nvmrc` is now `22`, `docs.yml` uses Node 24. Both work; worth aligning to the same version in a future CI pass.

### Deferred to v2
- `input-gain` GainNode wiring (attribute is observed and typed; currently no-op — use host-gain pattern in the meantime)
- `buffer-size` nonzero flush behavior (attribute is wired through; default `0` accumulates and posts once on stop; nonzero values have no effect in v1)
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
- `recording-mode` should match the host app's real capture pipeline. AudioWorklet mode measures a minimal direct graph and is a lower-bound estimate for hosts with more complex AudioWorklet graphs. See Decision #15 in `agents/CLAUDE_REVIEW.md`.
- `signalType` is `'mls'` only in v1 — the attribute is observed but the controller never reads it. Do not implement chirp/Golay without updating the full algorithm path.
- `input-gain` is observed and typed but intentionally has no effect in v1. Do not wire a GainNode without updating `src/index.d.ts` and the docs.
- `buffer-size` is wired through but nonzero flush behavior is not implemented in v1. Do not add flush logic without updating `src/index.d.ts`, `docs/api.md`, and the agent docs.

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
