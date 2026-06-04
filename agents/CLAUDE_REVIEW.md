# CLAUDE_REVIEW.md — Migration Review & Action Plan

This file tracks open questions and the planned action plan for converting `weblatencytest` into a reusable Web Component with AudioWorklet-based recording. LLMs should read this file alongside CLAUDE.md before starting any work.

---

## Decisions Made

| # | Decision | Rationale |
|---|---|---|
| 1 | **Headless-first API** | Primary target is Hi-Audio, which has its own UI. A `start()` method + events interface slots cleanly into any host without conflict. Built-in UI is optional and deferred. |
| 2 | **Keep `worker.js` separate** | The cross-correlation algorithm is validated and correct. No benefit to merging it into the AudioWorklet thread; doing so would add complexity and risk audio glitches. |
| 3 | **v1 default `recording-mode`: `"mediarecorder"`** | MediaRecorder is already implemented and working. v1 ships with it as default. v2 switches the default to `"audioworklet"` once the AudioWorklet processor is stable. Both modes remain available as explicit attribute values in both versions. |
| 4 | **Priority order: minimal migration risk → accuracy → API simplicity** | Migration risk is minimised by keeping the algorithm untouched and refactoring the wrapper only. Accuracy is already handled by the existing cross-correlation logic and the 18 dB threshold — it is preserved, not re-designed. API simplicity is important but params and methods are not yet finalised; keep the surface small and avoid premature abstractions. |
| 5 | **Live demo: dedicated GitHub Pages page, not an embedded sandbox** | The component requires real `getUserMedia` access. Sandboxed iframes (CodeSandbox, StackBlitz) frequently block audio APIs and would give a broken first impression. A standalone `demo/index.html` served at `https://idsinge.github.io/latency-test/demo/` over HTTPS is the right approach. The docs site links to it prominently. This is a Phase 5 deliverable — it cannot exist before the component bundle does. |
| 6 | **npm and CDN are both first-class distribution targets** | Some consumers use bundlers (npm import); others drop in a `<script>` tag. Both paths must be validated before publishing. The component bundle must work in both contexts. |
| 7 | **Root README stays short and repo-oriented once the docs site is live** | The VitePress docs site becomes the canonical integration reference. The README covers repo purpose, origin, run-locally instructions, and research context — not component API details. |
| 8 | **AudioContext ownership: host-provided, component never closes it** | `element.audioContext` is a write-once JS property set by the host before calling `start()`. The component never creates or closes an `AudioContext`. If `audioContext` is not set before `start()`, the element emits `latency-error`. The host owns the full lifecycle — create, resume, close. |
| 9 | **Shadow DOM (open mode), empty root by default** | A shadow root is attached in the constructor but nothing is rendered into it initially (headless). This is the standard custom element pattern, is future-proof if optional UI is added later, and ensures event retargeting works correctly. Open mode is used so host apps can inspect internals when debugging; no CSS custom properties are exposed in v1 since there is no visible UI. |
| 10 | **Lifecycle events: fire `latency-start`, `latency-recording`, `latency-processing`, `latency-result`, `latency-error`, `latency-complete`** | Host apps need state transitions to update their own UI (disable buttons, show spinners). Events are low-cost to emit and high-value for consumers. `latency-start` fires after permission is granted; `latency-recording` when MLS playback and capture begin; `latency-processing` when recording ends and the worker starts; `latency-result` with `{ latency, ratio, reliable, timestamp, mode }`; `latency-error` with `{ message }`; `latency-complete` when all N tests finish (immediately after the single result in v1). |
| 11 | **AudioWorklet: `numberOfOutputs: 1`, Blob URL, `buffer-size` wired through** | Zero-output node risks input starvation — `numberOfOutputs: 1` with unconnected output is the known workaround. Blob URL inlining makes the processor self-contained for npm/CDN. The `buffer-size` attribute is wired through to the processor; nonzero flush behavior not yet implemented — default `0` accumulates and posts once on stop. |
| 12 | **Measurement inherits the host's audio environment** | The component does not create an idealized measurement environment. It inherits the host's `AudioContext` (sample rate, latency hint, buffer chain) and mic stream (constraints, backend). The latency result reflects the host's actual recording pipeline — system buffers included. If the host uses `recording-mode="audioworklet"` on Safari, the ~30ms system buffer IS part of the correct measurement. MediaRecorder path gives an optimistic value because it bypasses system buffers. Both are valid; they measure different things. |
| 13 | **Mic constraints are host's responsibility** | The component only accepts host-provided streams — it never calls `getUserMedia()`. The host is responsible for all stream constraints (`echoCancellation`, `channelCount`, `sampleRate`, etc.). |
| 14 | **Three `recording-mode` values: `"mediarecorder"`, `"mediarecorder-2ch"`, `"audioworklet"`** | Each mode measures the latency of its own specific pipeline — they are not three ways to measure the same thing. `"mediarecorder"`: single-channel, mic stream used directly (`this.inputStream → MediaRecorder`), closest to the production DAW recording path, but has an unknown start-timing bias because `noiseSource.start()` and `mediaRecorder.start()` are on different clocks. `"mediarecorder-2ch"`: dual-channel via `ChannelMergerNode` + `MediaStreamDestinationNode`, removes start-timing bias (both signals share one encoded stream), channel-relative timing is stable in practice but not a sample-accurate API guarantee; adds extra Web Audio nodes so measures a **different pipeline** than `"mediarecorder"` (the overhead direction is browser-dependent — treat as a hypothesis to measure, not an assumption). `"audioworklet"`: raw Float32 PCM, shared AudioContext clock, no codec round-trip — the accuracy reference. The *differences between modes* are the research finding: they expose the contribution of JS start-timing bias, codec overhead, and extra-node latency to the final measurement. This design targets both industrial calibration and research comparison. |
| 15 | **AudioWorklet results are representative only of the measured graph** | The implemented `"audioworklet"` path captures a minimal direct graph: `inputStream → MediaStreamAudioSourceNode → AudioWorkletNode`, with the reference captured in the same `process()` call. This removes start-timing bias but does not emulate a host app's full AudioWorklet graph. For hosts with different render quantum / effective buffering, additional processing nodes, or more complex graph scheduling, the component's AudioWorklet result should be treated as a lower-bound estimate rather than the exact latency of the host pipeline. MediaRecorder modes are less sensitive to graph topology because they use browser-managed capture pipelines. |

