# CLAUDE.md — weblatencytest

## CRITICAL RULE FOR LLMs

**Always ask the user for confirmation before editing or modifying any existing file.** You may freely read files and propose changes, but do not apply them without explicit approval. This is a research codebase with deliberate design choices that may not be obvious.

---

## Project Overview

**weblatencytest** is a proof-of-concept web application that measures browser round-trip audio latency using an MLS (Maximum Length Sequence) signal and cross-correlation. It is a research tool associated with a WAC 2025 paper (see README.md for citation).

**Status:** The `<latency-test>` Web Component is live and published as `@adasp/latency-test` (v1.x). v1 ships with `MediaRecorder` (2-channel) as the default recording backend. v2 will switch the default to `AudioWorklet` for sample-accurate raw PCM capture.

---

## Tech Stack

- Vanilla JavaScript (ES modules, no framework)
- Web Audio API (`AudioContext`, `AudioBuffer`, `BufferSource`)
- `MediaRecorder` API (current recording mechanism, default in v1 — to be replaced by `AudioWorklet` default in v2)
- Web Workers (off-main-thread cross-correlation computation)
- esbuild (component bundle, ESM + IIFE outputs)
- TypeScript declarations (`src/index.d.ts`) ship with the package as `dist/index.d.ts`
- Unit tests: `node:test` + `node:assert/strict`, Node 22 (pinned via `.nvmrc`), no third-party test library

**Dev commands:**
```
npm test                          # run unit tests (tests/mls.test.js + tests/worker.test.js)
npm run typecheck                 # tsc --noEmit — validates src/index.d.ts and JS against the types
npm run dev                       # static file server — serves src/ natively
npm run demo                      # static file server — serves repo root (demo/ needs built dist/)
npm run build:component           # produces dist/latency-test.esm.js + .iife.js
npm run build:component:dev       # unminified build for debugging
npm run build:component:legacy    # legacy build → dist/latency-test.legacy.{esm,iife}.js (Safari 14 / Chrome 78)
npm run build:component:all       # modern + legacy builds (also run by prepublishOnly)
npm run docs:dev                  # VitePress docs dev server (http://localhost:5173)
npm run docs:build                # build VitePress docs
npm run docs:preview              # preview built docs locally
```

**npm package publishing:** Published as `@adasp/latency-test`. The build pipeline produces both ESM and IIFE bundles (see `npm run build:component`). Distribution fields in `package.json` are set in Phase 5. Full publishing checklist is in agents/CLAUDE_REVIEW.md — Phase 7.

---

## File Map

Ignore `dist/` and `node_modules/` — they are build artifacts.

```
src/
  index.html              — Dev entry point: navigation hub to dev-test and experiment pages (also published to GitHub Pages under /dev/)
  scripts/                — Component source only (compiled into dist/ — do not add dev-only files here)
    latency-test-element.js — <latency-test> Custom Element: lifecycle, attribute reflection, host resource validation, event dispatch
    test.js               — LatencyTestController: MLS generation, mediarecorder/audioworklet capture, worker messaging, result callbacks
    mls.js                — MLS signal generation (LFSR algorithm, tap tables for bits 2–16)
    recorder-processor.js — AudioWorkletProcessor: dual-channel mic+reference capture, posts { mic, ref } Float32 arrays on stop
    worker.js             — Web Worker: cross-correlation and peak detection (off main thread)
    iife-entry.js         — IIFE bundle entry point (re-exports latency-test-element for UMD/IIFE consumers)
  dev-test/               — Development test pages (served by npm run dev, also published to GitHub Pages under /dev/)
    index.js              — Shared UI wiring for mediarecorder.html and audioworklet.html
    gain.js               — UI wiring for host-gain test page; builds ChannelSplitter gain chain
    mediarecorder.html    — MediaRecorder mode test page
    audioworklet.html     — AudioWorklet mode test page
    gain.html             — Host-controlled gain test page
  experiments/            — Research-only experiment pages (served by npm run dev, also published to GitHub Pages under /dev/)
    mr2ch.html            — MediaRecorder 2ch stereo capture feasibility experiment
    mr2ch.js              — Experiment logic (standalone, no component dependency)
    mr1ch.html            — MediaRecorder 1ch experiment: direct mic capture, exposes start-timing bias
    mr1ch.js              — Experiment logic (standalone, no component dependency)
assets/
  ERC_logo.png
docs/
  .vitepress/
    config.mjs            — VitePress site config (nav, sidebar, base URL for GitHub Pages)
  public/
    hi-audio.svg          — Hi-Audio logo served as static asset by VitePress (used in site header)
  index.md                — VitePress home page (hero + features layout)
  api.md                  — Full API reference (attributes, methods, events, signal types)
  install.md              — Installation: npm, CDN, AudioContext sharing
  build-output.md         — dist/ file reference per build command (linked from install.md CDN section, not in sidebar)
  examples/
    vanilla-js.md
    react.md
    vue.md
    svelte.md
    angular.md
    nextjs.md
    host-gain.md
.github/
  workflows/
    docs.yml              — GitHub Actions: build VitePress and deploy to GitHub Pages
```

