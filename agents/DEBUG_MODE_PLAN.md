# DEBUG_MODE_PLAN.md — Debug Logging Mode

LLMs reading this file: read `CLAUDE.md` and `agents/CLAUDE_REVIEW.md` first for full project context.  
**Do not modify any file without explicit user approval.**

---

## Goal

Add a `debug` boolean attribute/property to the `<latency-test>` element. When enabled, key internal methods and state transitions emit timestamped `console.debug()` messages prefixed with `[latency-test]`. Off by default. No new events — console only.

**`latency-debug` custom event is explicitly NOT a target.** The public event API (`latency-result`, `latency-complete`, etc.) is sufficient for host-app integration. Debug output goes to the console only.

---

## Settled Decisions

| Question | Decision |
|---|---|
| Flag surface | Boolean HTML attribute `debug`, reflected as JS property — `<latency-test debug>` or `element.debug = true` |
| Output method | `console.debug()` with `[latency-test]` prefix — not `console.log`. Filterable in devtools by enabling "Verbose" level. |
| Boolean attribute detection | `hasAttribute('debug')` — NOT checking `newValue === 'true'`. In HTML, `<latency-test debug>` sets `newValue === ""`. |
| Logging architecture | Private `#log(label, data)` method on each class — prepends timestamp automatically. `LatencyTestController` receives `debug` flag via `initialize()` options. No shared static utility. |
| New events | None. `latency-debug` event dropped — not a target. |
| Hot-path guard | Worker correlation loop and `workerMessageHandler` intermediate messages are NOT instrumented. Only final worker results are logged. |
| Audio sample data | Never logged — too verbose and privacy-sensitive. Log metadata only (lengths, durations, sample rates). |

---

## Log Format

Every log line: `[latency-test] <performance.now()> <label>: <data>`

- **Primary timestamp:** `performance.now().toFixed(2)` for local elapsed timings within each context (main thread or worker). Note: `performance.now()` is relative to `performance.timeOrigin`, which can differ between the main thread and worker contexts — values are **not directly comparable across contexts**. For cross-context comparison, log `(performance.timeOrigin + performance.now()).toFixed(2)` as an absolute wall-clock timestamp.
- **Audio time as additional field:** include `audioTime=<currentTime.toFixed(4)>` where relevant (scheduling, pre-roll) — not as the primary timestamp.
- Label: method or checkpoint name
- Data: key-value pairs inline

Example:
```
[latency-test] 1234.56 prepareAudioToPlayAndRecord: mode=mediarecorder preRollMs=300 audioTime=1.2340
[latency-test] 1534.12 pre-roll complete: audioTime=1.5341 elapsed=299.56ms
[latency-test] 1534.20 mediaRecorder.start: mimeType=audio/webm;codecs=opus
[latency-test] 1534.31 noiseSource.start: audioTime=1.5343 gapFromMRStart=0.11ms
[latency-test] 2291.04 mediaRecorder.stop: chunks=3
[latency-test] 2310.02 decodeAudioData: channels=1 duration=0.742s sampleRate=48000
[latency-test] 2310.10 worker postMessage: command=correlation maxLag=26460 data1Len=35616 debug=true
[latency-test] 2420.05 worker result: peakIndex=1680 ratio=24.3dB latency=35.0ms reliable=true
[latency-test] 2420.10 #emitEvent: latency-result latency=35.0ms ratio=24.3dB reliable=true mode=mediarecorder
```

---

## Checkpoints to Instrument

### `latency-test-element.js` — `LatencyTest`

| Checkpoint | What to log |
|---|---|
| `start()` entry | recording mode, `numberOfTests`, stream state (host-provided / self-created / null) |
| `#setupAudioContext()` | whether context was created or reused, `sampleRate`, `state` |
| `#acquireMic()` — before `getUserMedia` | — |
| `#acquireMic()` — after `getUserMedia` | elapsed ms since call started, track `readyState`/`enabled`/`muted`, `getSettings()` fields (`sampleRate`, `channelCount`, `echoCancellation`), `#streamIsWarm` state. **Do not log track label** — it exposes mic/device names (privacy-sensitive in a public package). |
| `#startSilence()` entry *(if/when implemented)* | `audioContext.currentTime`, silence buffer duration |
| `#startSilence()` complete *(if/when implemented)* | `currentTime` after warmup, elapsed ms |
| `#runNextTest()` entry | run number (internal), visible run number, `#pendingRuns` remaining, `#streamIsWarm` state |
| `#emitEvent()` | event name, shallow detail (no buffers) — single instrumentation point covering `latency-start`, `latency-recording`, `latency-processing`, `latency-result`, `latency-complete`, `latency-error` |
| `#emitComplete()` | results count, whether stream was stopped or kept, `keepInputStream` state |
| `#handleError()` | error message, source |
| `stop()` called | `#stopped` state, whether test was in progress |
| `disconnectedCallback()` | — |
| `attributeChangedCallback()` | attribute name, old value, new value |
| `getUserMedia` failure | error name and message |

