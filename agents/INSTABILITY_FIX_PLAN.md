# INSTABILITY_FIX_PLAN.md — Firefox Cold-Start Latency Instability

LLMs reading this file: read `CLAUDE.md` and `agents/CLAUDE_REVIEW.md` first for full project context.  
**Do not modify any file without explicit user approval.**

---

## Symptoms (original)

- **Single manual run (repeated clicks, `number-of-tests=1`):** most or all results are unstable — values vary when they should be constant.
- **Multi-run (`number-of-tests=5`):** only the **first** result is unstable; runs 2–5 are consistent.
- Primarily observed on Firefox. Chrome is less affected.

---

## Problem 1 — Stream killed between manual clicks

**Status: RESOLVED by architecture change (2026-06-03)**

The original component stopped and nulled `#inputStream` in `#emitComplete()` after every completed test cycle, cold-starting the MediaRecorder capture path on every repeated click.

**Resolution:** The component was redesigned as a pure measurement tool. It no longer creates or manages audio resources. `inputStream` and `audioContext` are always host-provided — the host owns both lifetimes. The component never stops tracks or closes the context. Problem 1 cannot occur in the current design.

Fix A, Fix B, and the `keep-input-stream` attribute discussion are all obsolete — the host-provided pattern makes them unnecessary.

---

## Problem 2 — True cold-start on first test

**Status: OPEN — pending browser verification**

Even with a warm, host-provided stream, the very first measurement after connecting may be unstable. The cwilso keepalive silence in `prepareAudioToPlayAndRecord()` warms the **AudioContext output side only**. For the `"mediarecorder"` path, the mic goes directly from the OS → `MediaRecorder(this.inputStream)`, bypassing the Web Audio graph entirely. The useful warmup for the MediaRecorder capture path is elapsed time with the stream open and recording-ready, not AudioContext silence.

For the `"audioworklet"` path, warmup happens more naturally because the mic is routed through the Web Audio graph (`createMediaStreamSource` → worklet), which starts processing as soon as the graph is connected.

### Fix C — Warmup run discard (recommended if Problem 2 is confirmed)

Run one internal warmup test before emitting any results on the first `start()` call after resources are assigned. Always discard the first run **unconditionally** — do not gate discard on `ratio <= 18` alone: a bad cold-start result can pass the threshold by chance.

- **Pros:** robust, state-driven, not based on arbitrary timing. Works regardless of browser or pipeline.
- **Cons:** adds one extra ~1s test cycle before the first visible result. Host must be aware that `number-of-tests=N` will internally run N+1 tests on the first call.
- When `debug` is active, log the discarded warmup run result via `console.debug()` — no `latency-result` event emitted for it.

### Fix D — Time-based warmup (not recommended as standalone)

A fixed `await sleep(Xms)` after resources are assigned before `#runNextTest()`. Unreliable — a fixed time does not guarantee the mic pipeline has settled across browsers and OS audio stacks. Only acceptable as a temporary stopgap.

---

## Verification matrix (browser testing — still pending)

Run on Chrome, Firefox, Safari:

- [ ] MediaRecorder mode, repeated `number-of-tests=1` clicks (5–10 times) → expect stable from click 1
- [ ] MediaRecorder mode, `number-of-tests=3` → expect all 3 runs stable
- [ ] AudioWorklet mode, repeated `number-of-tests=1` clicks → expect stable from click 1
- [ ] AudioWorklet mode, `number-of-tests=3` → expect all 3 runs stable

**Key signal:** if click 1 (first test after Connect Audio) is consistently unstable across browsers, Fix C is needed. If click 1 is stable, Problem 2 is not reproducible in practice with the host-provided stream pattern and no further action is needed before Phase 3b.

---

## Notes for LLMs

- Problem 1 is fully resolved by the architecture change. Do not re-introduce stream lifecycle management into the component.
- Fix D (time-based warmup) is not recommended as a standalone fix.
- Fix C (warmup run discard) should only be implemented if browser verification confirms Problem 2 is reproducible.
- The pre-roll silence node in `prepareAudioToPlayAndRecord()` warms the **AudioContext output side only**. For `"mediarecorder"` mode it does not warm the mic capture path.
- For the `"audioworklet"` path, warmup happens naturally via the mic source graph connection.