```
tests/
  mls.test.js             — unit tests for generateMLS() (node:test)
  worker.test.js          — unit tests for calculateCrossCorrelation() and findPeakAndMean() (node:test)
```

```
demo/
  index.html              — Public integration showcase: loads dist/latency-test.legacy.iife.js; grid of 9 demo panels
  style.css               — Demo-only styles: card grid, panels, result boxes, event log, audio info table
  js/
    common.js             — Shared setup: getUserMedia + AudioContext (created once), card-grid toggle, audio info
                            table (AC properties, track settings/constraints/capabilities, stream info, browser),
                            activity indicator, startTest() helper, resultHTML() formatter
    minimal.js            — Panel: Minimal — single run, simplest integration
    multi-run.js          — Panel: Multi-Run — configurable run count with mean/std/min/max aggregates
    context-share.js      — Panel: Context Share — demonstrates host-managed AudioContext & MediaStream pattern
    mode-toggle.js        — Panel: Mode Toggle — runs MediaRecorder then AudioWorklet sequentially for A/B comparison
    audioworklet.js       — Panel: AudioWorklet — recording-mode="audioworklet", multi-run, aggregate stats
    mr1ch.js              — Panel: MediaRecorder 1ch — recording-mode="mediarecorder-1ch" fallback, multi-run, aggregate stats
    lifecycle.js          — Panel: Lifecycle — logs all six latency-* events with timestamps
    debug.js              — Panel: Debug Mode — intercepts console.debug to surface [latency-test] lines on-page
    host-gain.js          — Panel: Host Gain — ChannelSplitter + GainNode chain for low-level mics (e.g. Safari)
```

**Deleted files (no longer in repo):**
- `src/style.css` — removed
- `src/scripts/helper.js` — removed (contained all canvas drawing: waveform, cross-correlation, histogram)

---

## Architecture & Data Flow

```
<latency-test> element (latency-test-element.js)
  └─ start()
        └─ validates host-provided audioContext and inputStream — emits latency-error if either missing
        └─ emits latency-start
        └─ creates Web Worker (worker.js) — lazy, reused across runs, terminated on stop/error/disconnect
        └─ new LatencyTestController()
        └─ controller.initialize(ac, stream, { recordingMode, mlsBits, maxLagMs, ... })
              └─ generateMLS(mlsBits) → binary sequence
              └─ generateAudio() → AudioBuffer (+1.0 / -1.0 samples)
        └─ controller.onAudioSetupFinished()
              └─ prepareAudioToPlayAndRecord()
                    └─ silence buffer (cwilso keepalive — prevents Firefox scheduler relaxing between runs)
                    └─ recordingMode === "audioworklet"     → startWorkletCapture()
                    └─ recordingMode === "mediarecorder-1ch" → startMediaRecorderCapture()
                    └─ else (default "mediarecorder")        → startMediaRecorder2chCapture()

  [mediarecorder path — default 2ch]
        └─ micSource = createMediaStreamSource(inputStream) → ChannelMerger input 0
        └─ noiseSource → ChannelMerger input 1 + audioContext.destination
        └─ ChannelMerger → MediaStreamDestinationNode
        └─ MediaRecorder(destNode.stream).start() + noiseSource.start()
        └─ noiseSource.onended → mediaRecorder.stop()
        └─ onstop → #cleanup2chNodes() → decodeAudioData → check numberOfChannels ≥ 2
        └─ worker.postMessage({ command: 'correlation', data1: ch0 (mic), data2: ch1 (ref), maxLag })

  [mediarecorder-1ch path — fallback]
        └─ noiseSource → audioContext.destination
        └─ MediaRecorder(inputStream).start() + noiseSource.start()
        └─ noiseSource.onended → mediaRecorder.stop()
        └─ onstop → decodeAudioData → worker.postMessage({ command: 'correlation', data1: mic, data2: noiseBuffer, maxLag })

  [audioworklet path]
        └─ loads recorder-processor.js as Blob URL → audioWorklet.addModule()
        └─ AudioWorkletNode(recorder-processor, { numberOfInputs: 2 })
        └─ createMediaStreamSource(stream) → workletNode input 0 (mic)
        └─ noiseSource → workletNode input 1 (reference) + destination
        └─ noiseSource.onended → workletNode.port.postMessage('stop')
        └─ workletNode message ({ mic, ref }) → worker.postMessage({ command: 'correlation', data1: mic, data2: ref, maxLag })

  [Worker: calculateCrossCorrelation]
        └─ O(n × maxLag) time-domain cross-correlation
        └─ maxLag = Math.floor(maxLagMs / 1000 × sampleRate)
        └─ postMessage({ correlation, channel })

  [Worker: findPeakAndMean]
        └─ finds peak index (max squared value) and mean energy (index 0 excluded from energy sum)
        └─ postMessage({ peakValuePow, peakIndex, mean, channel })

  [Controller: displayresults → onResult callback]
        └─ latency (ms) = peakIndex / sampleRate × 1000
        └─ ratio (dB)   = 10 × log10(peakValuePow / mean)
        └─ threshold: ratio > 18 dB → reliable measurement
        └─ onResult({ latency, ratio, reliable, timestamp, mode }) → element emits latency-result
        └─ pending runs? → runNextTest() : emitComplete() → element emits latency-complete
```