---

## Open Questions

### 1. AudioWorklet Recording Strategy

The current `MediaRecorder` approach captures audio as a compressed Blob, then decodes it back to PCM — introducing codec latency and quality loss. Two alternatives exist for AudioWorklet:

**Option A — SharedArrayBuffer (ring buffer)**
- Worklet writes raw Float32 PCM directly into a `SharedArrayBuffer`; main thread reads it when recording ends.
- Zero-copy, sample-accurate.
- **Requires** cross-origin isolation headers on the server: `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. This may block embedding in DAWs that don't set these headers.

**Option B — MessagePort chunking**
- Worklet sends Float32Array chunks back via `postMessage` on each `process()` call.
- Works without COOP/COEP headers, but has some GC pressure from repeated transfers.
- Chunks can be transferred (not copied) using `Transferable` to mitigate this.

> **Question:** Which option fits better with Hi-Audio's hosting environment? Does Hi-Audio already set COOP/COEP headers?

---

### 2. AudioContext Ownership

**Resolved — see Decision #8.**

`element.audioContext` must be set by the host before calling `start()`. The component never creates or closes an `AudioContext`. Emits `latency-error` if missing at `start()` time. The host owns the full lifecycle.

---

### 3. Component Public API

The headless-first decision shapes this directly. The primary interface is imperative + events; built-in UI is not part of the first version.

**Methods (imperative interface — primary)**

| Method | Description |
|---|---|
| `start()` | Begins a latency test run (or a sequence if `number-of-tests` > 1) |
| `stop()` | Aborts an in-progress test |

**Attributes / Properties**

| Name | Type | Default | Description |
|---|---|---|---|
| `number-of-tests` | number | `1` | Consecutive tests to run (was removed from current code; re-implemented as component attribute) |
| `mls-bits` | number | `15` | MLS order (sequence length = 2^n − 1). Only applies when `signal-type="mls"`. |
| `max-lag-ms` | number | `600` | Cross-correlation search window in ms |
| `recording-mode` | string | `"mediarecorder"` *(v1)* / `"audioworklet"` *(v2)* | Capture backend. Three values: `"mediarecorder"` — single-channel, mic stream used directly, closest to production DAW path, has unknown JS start-timing bias (v1 default); `"mediarecorder-2ch"` — dual-channel via `ChannelMergerNode` + `MediaStreamDestinationNode`, removes start-timing bias, channel-relative stable but not sample-accurate, measures a slightly different pipeline due to extra Web Audio nodes; `"audioworklet"` — raw Float32 PCM, shared AudioContext clock, no codec round-trip, accuracy reference (v2 default). `ScriptProcessor` is not an attribute value but noted as an older-browser reference. |
| `signal-type` | string | `"mls"` | Test signal. `"mls"` = Maximum Length Sequence (default). `"chirp"` = logarithmic sine sweep. `"golay"` = Golay complementary sequence pair. |
| `input-gain` | number | `0` | Gain multiplier applied to the input stream before capture. `0` = no gain. Generalises the hardcoded Safari 50× workaround into a general user-configurable param. |

**Events dispatched by the component**

| Event | `detail` payload | Description |
|---|---|---|
| `latency-start` | `{}` | Host resources validated; test is about to begin |
| `latency-recording` | `{}` | MLS playback started; capture is running |
| `latency-processing` | `{}` | Recording stopped; cross-correlation worker is running |
| `latency-result` | `{ latency, ratio, reliable, timestamp, mode }` | Result of one test run. `reliable` is `true` when `ratio > 18 dB`. `mode` is the `recording-mode` value that produced the result (`"mediarecorder"`, `"mediarecorder-2ch"`, or `"audioworklet"`) — essential for cross-mode comparison. |
| `latency-complete` | `{ results[], mean, std, min, max }` | All N runs finished (fires immediately after the single result in v1). Each item in `results[]` is a full `LatencyResultDetail` — includes `mode`, so multi-run/multi-mode tooling retains provenance per result. |
| `latency-error` | `{ message }` | Missing host resource, AudioContext, or worker failure |

The demo `index.html` will own the button and result display, wiring them to `element.start()` and the `latency-result` event. This replaces what `displayStart()` and `displayresults()` currently do inside `test.js`.

Note: `recording-mode` makes the AudioWorklet migration non-breaking — both backends can coexist. `input-gain` promotes the Safari-only gain workaround into a general explicit API. For very old browser support, `ScriptProcessor` (deprecated, no longer part of the Web Audio spec) is documented as a reference pattern via [superpoweredSDK/WebBrowserAudioLatencyMeasurement](https://github.com/superpoweredSDK/WebBrowserAudioLatencyMeasurement) but is not a first-class `recording-mode` value in the component.

**Signal type notes:**
- `"chirp"`: logarithmic sine sweep; cross-correlation with matched filter (time-reversed chirp) gives the impulse response. Reference implementation: [naomiaro/recording-calibration](https://github.com/naomiaro/recording-calibration).
- `"golay"`: Golay complementary sequence pair (sequences A and B). The sum of their individual autocorrelations equals a perfect impulse, giving high SNR even in noisy environments. Requires two playback-and-record passes. More complex than MLS but superior in reverberant or noisy conditions.

**External references:**
- [naomiaro/recording-calibration](https://github.com/naomiaro/recording-calibration) — AudioWorklet + chirp sweep, cross-correlation, adaptive amplitude control
- [padenot/roundtrip-latency-tester](https://github.com/padenot/roundtrip-latency-tester) — AudioWorklet round-trip latency reference (same author as ringbuf.js)
- [superpoweredSDK/WebBrowserAudioLatencyMeasurement](https://github.com/superpoweredSDK/WebBrowserAudioLatencyMeasurement) — AudioWorklet + ScriptProcessor fallback pattern for older browsers
- [padenot/ringbuf.js](https://github.com/padenot/ringbuf.js) — Wait-free SPSC ring buffer for SharedArrayBuffer-based AudioWorklet → main thread PCM transfer (Option A implementation)
- [A wait-free SPSC ring buffer for the web](https://blog.paul.cx/post/a-wait-free-spsc-ringbuffer-for-the-web/) — Paul Adenot's blog post explaining the design rationale

> **Question:** Is `start()` / `stop()` + events sufficient for Hi-Audio's integration needs, or is additional control required (e.g. passing a pre-existing stream, or hooking into a specific point in the audio graph)?

---

### 4. Shadow DOM Mode

**Resolved — see Decision #9.**

Shadow DOM, open mode, with an empty shadow root attached in the constructor. No CSS custom properties are exposed in v1 — the component has no visible UI to style.

---

### 5. Safari Gain Workaround

**Resolved.**

The `input-gain` attribute is a general-purpose gain multiplier. **The GainNode is not yet wired** — the attribute is observed and the property is set, but no gain is applied in the current code. Wiring the GainNode is deferred to v2. No browser detection lives inside the component.

The hardcoded `getCorrectStreamForSafari()` method in `test.js` is **removed during Phase 1**. Its responsibility moves to the host: if the host knows it is running on Safari ≥ 16 with `echoCancellation: false`, it sets `element.inputGain = 50` before calling `start()`. The demo page will include a code example showing this pattern.

Residual Safari AudioWorklet timing concerns (frame drops, scheduling jitter) are a Phase 4 testing item and are handled best-effort — they do not block Phase 1–3 work. Users on Safari can always fall back to `recording-mode="mediarecorder"` which is the v1 default anyway.

---

### 6. Worker Strategy (cross-correlation)

`worker.js` runs cross-correlation off the main thread. Two options for the migrated design:

**Option A — Keep worker.js as a separate Web Worker (recommended)**
- The AudioWorklet collects PCM; when done it sends the buffer to the main thread, which forwards it to the existing worker.
- Minimal refactor, proven and validated logic.

**Option B — Merge into the AudioWorklet processor**
- Run cross-correlation inside the AudioWorklet's dedicated thread after recording finishes.
- Avoids an extra postMessage hop, but AudioWorklet threads have real-time priority — running a heavy O(n × maxLag) loop there risks audio glitches in other connected nodes.

> **Recommendation:** Keep worker.js as-is (Option A). The bottleneck is the O(n × maxLag) correlation loop (~32767 × 26460 ops at 44100 Hz), which is already off the main thread and requires no changes regardless of recording method.

---

### 7. Bundler / Distribution Format

**Resolved — see Decision #6.**

Both npm import and CDN/script-tag are first-class targets. The concrete packaging strategy (single bundle vs unbundled ES modules, AudioWorklet processor inlining vs separate asset) is a Phase 5 deliverable. Key constraint: `AudioContext.audioWorklet.addModule()` requires a URL, so the processor file must be either inlined as a Blob URL or shipped as a separate asset alongside the bundle.

---

### 8. Histogram / Multi-test Visualization

**Resolved** by the headless-first decision.

`helper.js` (which contained all canvas drawing including the histogram) was deleted during simplification. The component will not re-implement histogram rendering. Instead:

- After `number-of-tests` runs complete, the component fires `latency-complete` with the full results array (`{ results[], mean, std, min, max }`).
- The host app (or demo page) renders the histogram however it chooses.

This is the correct approach for DAW embedding: Hi-Audio controls its own UI, and the component stays out of the way.

---

### 9. Lifecycle / State Events

**Resolved — see Decision #10.**

All six events are emitted from v1. See the updated events table in Q3 above.

---

### 10. Stream Ownership / Permission Model

**Resolved — host-required, same model as AudioContext (Decision #8).**

`element.inputStream` must be set by the host before calling `start()`. The component never calls `getUserMedia` or stops stream tracks. Emits `latency-error` if missing at `start()` time. The host owns the full mic lifecycle.

---

## Action Plan

Below is the proposed sequence of migration tasks. **No file should be modified until the open questions above are resolved and the user has explicitly approved each step.**

### Phase 0 — Decisions (prerequisite)
- [x] AudioContext ownership model — Q2 → Decision #8
- [x] Shadow DOM mode — Q4 → Decision #9
- [x] Lifecycle events scope — Q9 → Decision #10
- [x] Headless-first API confirmed — Decision #1
- [x] Keep worker.js separate — Decision #2
- [x] v1 recording-mode default — Decision #3
- [x] Priority order — Decision #4
- [x] Live demo strategy — Decision #5
- [x] npm + CDN both first-class — Decision #6
- [x] README scope — Decision #7
- ~~Histogram/visualization approach~~ — resolved: emit `latency-complete` event, host renders
- [x] Stream/permission model — Q10 resolved: host-provided only; component never calls getUserMedia or stops tracks; emits latency-error if inputStream or audioContext missing at start()
- [x] Safari gain workaround — Q5 resolved: input-gain attribute is general-purpose; getCorrectStreamForSafari() removed in Phase 1; host decides gain value; Safari AudioWorklet timing is Phase 4 best-effort
- [ ] AudioWorklet recording strategy (SharedArrayBuffer + ringbuf.js vs MessagePort) — Q1 — still open, not a blocker for Phase 1–2
- ~~Distribution format (Q7)~~ — deferred to Phase 5

### Phase 1 — Refactor `TestLatencyMLS` to instance-based class
- [x] Convert all `static` methods and properties to instance methods and fields
- [x] Strip all DOM manipulation out of the class: `displayStart()` and `finishTest()` are kept as no-op callback stubs in `test.js` (they call `onReady?.()` and `onProcessing?.()` respectively); `innerHTML` writes in `displayresults()` replaced by `onResult` callback
- [x] Replace DOM side-effects in `displayresults()` with a callback or event emission
- [x] Remove `getCorrectStreamForSafari()` — browser detection and gain selection moves to the host/demo page; the component applies whatever `input-gain` value it receives via its property
- [x] Keep `mls.js` untouched. `worker.js` received two changes for unit testing: `export` added to both functions and `addEventListener` wrapped in a `WorkerGlobalScope` guard — no behavioural change in production.

### Phase 2 — Create the Custom Element shell
- [x] Create `src/scripts/latency-test-element.js` — the Custom Element class extending `HTMLElement`
- [x] Attach shadow root (open mode) in constructor — leave it empty for now
- [x] Expose `start()` and `stop()` as public methods
- [x] Expose `audioContext` as a write-once JS property (Decision #8): host must assign before `start()`; component never creates or closes it; emits `latency-error` if missing
- [x] Wire observed attributes (`number-of-tests`, `mls-bits`, `max-lag-ms`, `recording-mode`, `signal-type`, `input-gain`)
- [x] Dispatch all six lifecycle + result events (Decision #10): `latency-start`, `latency-recording`, `latency-processing`, `latency-result`, `latency-complete`, `latency-error`
- [x] The component never calls `getUserMedia()`. Host must assign `inputStream` before `start()`; component emits `latency-error` if missing.
- [x] Handle `connectedCallback` and `disconnectedCallback`: on disconnect, stop any in-progress test, terminate the worker, and disconnect audio nodes — do not close the AudioContext (host always owns cleanup per Decision #8)
- [x] Chrome first-run latency: mitigated by a silent AudioBuffer started inside `prepareAudioToPlayAndRecord()` in `test.js` on every test run. Based on Chris Wilson's metronome technique. Note: `#startSilence()` was never a separate method — the logic is inline.

