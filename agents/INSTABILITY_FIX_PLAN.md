# INSTABILITY_FIX_PLAN.md — Firefox Cold-Start Latency Instability

LLMs reading this file: read `CLAUDE.md` and `agents/CLAUDE_REVIEW.md` first for full project context.  
**Do not modify any file without explicit user approval.**

---

## Symptoms

- **Single manual run (repeated clicks, `number-of-tests=1`):** most or all results are unstable — values vary when they should be constant.
- **Multi-run (`number-of-tests=5`):** only the **first** result is unstable; runs 2–5 are consistent.
- Primarily observed on Firefox. Chrome is less affected.

---

## Root Cause Analysis

### Problem 1 — Stream killed between manual clicks (confirmed likely)

`#emitComplete()` in `latency-test-element.js:122` stops and nulls `#inputStream` after every completed test cycle:

```js
if (!this.#hostProvidedStream && this.#inputStream) {
    this.#inputStream.getTracks().forEach(t => t.stop())
    this.#inputStream = null
}
```

Every new `start()` call therefore triggers a fresh `getUserMedia()` — the mic and capture pipeline are cold on every single manual click. This explains why single-run instability is consistently high.

Multi-run is stable from run 2 onward because the stream is **not** stopped between runs within the same cycle — `#emitComplete()` is only called after all N runs complete.

### Problem 2 — True cold-start on first test (first click or first of multi-run)

Even with a warm stream, the very first measurement on a newly acquired stream (or first of a multi-run) is unstable. The 300ms `currentTime`-based pre-roll in `prepareAudioToPlayAndRecord()` was designed to address this, but it only warms the **AudioContext output side** (playback of the MLS signal). For the `"mediarecorder"` path, the mic goes directly from the OS → `MediaRecorder(this.inputStream)`, bypassing the Web Audio graph entirely. So the pre-roll silence does **not** warm the MediaRecorder capture path.

The useful warmup for Firefox's MediaRecorder is not AudioContext silence — it is **time elapsed while the mic stream remains open and recording-ready**. The longer the stream has been alive before the first `mediaRecorder.start()` call, the more stable the first measurement.

For the `"audioworklet"` path, the better warmup point is after the worklet/mic graph is connected, not just after `getUserMedia()`.

### Design conflict