### `test.js` — `LatencyTestController`

| Checkpoint | What to log |
|---|---|
| `initialize()` | `recordingMode`, `mlsBits`, `maxLagMs`, `sampleRate`, `debug` |
| `prepareAudioToPlayAndRecord()` entry | `recordingMode`, `preRollMs`, `audioContext.currentTime`, stream warm state |
| Silence node started | `audioTime`, silence buffer duration |
| Pre-roll start | `targetAudioTime`, `wallDeadline` |
| Pre-roll complete | actual `audioTime`, wall-clock elapsed ms |
| `startMediaRecorderCapture()` — `mediaRecorder.start()` | `mimeType`, `performance.now()` |
| `startMediaRecorderCapture()` — `noiseSource.start()` | `audioTime`, gap from `mediaRecorder.start()` in ms — **key timing bias data point** |
| `mediaRecorder.onstop` | chunk count, total blob size if available |
| `decodeAudioData` result | `numberOfChannels`, `duration`, `sampleRate`, `length` |
| `MediaRecorder` constructor/start failure | error message |
| `decodeAudioData` failure | error message |
| `loadRecorderProcessor()` — start | `audioContext.audioWorklet` state |
| `loadRecorderProcessor()` — complete or cache-hit | elapsed ms, whether module was already loaded |
| `loadRecorderProcessor()` — failure (`AudioWorklet.addModule` throws) | error message |
| `startWorkletCapture()` — mic source connected | `audioTime` |
| `startWorkletCapture()` — reference source connected | `audioTime` |
| `startWorkletCapture()` — `workletNode.port.postMessage({ command: 'start' })` | `audioTime` |
| `startWorkletCapture()` — `noiseSource.start()` | `audioTime` |
| `startWorkletCapture()` — `workletNode.port.postMessage({ command: 'stop' })` | `audioTime` |
| Worklet message received (final) | `mic` length, `ref` length |
| Worker `postMessage` sent — `correlation` | `maxLag`, `data1` length, `data2` length, `channel`, `debug` |
| Worker `postMessage` sent — `findpeak` (if separate) | `debug` — must also carry the flag |
| `workerMessageHandler` — final result only | `peakIndex`, `peakValuePow`, `mean`, computed `ratio` dB, computed `latency` ms, `reliable` |
| Warmup run discarded (Fix C) | internal run number, visible run number, `peakIndex`, `ratio`, `#streamIsWarm` was false |
| Worker `error` / `messageerror` | error message |
| `stop()` called | whether recording was in progress |

### `worker.js`

| Checkpoint | What to log |
|---|---|
| `calculateCrossCorrelation` entry | `data1` length, `data2` length, `maxLag` |
| `calculateCrossCorrelation` complete | elapsed ms (`performance.now()`) |
| `findPeakAndMean` result | `peakIndex`, `peakValuePow`, `mean` |

Worker logs are gated by the `debug` flag passed in **each relevant `postMessage` payload** (both `correlation` and `findpeak` commands). The worker reads `data.debug` and guards all `console.debug()` calls behind it. Workers have their own console — no other mechanism is needed.

### `recorder-processor.js`

**Do not instrument.** `process()` is real-time audio-thread code — calling `console.debug()` there causes glitches and distorts the very timing being measured. If processor diagnostics are ever needed, post metadata in the `stop` message, not per-block.

---

## Implementation Tasks

### Element changes (`latency-test-element.js`)
- [x] `debug` is intentionally **not** added to `observedAttributes` — `get debug()` uses `hasAttribute('debug')` which is a live DOM check, so changes are always reflected without needing `attributeChangedCallback`
- [x] Add `get debug()` property: `return this.hasAttribute('debug')`
- [x] Add `set debug(v)` property: `v ? this.setAttribute('debug', '') : this.removeAttribute('debug')`
- [x] Add private `#log(label, data)` method that prepends the timestamp automatically: `if (this.debug) console.debug('[latency-test]', performance.now().toFixed(2), label, data ?? '')` — callers pass only label and data, never the timestamp, ensuring consistent formatting everywhere
- [x] Pass `debug: this.debug` into `controller.initialize()` options
- [x] Instrument all currently-implementable checkpoints. Note: `#streamIsWarm`, internal/visible run numbers, `keepInputStream`, and warmup-discard checkpoints are pending Fix B/Fix C from `agents/INSTABILITY_FIX_PLAN.md` — add them when those features land.