### Phase 3 — AudioWorklet processor (replaces MediaRecorder)

> **Architecture note — WAC 2025 peer review + naomiaro/recording-calibration reference:**
>
> A peer reviewer identified a fundamental weakness in the current MediaRecorder approach: the duration between `mediaRecorder.start()` and `noiseSource.start()` is variable and unknown, introducing an uncontrolled timing offset into every measurement. The fix is to record both the output signal (MLS/chirp reference) and the mic input simultaneously as two inputs to the same AudioWorklet, then cross-correlate those two captures against each other. This makes the measurement timing-independent — the start moment is shared by both channels — and keeps all latency-critical computation in the audio domain, eliminating JavaScript scheduler jitter.
>
> This architecture is already validated in [naomiaro/recording-calibration](https://github.com/naomiaro/recording-calibration): the worklet is created with `numberOfInputs: 2` (input 0 = mic, input 1 = reference signal loopback), and each `process()` call posts `{ mic, ref }` chunks. Cross-correlation runs on the two captured buffers, not against the pre-known MLS sequence.
>
> For the chirp signal type, bandlimit to **1500–8000 Hz** (matching the naomiaro reference). This implicitly avoids the aliasing distortion above 12 kHz present on some iOS devices without needing platform detection.
>
> **AudioWorklet representativeness caveat:**
>
> The current `"audioworklet"` implementation measures the component's minimal capture graph, not an arbitrary host app's full AudioWorklet graph. Capturing mic and reference in the same `process()` call removes start-timing bias, but it does not account for host-specific render quantum / buffering, intermediate node topology, or scheduling jitter introduced by a more complex graph. Treat this path as the accuracy reference for the component's own graph and as a lower-bound estimate for hosts with more complex AudioWorklet pipelines.

- [x] Create `src/scripts/recorder-processor.js` — `AudioWorkletProcessor` with `numberOfInputs: 2`
  - Input 0: mic stream (via `MediaStreamAudioSourceNode` → worklet)
  - Input 1: MLS reference signal loopback (same `AudioBufferSourceNode` connected to both `AudioContext.destination` and the worklet)
  - `buffer-size` wired through to the processor; nonzero flush behavior not yet implemented — default `0` accumulates and posts once on stop
- [x] Implement `process()` to buffer both channels and post `{ mic, ref }` on stop
- [x] Implement data-return strategy: MessagePort accumulation, single post on stop (plain arrays, no transferables — MLS-length captures are small enough; SharedArrayBuffer deferred — Q1 still open)
- [x] Worker.js contract unchanged — both paths use `{ command: 'correlation', data1, data2, maxLag }`
- [x] Wire the worklet into the latency test flow alongside the existing MediaRecorder path, selected via `recording-mode` attribute
- [ ] `input-gain` GainNode deferred to v2
- [ ] `signal-type="chirp"` bandlimit deferred
- [x] Validate measurement stability across multiple runs (Chrome + Firefox — numbers match MediaRecorder path)

> **Firefox volume note:** The worklet captures both channels from the same audio graph — mic
> (input 0) and reference loopback (input 1). Both reflect the same acoustic environment, so
> `peakValuePow / mean` is unaffected. The real improvement over MediaRecorder is the shared
> start time between the two captured channels, eliminating the uncontrolled timing offset.

### Phase 3b — MediaRecorder two-channel capture (`recording-mode="mediarecorder-2ch"`)

> **Architecture note — merged from WAC 2025 peer reviewer + dual-agent review (Claude + Codex):**
>
> The single-channel MediaRecorder path has a **timing bias** (not merely jitter): `noiseSource.start()` and `mediaRecorder.start()` operate on different clocks. `maxLag` makes the peak searchable but does not remove this bias — the measured lag can be systematically offset by the unknown JS start gap on every run.
>
> The two-channel MediaRecorder approach addresses this by routing both the reference signal and the mic through a `ChannelMergerNode` → `MediaStreamDestinationNode`, encoding them together in a single Opus/AAC stream. Both signals share the same encoded timeline, so the start-timing bias is eliminated. Inter-channel timing is **channel-relative stable in practice** (same codec frame), but this is not a sample-accurate API guarantee — browsers may resample, pad, or handle stereo differently depending on container and codec.
>
> **Critical design constraint:** The mic must pass through `createMediaStreamSource` to enter the Web Audio graph for mixing. This node — together with `ChannelMergerNode` and `MediaStreamDestinationNode` — adds latency not present in the direct `"mediarecorder"` path. Therefore `"mediarecorder-2ch"` measures a **different pipeline** than `"mediarecorder"`. This is intentional: the three modes each measure their own pipeline, and the differences between them are the research data.
>
> **`createMediaStreamSource` is unavoidable** in standard cross-browser Web APIs. `MediaStreamTrackGenerator` (Breakout Box API) is a Chrome-only alternative that adds complexity without reducing the fundamental overhead — not recommended.

Routing:

```
MLS AudioBufferSourceNode    →  ChannelMergerNode(2) input 0  →  MediaStreamDestinationNode  →  MediaRecorder
Mic createMediaStreamSource  →  ChannelMergerNode(2) input 1  ↗
MLS AudioBufferSourceNode    →  audioContext.destination  (speaker playback — unchanged)
```

After Blob decode (`decodeAudioData`):
- `buffer.getChannelData(0)` = reference MLS (pre-DAC, from Web Audio graph)
- `buffer.getChannelData(1)` = mic recording

Cross-correlate ch1 against ch0 — worker contract unchanged: `{ command: 'correlation', data1: mic, data2: ref, maxLag }`.

- [ ] Add `"mediarecorder-2ch"` as a valid value for `recording-mode` attribute in `latency-test-element.js` and `LatencyTestController`
- [ ] Implement `#startMediaRecorder2ChCapture()` method in `LatencyTestController`
- [ ] Create `ChannelMergerNode(2)`: connect MLS `AudioBufferSourceNode` → input 0; `createMediaStreamSource(this.inputStream)` → input 1
- [ ] Connect merger → `audioContext.createMediaStreamDestination()`; pass `.stream` to `MediaRecorder` (replacing direct `this.inputStream`)
- [ ] After Blob decode: extract `getChannelData(0)` as `ref`, `getChannelData(1)` as `mic`; post to worker as `{ data1: mic, data2: ref, maxLag }`
- [ ] Verify stereo channels are preserved (ch0 ≠ ch1) after decode in Chrome, Firefox, Safari
- [x] Add `mode` field to `latency-result` event payload: `{ latency, ratio, timestamp, mode }`; emitted from both implemented paths (`mediarecorder` and `audioworklet`). `mediarecorder-2ch` emits `latency-error` instead of a result — it does not produce a `latency-result` event until Phase 3b is implemented.
- [ ] Update TypeScript `LatencyResultDetail` interface to include `mode: 'mediarecorder' | 'mediarecorder-2ch' | 'audioworklet'`
- [ ] Guard against browser mono downmix: after `decodeAudioData`, check `audioBuffer.numberOfChannels < 2` and emit `latency-error` (`{ message: 'mediarecorder-2ch: browser downmixed stereo to mono' }`) rather than proceeding — prevents silent mis-measurement
- [ ] MIME type strategy: use `MediaRecorder.isTypeSupported()` to select a stereo-capable type (e.g. `'audio/webm;codecs=opus'`); log `mediaRecorder.mimeType` after construction; stereo preservation per browser/MIME should be verified during the Chrome/Firefox/Safari validation pass
- [ ] Cleanup on `stop()` and `noiseSource.onended`: disconnect `micSource`, `channelMerger`, `destNode`, and `noiseSource`; call `mediaRecorder.stop()` if still recording; clear `ondataavailable` and `onstop` handlers to prevent leaks
- [ ] Emit `latency-processing` when `mediaRecorder.onstop` fires, consistent with the other two recording paths
- [x] Floor `maxLag` to an integer before posting to the worker: `Math.floor((this.maxLagMs / 1000) * this.audioContext.sampleRate)` — fixed in both worklet and mediarecorder paths in `test.js`
- [x] Document in `docs/api.md`: `"mediarecorder-2ch"` measures a different pipeline than `"mediarecorder"` due to extra Web Audio nodes; the difference is intentional and is itself a measurable research quantity

### Phase 4 — Demo page & integration
- [x] Rewrite `src/index.html` as a minimal demo: a plain button that calls `element.start()` and a `<latency-test>` element
- [x] Demo page listens for `latency-result` and `latency-error` and updates its own UI
- [ ] Demo page optionally listens for `latency-complete` and renders a histogram (host-side) — aggregate stats (mean/std/min/max) are shown; histogram not yet implemented
- [ ] Verify `worker.js` works correctly with Float32 PCM coming from the AudioWorklet path
- [ ] Test `number-of-tests` > 1 loop driven by the component

### Phase 5 — Build & distribution

**Approach:** esbuild + stdin-based inlining (build script string-substitutes worker/processor source before esbuild sees the code, avoiding esbuild's Worker auto-bundling heuristic). ESM for npm, IIFE for CDN. Parcel removed — demo served directly from `src/` via static file server.

#### Decisions (confirmed by review)
- [x] Tool chosen: esbuild (JS API, not CLI). One devDependency, ESM + IIFE output, built-in minification + source maps.
- [x] Source maps: enabled (one esbuild flag).
- [x] `sideEffects: true` in `package.json` — prevents bundler tree-shaking of the registration side effect.
- [x] `files: ["dist/"]` in `package.json` — whitelist-only npm package contents.
- [x] CSP documented: `blob:` URLs for workers + AudioWorklet require `worker-src 'self' blob:` / `script-src 'self' blob:`.
- [x] Inlining strategy resolved: esbuild plugin intercepts `test.js` loading, replaces URL patterns with inlined Blob URL source. No `new Worker(new URL(...))` reaches esbuild — prevents spurious secondary worker files.
- [x] Output filename convention: `.esm.js` (npm ESM) + `.iife.js` (CDN). Phase 7 template updated to match. No CJS output (Web Components browser-only).

#### Implementation (done, verified)
- [x] Fix `src/scripts/test.js` — add `.js` extension to `./mls` import.
- [x] Fix `src/scripts/latency-test-element.js` — reorder stream release before event in `#emitComplete()`. Add SSR guard to registration.
- [x] Create `scripts/build-component.mjs` — esbuild JS API with plugin-based inlining.
- [x] Update `package.json` — remove Parcel, add esbuild, add distribution fields (`exports`, `module`, `main`, `files`, `sideEffects`, `unpkg`, `jsdelivr`), add `build:component` script.
- [x] Clean up `.parcel-cache/`.
- [x] Verified: `npm run build:component` produces both bundles + source maps (no spurious worker-HASH.js).
- [x] Verified: `npm pack --dry-run` lists only `dist/`, `README.md`, `LICENSE`, `package.json` (7 files, 97KB).
- [x] The component bundle is a prerequisite for the live demo page (Phase 6).

### Phase 6 — Documentation & demo

### Phase 6 — Documentation & demo
- [ ] Update README.md to stay short and repo-oriented once the docs site is live (Decision #7)
- [ ] Remove component API details from README — those belong in the VitePress docs
- [ ] Document public API (attributes, properties, events, methods) in `docs/api.md` — mark planned items clearly
- [ ] Document CSS custom properties for theming if Shadow DOM is open
- [ ] Create `demo/index.html` — standalone showcase gallery (no framework, no build step) that pairs code snippets with live working component instances. Patterns to show: (1) minimal headless — `start()` + `latency-result` event; (2) AudioContext injection — host creates the context and passes it via `element.audioContext`; (3) input-gain usage — demonstrating Safari compensation; (4) all lifecycle events — showing `latency-start`, `latency-recording`, `latency-processing`, `latency-result`. Each pattern shows the code alongside a rendered, clickable `<latency-test>` element.
- [ ] Deploy `demo/` alongside the VitePress build in the GitHub Actions workflow (update `.github/workflows/docs.yml` to copy `demo/` into the Pages output)
- [ ] Link the live demo prominently from `docs/index.md` ("Try it live →" on the hero and install page)
- [ ] Add a `docs/demo.md` page that embeds the live demo via a same-origin iframe (the demo is hosted on the same GitHub Pages deployment, not a third-party sandbox) and explains what to expect
- [ ] **Pre-release gate:** before removing the `> **Draft.**` notice from any framework example page, verify a working end-to-end example in that framework against the actual installed published package — not against the local source. Draft labels stay until that verification is done.

### Phase 7 — npm publishing

> **Prerequisite:** Phases 1–5 must be complete. The component bundle must exist before publishing.

#### One-time setup (do once, not per release)

**1. Create the npm organisation**

The package name `@adasp/latency-test` requires an `adasp` org on npmjs.com.

- Go to https://www.npmjs.com and log in (or create an account).
- Create the organisation `adasp` at https://www.npmjs.com/org/create.
- Add any collaborators who should be able to publish.

**2. Update `package.json` for publishing**

Before the first publish, verify the following fields are present in `package.json` (these should already be set in Phase 5):

```json
{
  "name": "@adasp/latency-test",
  "version": "1.0.0",
  "description": "...",
  "type": "module",
  "main": "dist/latency-test.esm.js",
  "module": "dist/latency-test.esm.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/latency-test.esm.js",
      "default": "./dist/latency-test.esm.js"
    }
  },
  "unpkg": "dist/latency-test.iife.js",
  "jsdelivr": "dist/latency-test.iife.js",
  "files": [
    "dist/",
    "README.md",
    "LICENSE"
  ],
  "sideEffects": true,
  "scripts": {
    "build:component": "node scripts/build-component.mjs",
    "prepublishOnly": "npm run build:component"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

Key points:
- No CJS exports — Web Components are browser-only APIs. `require('@adasp/latency-test')` would have no meaningful use. The `main` field points to the ESM bundle and `module` mirrors it; `unpkg`/`jsdelivr` fields point to the IIFE for CDN consumers.
- `types` / `exports["types"]` points to the TypeScript declaration file — consumers get full IntelliSense with no manual setup.
- `unpkg` / `jsdelivr` fields point to the IIFE bundle — so `unpkg.com/@adasp/latency-test` serves the script-tag-compatible version.
- `files` controls what gets included in the published package — only the built output, README, and LICENSE. Everything else (`src/`, `docs/`, `assets/`, config files) is excluded automatically.
- `sideEffects: true` prevents bundler tree-shaking from removing the `customElements.define()` side effect.
- `prepublishOnly` ensures the build runs before every publish, preventing a stale `dist/` from being published.
- `publishConfig.access: "public"` is **required** for scoped packages (`@scope/name`) — without it npm defaults to private and the publish will either fail or charge for a private package.

**3a. Create `src/index.d.ts` — TypeScript declaration file**

This file ships with the package and gives consumers typed access to the element, its properties, methods, and event payloads with no manual setup:

```ts
export interface LatencyResultDetail {
  latency: number
  ratio: number
  reliable: boolean
  timestamp: number
  mode: 'mediarecorder' | 'mediarecorder-2ch' | 'audioworklet'
}

export interface LatencyCompleteDetail {
  results: LatencyResultDetail[]
  mean: number
  std: number
  min: number
  max: number
}

export interface LatencyErrorDetail {
  message: string
}

interface LatencyTestEventMap extends HTMLElementEventMap {
  'latency-start':      CustomEvent<null>
  'latency-recording':  CustomEvent<null>
  'latency-processing': CustomEvent<null>
  'latency-result':     CustomEvent<LatencyResultDetail>
  'latency-complete':   CustomEvent<LatencyCompleteDetail>
  'latency-error':      CustomEvent<LatencyErrorDetail>
}

export interface LatencyTestElement extends HTMLElement {
  start(): Promise<void>
  stop(): void
  audioContext: AudioContext | null
  inputStream: MediaStream | null
  inputGain: number
  numberOfTests: number
  mlsBits: number
  maxLagMs: number
  recordingMode: 'mediarecorder' | 'mediarecorder-2ch' | 'audioworklet'
  signalType: 'mls' | 'chirp' | 'golay'
  debug: boolean
  addEventListener<K extends keyof LatencyTestEventMap>(
    type: K,
    listener: (this: LatencyTestElement, ev: LatencyTestEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ): void
  removeEventListener<K extends keyof LatencyTestEventMap>(
    type: K,
    listener: (this: LatencyTestElement, ev: LatencyTestEventMap[K]) => any,
    options?: boolean | EventListenerOptions
  ): void
}

declare global {
  interface HTMLElementTagNameMap {
    'latency-test': LatencyTestElement
  }
}
```

Key points on this declaration:
- `HTMLElementTagNameMap` augmentation makes `document.querySelector('latency-test')` return `LatencyTestElement` automatically. React 19+ also picks this up for JSX.
- `LatencyTestEventMap` + overloaded `addEventListener`/`removeEventListener` make event callback parameters fully typed — `e.detail.latency` is a `number`, not `any`.
- React < 19 still needs the manual JSX namespace declaration (documented in the React and Next.js example pages).
- **Build step:** `src/index.d.ts` is the hand-written source file (committed to version control). The `build:component` script must copy it to `dist/index.d.ts` so the `package.json` `types` field resolves correctly in the published package. A simple `cp src/index.d.ts dist/` at the end of the build script is sufficient.

**3. Add an `.npmignore`** (alternative to `files`)

If `files` is not used, add `.npmignore` to explicitly exclude development files:

```
src/
docs/
assets/
.github/
*.config.*
CLAUDE*.md
CODEX_REVIEW.md
```

#### Manual publishing (per release)

```bash
# Log in to npm (only needed once per machine)
npm login

# Build the component bundle
npm run build:component

# Dry run — inspect what will be published without actually publishing
npm publish --dry-run

# Publish (scoped packages require --access public on first publish)
npm publish --access public
```

For subsequent releases, bump the version in `package.json` first:

```bash
npm version patch   # 1.0.0 → 1.0.1 (bug fix)
npm version minor   # 1.0.0 → 1.1.0 (new feature, backwards compatible)
npm version major   # 1.0.0 → 2.0.0 (breaking change — e.g. AudioWorklet default)
npm publish
```

#### Versioning plan

| Version | Default `recording-mode` | Notes |
|---|---|---|
| `1.x.x` | `"mediarecorder"` | Current implementation, stable |
| `2.0.0` | `"audioworklet"` | Breaking default change — bump major version |

#### Automated publishing via GitHub Actions (recommended)

Add a publish workflow that triggers on a GitHub release or version tag:

```yaml
# .github/workflows/publish.yml
name: Publish to npm

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build:component
      - run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Then add `NPM_TOKEN` as a GitHub Actions secret:
- Go to npmjs.com → Account → Access Tokens → Generate New Token (choose **Automation** type).
- Go to your GitHub repo → Settings → Secrets and variables → Actions → New repository secret → name it `NPM_TOKEN`.

Releases then follow this flow:
```bash
npm version minor          # bumps version, creates git tag
git push --follow-tags     # pushes tag → triggers the publish workflow
```

---

### Phase 8 — Experimentation toolkit (optional visualization layer)

> **Non-blocking:** This phase is a separate project that consumes the published component.
> It does not modify the core element and is not a prerequisite for any other phase.

- [ ] Create a standalone HTML page (or mini-app) that imports `@adasp/latency-test` and adds rich visualizations:
  - Autocorrelation graph: render the correlation array as a chart (canvas or SVG)
  - Audio waveform: display captured mic + reference signals as waveform graphs
  - Latency histogram: aggregate results across multiple runs and render a distribution chart
  - Side-by-side comparison panel: run tests with different params and compare results visually
- [ ] Config export: snapshot of all test parameters + results as downloadable JSON
- [ ] Platform comparison: save/load result sets to compare across browsers, OS versions, or hardware
- [ ] The toolkit consumes the component's event API only — no internal access to the element

## Notes for LLMs

- Read `CLAUDE.md` first for full architectural context before touching any file.
- The cross-correlation algorithm in `worker.js` is correct and validated against published paper results — do not modify it without explicit instruction.
- The 18 dB reliability threshold and 600 ms maxLag are research-derived constants — do not change them without asking.
- The Safari-specific `getCorrectStreamForSafari()` method is **removed in Phase 1**. Gain compensation is now a general `input-gain` property set by the host — the component applies whatever value it receives and does no browser detection internally.
- `helper.js` no longer exists — do not reference it or attempt to import from it.
- **Docs homepage expectation management:** `docs/index.md` must always carry a visible draft/work-in-progress signal near the top (currently at line 30). The homepage shows install and usage code snippets that read like a published package — without an explicit notice, readers will assume the package already exists. Do not remove or soften this notice until the package is actually published on npm.
- **Phase 3 dual-channel capture is not optional:** A WAC 2025 peer reviewer identified that the current single-channel MediaRecorder approach has an uncontrolled timing offset between `mediaRecorder.start()` and `noiseSource.start()`. The AudioWorklet processor must use `numberOfInputs: 2` — mic on input 0, reference signal loopback on input 1 — and cross-correlate the two captures. The `naomiaro/recording-calibration` reference implements this correctly. Do not implement Phase 3 as a direct MediaRecorder-to-AudioWorklet port without adopting this two-channel architecture.
- **Three `recording-mode` values — each measures a different pipeline:** `"mediarecorder"` (single-channel, direct mic stream, has unknown start-timing *bias* — not just jitter — but is the closest to the production DAW recording path); `"mediarecorder-2ch"` (dual-channel via `ChannelMergerNode` + `MediaStreamDestinationNode`, removes the start-timing bias, channel-relative stable but not sample-accurate, measures a **different pipeline** due to extra Web Audio nodes — `createMediaStreamSource` is unavoidable; overhead direction is browser-dependent); `"audioworklet"` (raw PCM, shared AudioContext clock, accuracy reference). Do not flatten these into a single implementation — the mode differences are research data.
- **Timing bias vs. jitter distinction:** the single-channel `"mediarecorder"` path has a *systematic timing bias* (the unknown JS start offset between `noiseSource.start()` and `mediaRecorder.start()` shifts the measured lag on every run). `maxLag` makes the correlation peak searchable but does not cancel this offset. Always use the word "bias" not "jitter" when describing this effect in docs or code comments.
- **Debug logging mode** is implemented. `debug` boolean attribute gates `console.debug('[latency-test]', ...)` at key internal checkpoints. Full spec and task status in `agents/DEBUG_MODE_PLAN.md`. `latency-debug` custom event is explicitly NOT a target — do not add it.
- **Firefox cold-start instability** — the stream-lifetime problem (self-created stream killed after each cycle) was resolved by moving audio session ownership to the host demo (`index.js`). The pre-roll (`preRollMs`) was removed. The cwilso silence-keepalive buffer inside `prepareAudioToPlayAndRecord()` remains as a scheduling guard. See `agents/INSTABILITY_FIX_PLAN.md` for full history.
- Always ask the user before editing or modifying any existing file.
