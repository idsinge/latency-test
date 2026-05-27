# Review Prompt — latency-test Web Component

## Task

Write a report covering the following 4 areas. **Do NOT modify any files.** Return findings as a prioritised list (P0 = critical, P1 = important, P2 = nice-to-have).

**Current HEAD:** `f1ca6a6` — "chore: merge main — update repo references to latency-test, sync README and MLS diagram" (webcomponent branch)

---

## 1. Changes Since Last Review

### P1 fixes
- **premature error resolve** (`demo/common.js`): `startTest()` Promise resolves immediately if `latency-error` fires before `latency-start` (mic denied). Stale `prematureErrorHandler` listeners are cleaned up on retry to prevent leaks.
- **Mode Toggle compare button** (`demo/mode-toggle.js`): `compareBtn` stays disabled until both MR + AW tests complete (`checkBothDone()`) or an error occurs.
- **Config snippet fixes**: `latency-complete` → `latency-result` in Minimal and Mode Toggle snippets. Top-level `await` wrapped in async IIFE for Context Share and Mode Toggle snippets.
- **Docs update** (`docs/api.md`): `latency-start` description corrected — fires on EVERY `start()` call (not just first).

### P2 fixes
- **Activity counter clamped** (`demo/common.js`): `Math.max(0, ...)` on decrement to prevent negative values.
- **Start buttons disabled on click** (Minimal, Multi-Run, Lifecycle JS files) — prevents double-submit.
- **Trailing whitespace removed**: `src/scripts/test.js` (15 lines), `docs/examples/vanilla-js.md`.

### Housekeeping
- `skills-lock.json` removed from `.gitignore` and committed for pinned modern-web-guidance skill version.
- Attempted codec warmup patch was reverted — user disagreed since the original `main` branch worked without it.

### Build tooling & housekeeping
- **`--dev` flag for build script** (`scripts/build-component.mjs`): `node scripts/build-component.mjs` builds minified (production); `node scripts/build-component.mjs --dev` builds unminified (debugging). Both ESM and IIFE are now minified in production mode (previously only IIFE was). Stale Parcel leftovers auto-cleaned from `dist/` before each build.
- **Two npm scripts**: `build:component` (production) and `build:component:dev` (development).
- **`docs/build-output.md`**: new documentation page explaining all 4 dist/ files (ESM, IIFE, source maps) and when to use each.
- **Demo JS files moved**: `demo/common.js`, `demo/minimal.js`, `demo/multi-run.js`, `demo/context-share.js`, `demo/mode-toggle.js`, `demo/lifecycle.js` → `demo/js/`. Script paths in `demo/index.html` updated accordingly.
- `.nvmrc` unchanged (still `18.12.1`, matching current runtime).

### No changes to
- `src/scripts/latency-test-element.js` — unchanged.
- `src/scripts/test.js` — unchanged.
- `src/scripts/worker.js`, `src/scripts/mls.js` — untouched.

---

## 2. Open Concern: Single-Run Regression

**Observation:** The very first test after warmup produces inflated latency (~141ms vs ~37ms expected) in both Firefox and Chrome. Multi-run sequence works correctly — only the first of N results is bad; subsequent results cluster around ~37ms. The original `main` branch (pre-refactor) did not exhibit this, suggesting it's a regression in our code.

**What's been tried unsuccessfully:**
- Cwilso silence keepalive in `prepareAudioToPlayAndRecord()` (`test.js`): 2s silence buffer started simultaneously with every test run to keep the audio thread active.
- Element-level `#startSilence()` (`latency-test-element.js`): 2s warmup silence on first user gesture (Chrome cold-start fix). Currently starts in response to the first `start()` call, before the test begins.
- `startTest()` warmup detection (`demo/common.js`): Detects warmup (listens for `latency-start`, checks if `latency-recording` follows within 300ms), retries immediately if no recording seen, so the test starts while warmup silence is still playing.

