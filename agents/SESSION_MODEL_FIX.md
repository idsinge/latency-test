# SESSION_MODEL_FIX.md — Demo Session Model + preRollMs Removal

LLMs reading this file: read `CLAUDE.md` and `agents/CLAUDE_REVIEW.md` first.  
**Do not modify any file without explicit user approval.**

---

## Problem

Measurement instability on repeated single-run clicks in the demo. Root cause: the Web Component stops self-created streams after each `latency-complete`, cold-starting the MediaRecorder capture path on every new `start()` call. The `preRollMs` pre-roll was added as a workaround but only warms the AudioContext output side — it does not help the MediaRecorder capture path and adds 300 ms of UX delay with no reliable gain.

Original `main` branch created `getUserMedia` stream and `AudioContext` once on page load and reused them for all measurements. The component demo must match this session model.

---

## Fix

Move all audio session setup (getUserMedia + AudioContext) to `index.js`. The component requires host-provided `inputStream` and `audioContext` — it never creates audio resources itself and emits `latency-error` if either is missing. No component code changes needed.

> **Historical note:** An earlier design used a private `#hostProvidedStream` flag to distinguish host vs. self-created streams. That flag and the self-created stream path were removed. The current component is host-only.

---

## Files Changed

### `src/scripts/test.js`

Remove `preRollMs = 300` class property and the entire pre-roll wait block from `prepareAudioToPlayAndRecord()`.

**Remove — class property:**
```
preRollMs = 300
```

**Remove — from opening log line in `prepareAudioToPlayAndRecord`:**
```
preRollMs: this.preRollMs,
```

**Remove — pre-roll block (everything from `const preRollT0` through `pre-roll complete` log):**
```js
const preRollT0 = performance.now()
this.#log('pre-roll start', { ... })
await new Promise(resolve => {
    ...polling wait...
})
this.#log('pre-roll complete', { ... })
```

**Keep:**
- `if (this.stopped) return` — valid guard, move to immediately before the recording mode branch
- The cwilso silence buffer block — separate concern, still needed for Firefox scheduler

### `src/index.html`

Add `#connect-section` (visible on load). Wrap all existing test controls in `#test-section` (hidden on load). Remove `debug` attribute from the `<latency-test>` element — console logging perturbs scheduler timing during stability measurements.

Structure:
```html
<div id="connect-section">
    <button id="connect-btn">Connect Audio</button>
    <p id="connect-status"></p>
</div>
<div id="test-section" style="display:none">
    <!-- mode-select, run-count, latency-test (no debug attr), start-btn, results, aggregate -->
</div>
```

### `src/scripts/index.js`

Full replacement with two phases:

**Phase 1 — audio session setup:**
- `MIC_CONSTRAINTS` defined locally (same values as in `latency-test-element.js`)
- Connect Audio button click handler:
  - `getUserMedia(MIC_CONSTRAINTS)` → get stream
  - `new AudioContext({ latencyHint: 0 })` → both inside user gesture handler
  - `tester.inputStream = stream`
  - `tester.audioContext = ac`
  - Hide `#connect-section`, show `#test-section`
  - On error: show message, re-enable button

**Phase 2 — measurement (same as current, with one fix):**
- `latency-start` handler: update button text only — do NOT re-enable button (`btn.disabled = false` removed). With a pre-provided stream, `latency-start` fires immediately after `start()` and re-enabling the button would allow double-clicks mid-measurement.
- All other handlers unchanged in logic.

---

## What Does NOT Change

- `latency-test-element.js` — no changes
- `mls.js`, `worker.js`, `recorder-processor.js` — no changes
- `tests/` — no changes
- No `audioContext.resume()` calls added
- No `keep-input-stream` attribute added
- No warmup-discard logic added
- No new component API

---

## Verification Matrix

After implementation:
1. `npm test` — all pass
2. `git diff --check` — clean
3. Browser demo, MediaRecorder mode, repeated `number-of-tests=1` clicks (5–10 times) → expect stable
4. Browser demo, MediaRecorder mode, `number-of-tests=3` → expect all 3 runs stable
5. Browser demo, AudioWorklet mode, repeated `number-of-tests=1` clicks → expect stable
6. Browser demo, AudioWorklet mode, `number-of-tests=3` → expect all 3 runs stable

**If first result after Connect Audio is unstable but subsequent results are stable:**  
This indicates first-run cold-start on the newly created AudioContext — a separate issue from stream lifecycle. Do not address in this patch. Next step: discuss internal warmup-discard as a separate patch.

---

## Firefox macOS — AudioContext Initialization Order

> **Historical — superseded 2026-06-10.** Current guidance: create `new AudioContext()` before `getUserMedia()`. See the superseded note at the end of this section.

**Confirmed on Firefox macOS (historical):** creating `AudioContext` *before* `getUserMedia` produced a different sample rate than creating it *after*. The old component demo called `#setupAudioContext()` first, then `#acquireMic()`, which caused the AudioContext to initialise at a different rate (likely 48000 Hz) than CoreAudio's mic path (typically 44100 Hz). The MLS buffer was then created at the wrong rate, giving audibly different spectral content.

The fix at the time in `index.js` followed the same order as the original `main` branch: `getUserMedia` first, `new AudioContext()` second. This incidentally resolved the sound difference on Firefox macOS as well as the stream lifetime instability.

**Superseded (2026-06-10):** The demos and experiments now create `new AudioContext()` before `getUserMedia()`. This ensures the AudioContext starts in running state in Firefox, making `outputLatency` available — which outweighs the sample rate concern that motivated the original order. The sample rate mismatch described above is no longer treated as a blocking issue.

---

## Notes for LLMs

- The component requires host-provided `inputStream` and `audioContext` — it never acquires or releases them. Stream lifetime is fully host-controlled. (`#hostProvidedStream` was an earlier intermediate field that no longer exists.)
- `debug` removed from the HTML element means `console.debug` is inactive during measurements. It can still be toggled at runtime via `tester.debug = true` in DevTools for debugging specific sessions.
- The silence buffer (cwilso keepalive) is not related to preRollMs. It prevents Firefox's audio scheduler from relaxing between runs and must be kept.