---

## Key Algorithmic Details

| Parameter | Value | Notes |
|---|---|---|
| MLS order (nbits) | 15 | Sequence length = 2^15 − 1 = 32767 samples |
| maxLag | 0.600 × sampleRate | 600 ms search window for the correlation peak |
| Reliability threshold | 18 dB | `10 × log10(peakPow / meanEnergy)` |
| Safari gain boost | 50× | Was applied automatically when Safari > v16 and echoCancellation is disabled — now host-controlled via the host-gain pattern (see `docs/examples/host-gain.md`); `getCorrectStreamForSafari()` removed in Phase 1 |
| AudioContext latencyHint | 0 | Requests minimum latency |
| Mic constraints | echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 | Essential for accurate measurement |

---

## DOM Elements

The component (`latency-test-element.js`) has no hardcoded DOM IDs and writes nothing to the DOM — it is headless. The `src/dev-test/` pages own their own UI elements:

| ID | Purpose |
|---|---|
| `#connect-btn` | Button that calls `getUserMedia` and creates the `AudioContext` |
| `#run-count` | Number input: how many consecutive tests (1–20) |
| `#tester` | The `<latency-test>` element itself |
| `#start-btn` | Button that calls `tester.start()` on click |
| `#results` | Inline text: latency ms, ratio dB, reliable flag |
| `#aggregate` | Inline text: mean / std / min / max after multi-run complete |

Results are dispatched as `CustomEvent` from the element. The demo page renders them into `#results` and `#aggregate`.

---

## Current Implementation Notes

Phases 1–3b are complete. Previous design issues are resolved. Remaining known limitations:

1. **`input-gain` removed** — The attribute and `inputGain` property were removed (they were never wired to a GainNode). Input gain is permanently a host responsibility: build a gain chain and pass the processed stream as `inputStream` — see `docs/examples/host-gain.md`. Do not reintroduce the attribute.

2. **`signal-type` not yet wired** — Only `"mls"` is implemented. The attribute is observed but `signalType` is never read by `LatencyTestController`. Deferred to v2.

3. **`recording-mode="mediarecorder"` is now 2-channel (Phase 3b complete)** — Default mode uses `ChannelMergerNode` + `MediaStreamDestinationNode` to capture mic and reference in one stereo stream, removing start-timing bias. Emits `latency-error` if the browser downmixes to mono. **`recording-mode="mediarecorder-1ch"`** is the single-channel fallback (direct mic stream, start-timing bias present) — use when the default fails due to mono downmix, or to deliberately measure the direct-mic pipeline. `"mediarecorder-2ch"` as an attribute value no longer exists.