**Current theory:** There's a timing gap between warmup silence commencement and actual test initiation. The original `main` branch started silence + test simultaneously (cwilso pattern) with a single user click. Our code splits this: first `start()` call starts warmup silence and returns early; second `start()` call (~300ms later) starts the test. If getUserMedia takes > ~1.7s (2s buffer minus 300ms detection window), the warmup silence may have finished before the test starts, potentially allowing the audio pipeline to relax.

**What hasn't been tried:**
- Direct timing comparison against `main` branch (not yet tested in current session).
- Removing the warmup gap entirely — i.e., having the first click start both silence AND test simultaneously (matching original cwilso pattern).
- Instrumenting with console timestamps to measure the exact gap between `noiseSource.start()` and `mediaRecorder.start()` on first vs subsequent runs.

---

## 3. Proposed New Feature: Debug Logging Mode

### Requirement
Add a `debug` boolean attribute/property to the `<latency-test>` element. When enabled, key methods and functions log timestamped messages to `console.log`/`console.warn` for tracing execution flow. This helps users (and us) diagnose timing issues like the single-run regression above without modifying source code.

### Questions for reviewers

1. **Attribute vs property design:**
   - **Option A:** `<latency-test debug>` — boolean HTML attribute, reflected to `tester.debug` JS property. `debug` is `observedAttributes`, so element can react to attribute changes at any time.
   - **Option B:** `tester.debug = true` — JS-only property, no reflected attribute. Simpler, but not configurable from HTML alone.
   - Which is more correct for Web Components conventions?

2. **Logging approach:**
   - **Option A:** Internal `#log(...)` method on the element class that conditionally calls `console.log` with a `[latency-test]` prefix. Pass `debug` flag to the controller (`LatencyTestController`) for its own `#log(...)`.
   - **Option B:** Single static `log()` utility function imported by both files, controlled by a shared flag.
   - **Option C:** Use DOM custom events (`latency-debug`) instead of `console.log` — emits a `CustomEvent` with `bubbles: true` `composed: true` containing the message and data. Users subscribe via `addEventListener('latency-debug', ...)`.
   - Which approach is most appropriate for a headless Web Component? What are the tradeoffs for end users vs developers?

3. **What to instrument:**
   - Element: `start()`, `stop()`, `#acquireMic()`, `#runNextTest()`, `#createController()`, `#startSilence()`, `disconnectedCallback()`, `attributeChangedCallback()`.
   - Controller: `constructor`, `initialize()`, `prepareAudioToPlayAndRecord()`, `startMediaRecorderCapture()`, `startWorkletCapture()`, `finishTest()`, `workerMessageHandler()`, `stop()`.
   - Is this too much? Should certain internal methods (e.g. `workerMessageHandler`) be omitted? Should there be log levels (debug / info / warn)?

4. **Performance concerns:**
   - String concatenation + `console.log` on the hot path of audio processing callbacks (e.g., `workerMessageHandler` is called ~15 times per correlation). Are there any performance pitfalls?
   - Should hot-path logs be guarded by a separate flag (e.g., `debugWorker`) vs general `debug`?

5. **Security/privacy:**
   - Debug logs may contain audio buffer metadata (sample rates, durations, array sizes). Could also include timestamps from `AudioContext.currentTime`, `performance.now()`, or `Date.now()`. Any concerns about exposing this in console output?

6. **Framework alternatives:**
   - Are there established debugging patterns for Web Components we should follow instead of rolling our own? (e.g., `loglevel` library, built-in browser devtools for Custom Elements, `performance.mark()`/`performance.measure()` for profiling.)

---

## 4. Review Focus Areas

Please evaluate:

1. **Demo page completeness** — any tab broken, missing UX, or confusing element?
2. **Debug mode proposal** — which logging approach is correct for this headless Web Component? Any missing considerations?
3. **Single-run regression** — what could cause the inflated first result? What debugging approach would you recommend (instrumentation strategy, targeted experiment)?
4. **Architecture / packaging / API** — anything blocking Phase 7 (npm publish)?
5. **Code quality** — any regressions or issues in the current HEAD?