The current resolved decision (Decision #10 in `CLAUDE_REVIEW.md`, Open Question #10) explicitly states: self-created streams are stopped when the test ends, for privacy and browser mic-indicator reasons. Problem 1's most direct fix — keeping the stream alive between clicks — contradicts this decision. This must be an **explicit design/API decision**, not a silent implementation change.

---

## Diagnosis Protocol (before any code change)

**Step 1 — Confirm Problem 1 as root cause:**

Pass a host-managed persistent stream to the element before running:

```js
const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } })
const el = document.querySelector('latency-test')
el.inputStream = stream           // host-provided: component never stops it
```

Then click the test button 5–10 times manually. If results are stable from click 2 onward and only click 1 is unstable, **Problem 1 is confirmed** as the dominant cause of repeated single-run instability.

**Step 2 — Isolate true cold-start (Problem 2):**

With the same host-provided stream, note whether click 1 is consistently unstable (cold-start) or sometimes stable. If click 1 has a low `ratio` (below 18 dB), the correlation was poor and the result is unreliable — not just imprecise.

---

## Fix Options

### Fix A — Keep stream alive between cycles (addresses Problem 1)

Do not stop `#inputStream` in `#emitComplete()`. Stop it only in `stop()` or `disconnectedCallback()`.

- **Pros:** simple, directly fixes repeated single-run instability, no extra warmup logic needed.
- **Cons:** browser mic indicator stays on between tests. Changes the component's stream ownership/privacy contract (currently: stream stopped when test ends).
- **Requires an explicit design decision** — see Open Decision below.

### Fix B — `keep-input-stream` opt-in attribute (addresses Problem 1, preserves privacy default)

Add a `keep-input-stream` boolean attribute. When set, the component does not stop self-created streams on `#emitComplete()`. Default remains current behavior (stream stopped after each cycle).

- **Pros:** preserves privacy default; host opts in explicitly.
- **Cons:** adds API surface; host must know to set it for repeated manual testing scenarios.
- The demo page should set `keep-input-stream` by default.

### Fix C — Warmup run discard (addresses Problem 2 — true cold-start)

When the stream is freshly acquired (cold start), run one internal warmup test before emitting any results. Always discard the first cold-stream run **unconditionally** — `ratio` is logged/emitted for debug purposes only, not used to decide whether to discard. A bad cold-start result can pass `ratio > 18 dB` by chance, so quality-gating alone is not sufficient.

- **Pros:** robust, cold-start-state-driven, not based on arbitrary timing. Works regardless of browser or pipeline.
- **Cons:** adds latency to the first visible result (one extra ~1s test cycle). Must be transparent to the host (no spurious `latency-result` events for the discarded run; or fire with `{ reliable: false, warmup: true }` if the host wants visibility).
- This is the most reliable long-term fix for Problem 2 regardless of which Fix (A or B) is chosen for Problem 1.

### Fix D — Extended pre-roll / time-based warmup (partial mitigation for Problem 2)

Increase `preRollMs` from 300ms to 500ms or more, specifically for the first test after a fresh stream. Alternatively, add an explicit `await sleep(500)` after `getUserMedia()` before `#runNextTest()`.

- **Pros:** simple, no API change.
- **Cons:** unreliable — a fixed time does not guarantee the mic pipeline has settled, especially across browsers and OS audio stacks. Codex explicitly recommends against this as a standalone fix.

---

## Open Design Decision

**Should self-created streams be kept alive between manual clicks?**

| Option | Stream lifetime | Mic indicator behavior | Privacy |
|---|---|---|---|
| Current behavior (stop after complete) | Stopped after each complete cycle | Off between tests | Stricter |
| Fix A (stream stays alive) | Alive until `stop()` or disconnect | On continuously | Looser |
| Fix B (`keep-input-stream` attr) | Configurable per host | Host decides | Flexible |

**Recommendation (merged from dual-agent review):** Fix B is the safest default-preserving option. The demo page sets `keep-input-stream`. The API docs explain that repeated manual single runs require either a host-provided `inputStream` or `keep-input-stream` to avoid cold-start instability.

---

## Recommended Implementation Plan

### Step 1 — Confirm root cause (no code change)
- [ ] Run diagnosis protocol Step 1 using a host-provided persistent stream
- [ ] Confirm: stable from click 2+ with host stream, unstable with self-created stream

### Step 2 — Fix Problem 1 (stream lifetime)
- [ ] **Decision required:** choose Fix A (keep alive by default) or Fix B (`keep-input-stream` attribute)
- [ ] If Fix B: add `keep-input-stream` to `observedAttributes` in `latency-test-element.js`
- [ ] If Fix B: expose as a boolean JS property using `hasAttribute('keep-input-stream')` — **not** by checking `newValue` in `attributeChangedCallback`. In HTML, `<latency-test keep-input-stream>` sets `newValue === ""` (empty string, falsey); only `hasAttribute()` reliably detects presence.
- [ ] If Fix B: in `#emitComplete()`, guard stream-stop behind `!this.keepInputStream`
- [ ] Update Decision #10 in `CLAUDE_REVIEW.md` to reflect the chosen behavior
- [ ] Update `docs/api.md` and the `LatencyTestElement` TypeScript interface if Fix B adds an attribute
- [ ] Demo page: set `keep-input-stream` (or pass host stream) so repeated single-run tests are stable

### Step 3 — Fix Problem 2 (true cold-start)
- [ ] **Decision required:** choose Fix C (warmup run discard) or Fix D (extended pre-roll) or both
- [ ] If Fix C: add `#streamIsWarm = false` flag on `LatencyTestController` (or `LatencyTest` element). Set `false` whenever `getUserMedia` is called (self-created stream). Set `true` after the first completed run on that stream. Host-provided streams are treated as warm by default (`#streamIsWarm = true` when `inputStream` is set by the host).
- [ ] If Fix C: on the first run where `#streamIsWarm === false`, always discard the result unconditionally — do not emit `latency-result`. Do not gate discard on `ratio <= 18` alone: a bad cold-start result can pass the threshold by chance.
- [ ] If Fix C: after discarding the warmup run, set `#streamIsWarm = true` and run one more test automatically before emitting the first visible result.
- [ ] If Fix C: when `debug` mode is active, log the discarded warmup run result via `console.debug()` (peak index, ratio, stream warm state) — no event emitted
- [ ] If Fix D only: increase `preRollMs` to 500ms as a stopgap and note it is not robust

### Step 4 — Validate
- [ ] Single manual runs (self-created stream, no `keep-input-stream`): document expected behavior (first run may be cold)
- [ ] Single manual runs (`keep-input-stream` or host stream, **with Fix C**): stable from run 1 — warmup run discarded internally, first emitted result is on a warm stream
- [ ] Single manual runs (`keep-input-stream` only, **without Fix C**): stable from run 2 — first click after fresh stream acquisition may still be unstable
- [ ] Multi-run (`number-of-tests=5`, **with Fix C**): stable from run 1 — warmup run discarded; total visible results = N, total internal runs = N+1 on cold start
- [ ] AudioWorklet path: verify same fixes apply or if a separate warmup strategy is needed

---

## Notes for LLMs

- Do not silently change stream lifetime behavior. The current default (stop stream after each cycle) is a resolved design decision (Decision #10). Any change must go through the Open Decision above.
- A fixed `setTimeout`/`sleep` warmup is explicitly not recommended as a standalone fix — it is unreliable across OS audio stacks. Prefer unconditional discard of the first cold-stream run (Fix C). `ratio` is only logged/emitted for debug, not used to decide whether to discard.
- The pre-roll silence node in `prepareAudioToPlayAndRecord()` warms the **AudioContext output side only**. For `"mediarecorder"` mode it does not warm the mic capture path. Do not assume adding more silence time fixes MediaRecorder cold-start.
- For the `"audioworklet"` path, warmup should be applied after the worklet and mic source graph are connected, not just after `getUserMedia()`.
- This file tracks open decisions and tasks. Update `[ ]` to `[x]` when tasks are completed and record which option was chosen for each open decision.