4. **No histogram** — `latency-complete` fires with aggregate stats (mean/std/min/max). Host-side histogram rendering is a Phase 4 item.

5. **`buffer-size` flush not yet implemented** — The attribute is wired through to `recorder-processor.js` and the value reaches the processor, but nonzero values do not trigger intermediate flushes. Only the final stop flush is implemented. Deferred to v2.

---

## Web Component Status

Phases 1–3b are complete. The `<latency-test>` Custom Element is implemented with:

- Shadow DOM (open mode, empty — headless-first)
- `start()` / `stop()` public methods
- All six events: `latency-start`, `latency-recording`, `latency-processing`, `latency-result`, `latency-complete`, `latency-error`
- `recording-mode="mediarecorder"` (default, 2-channel), `recording-mode="mediarecorder-1ch"` (1-channel fallback), and `recording-mode="audioworklet"` all working
- `worker.js` cross-correlates two buffers: in the audioworklet path these are `{ mic, ref }` Float32 PCM; in the mediarecorder (2ch) path these are `ch0` (mic) and `ch1` (reference) from the decoded stereo recording; in the mediarecorder-1ch path these are the decoded mono recording vs the pre-generated MLS AudioBuffer

**Still in progress:**
- Phase 4: histogram, browser verification matrix across all three modes

**Planned configurable attributes (beyond `number-of-tests`, `mls-bits`, `max-lag-ms`):**

| Attribute | Values | Description |
|---|---|---|
| `recording-mode` | `"mediarecorder"` \| `"mediarecorder-1ch"` \| `"audioworklet"` | Selects the capture backend. `"mediarecorder"`: dual-channel via `ChannelMergerNode` + `MediaStreamDestinationNode`, no start-timing bias, v1 default (implemented). `"mediarecorder-1ch"`: single-channel, direct mic stream, start-timing bias present; use as fallback when browser downmixes stereo to mono (implemented). `"audioworklet"`: raw Float32 PCM, v2 default (implemented). Each mode measures a different pipeline — see Decision #14 in agents/CLAUDE_REVIEW.md. |
| `signal-type` | `"mls"` \| `"chirp"` \| `"golay"` | Selects the test signal. `"mls"` is default. `"chirp"` is a logarithmic sine sweep. `"golay"` uses Golay complementary sequence pairs for high-SNR impulse response measurement. |
| `debug` | boolean \| `false` | Enables `console.debug('[latency-test]', ...)` logging at key internal checkpoints. Development/debugging only — no effect on measurement output. Do not use during measurements you intend to record — `startPairSpanMs` is an upper-bound diagnostic span, not a pure inter-call gap, and DevTools being open can perturb scheduling generally. Implemented. |

**External references used during design:**
- [naomiaro/recording-calibration](https://github.com/naomiaro/recording-calibration) — AudioWorklet two-channel capture (mic + reference loopback), logarithmic chirp, cross-correlation — primary Phase 3 reference
- [padenot/roundtrip-latency-tester](https://github.com/padenot/roundtrip-latency-tester) — AudioWorklet round-trip latency reference (same author as ringbuf.js)
- [padenot/ringbuf.js](https://github.com/padenot/ringbuf.js) — wait-free SPSC ring buffer for SharedArrayBuffer-based AudioWorklet → main thread PCM transfer
- [superpoweredSDK/WebBrowserAudioLatencyMeasurement](https://github.com/superpoweredSDK/WebBrowserAudioLatencyMeasurement) — AudioWorklet + ScriptProcessor fallback pattern

---

## Browser Compatibility Notes

- Chrome/Chromium/Edge: Standard behavior, higher latency variability. First-run latency is often higher than subsequent runs — mitigated by a silent AudioBuffer started at the top of every `prepareAudioToPlayAndRecord()` call (cwilso keepalive technique).
- Firefox: Most stable results (std dev often 0), higher absolute latency on Windows
- Safari: Some devices have low microphone levels with `echoCancellation: false`. Use the host-gain pattern to compensate (see `docs/examples/host-gain.md`). Wired earpods force stereo input (only left channel used).
- iOS: Some devices exhibit aliasing above 12 kHz on audio input, degrading MLS quality. `signal-type="chirp"` (planned, bandlimited to 1500–8000 Hz) will address this — not yet implemented.
- All browsers: require HTTPS (or localhost) for `getUserMedia`

---

## Running Locally

```bash
npm install
npm run dev
# open http://localhost:3000
```