### Controller changes (`test.js`)
- [x] Add `debug = false` field to `LatencyTestController`
- [x] Read `debug` from `initialize()` options
- [x] Add `#log(label, data)` method that prepends the timestamp automatically: `if (this.debug) console.debug('[latency-test]', performance.now().toFixed(2), label, data ?? '')` — same signature as the element's helper for consistency
- [x] Instrument all currently-implementable checkpoints. Same pending items as element (Fix B/Fix C dependent).
- [x] Pass `debug` flag in **both** worker `postMessage` calls: `{ command: 'correlation', ..., debug: this.debug }` and the `findpeak` command payload

### Worker changes (`worker.js`)
- [x] Read `debug` from the incoming message payload for each command
- [x] Guard all worker `console.debug()` calls behind `data.debug`
- [x] Do **not** add any logging to `recorder-processor.js` — real-time audio thread

### Docs (`docs/api.md`)
- [x] Add `debug` to the attributes table in `docs/api.md` — includes observer-effect caveat
- [x] Add `debug: boolean` to the TypeScript `LatencyTestElement` interface in `agents/CLAUDE_REVIEW.md` Phase 7

### Demo page
- [ ] Add `debug` toggle to `demo/index.html` — a simple checkbox that sets/removes the attribute on the element at runtime, so it can be toggled without a page reload

### Validation
- [ ] Verify `debug` can be toggled at runtime (add/remove attribute on a live element) and affects subsequent runs without page reload
- [ ] Verify worker logs appear when `debug` is set and are absent when not set
- [ ] Verify no `console.debug()` output when `debug` attribute is absent

---

## Notes for LLMs

- `latency-debug` custom event is explicitly not a target. Do not add it.
- `console.debug()` is the correct method — not `console.log`. It is hidden by default in browser devtools until "Verbose" level is enabled, keeping the console clean for normal use.
- Boolean attribute detection must use `hasAttribute('debug')`, not `newValue === 'true'` or `newValue === true`.
- Do not log Float32Array contents — metadata only (length, duration, sampleRate).
- **Debug mode is for diagnostic passes only — do not use it for measurements you intend to record.** The `startPairSpanMs` log field is an upper-bound span that includes `mediaRecorder.start()` execution, the call transition, and `noiseSource.start()` execution — it is not a pure inter-call gap. Additionally, debug logging throughout the pipeline (and DevTools being open) can perturb console and scheduling performance. Turn debug off for clean measurements.
- **`decodeAudioData` failure is logged and rethrown, but the thrown error may not reach `start()`'s try/catch.** `displayAudioTagElem()` runs inside `mediaRecorder.onstop`, which is an async callback. Errors thrown there are not caught by the outer `start()` try/catch. This is a pre-existing error-routing gap made visible by debug mode, not a regression introduced by the debug feature. Fix is out of scope here.
- **Mixed timestamp scales in console output are expected and intentional.** Main-thread logs show small local `performance.now()` values (e.g. `1234.56`); worker logs show epoch-like absolute values from `performance.timeOrigin + performance.now()` (e.g. `1748523456789.12`). Both carry the `[latency-test]` prefix. The scales differ but are not directly comparable by design — use main-thread logs for relative elapsed times and worker logs for absolute cross-context anchoring.
- **`startPairSpanMs`** is the primary timing bias diagnostic for the instability investigation — it is the upper-bound span covering both `mediaRecorder.start()` and `noiseSource.start()` execution. Log with `performance.now()`; include `audioTime=` as metadata. Do not use `audioContext.currentTime` as the primary timestamp here.
- Worker `debug` flag must be passed in **every relevant `postMessage` payload** (both `correlation` and `findpeak` commands) — the worker cannot access the element's properties directly.
- **Never instrument `recorder-processor.js`**. `process()` is real-time audio-thread code — `console.debug()` there causes glitches and distorts timing measurements. Post metadata on stop if processor diagnostics are needed.
- **Do not log track label** — it exposes microphone/device names. Log `readyState`, `enabled`, `muted`, and `getSettings()` fields (`sampleRate`, `channelCount`, `echoCancellation`) instead.
