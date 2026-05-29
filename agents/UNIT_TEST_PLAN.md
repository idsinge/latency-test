# UNIT_TEST_PLAN.md — Unit Tests for Pure Functions

LLMs reading this file: read `CLAUDE.md` and `agents/CLAUDE_REVIEW.md` first for full project context.  
**Do not modify any file without explicit user approval.**

---

## Scope

Unit tests cover the two pure-function modules only:

| Module | What is tested |
|---|---|
| `src/scripts/mls.js` | `generateMLS(nbits)` — MLS sequence generation |
| `src/scripts/worker.js` | `calculateCrossCorrelation()` and `findPeakAndMean()` — correlation math |

**Not in scope:** `latency-test-element.js`, `test.js`, `recorder-processor.js` — all depend on browser-only APIs (`AudioContext`, `MediaRecorder`, `AudioWorklet`, `getUserMedia`, Custom Elements) that cannot be meaningfully mocked without losing test validity.

---

## Framework

**`node:test`** — Node.js 18 built-in test runner. No installation required.

- `describe`, `it`, `test`, `before`, `after`, `beforeEach`, `afterEach` — same structure as Jest/Vitest
- Manual spy arrays for stubs — `mock` is not available in Node 18.12.1
- `assert.strictEqual`, `assert.throws`, `assert.ok`, `assert.deepStrictEqual` for assertions (from `node:assert`)
- Run with `node --test` or `node --test tests/*.test.js`

**npm scripts to add to `package.json`:**
```json
"test": "node --test tests/mls.test.js tests/worker.test.js"
```

No config file needed.

---

## Required Refactor — `worker.js`

Two changes are needed to make `worker.js` importable in a test environment:

**1. Export both functions:**
```js
export function calculateCrossCorrelation(data1, data2, maxLag, channel, debug) { ... }
export function findPeakAndMean(array, channel, debug) { ... }
```

**2. Guard the `addEventListener` call so it only runs inside a real Worker:**
```js
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
    addEventListener('message', (message) => { ... })
}
```

In Node.js 18, `WorkerGlobalScope` is `undefined`, so the listener is not registered on import. In a browser Worker, `self instanceof WorkerGlobalScope` is true and the listener registers as before. No behaviour change in production.

**`postMessage` in tests:** `postMessage` is a worker global called directly inside both functions. Stub it by assigning a manual spy array to `globalThis.postMessage` in `beforeEach` and restoring in `afterEach` (see Setup section above). `performance` is available in Node.js 18+ natively — no stub needed.

---

## Test File Structure

```
tests/
  mls.test.js
  worker.test.js
```

No config file needed — `node:test` runs in Node environment by default.

---

## Test Cases — `mls.test.js`

### Sequence length
- `generateMLS(n).length === (2 ** n) - 1` for n = 2, 3, 4, 5, 8, 15
- Covers the full range of supported orders including the default (15)

### Binary values
- Every element in the sequence is exactly `0` or `1` for n = 2, 5, 15

### Balance property
MLS sequences of order n contain exactly `2^(n-1)` ones and `2^(n-1) - 1` zeros:
- n=2: 2 ones, 1 zero
- n=3: 4 ones, 3 zeros
- n=15: 16384 ones, 16383 zeros

### Determinism
Two calls to `generateMLS(n)` with the same n return identical sequences (deep equality).

### Known sequence for n=2
`generateMLS(2)` should return `[1, 1, 0]`.  
Derivable by hand: taps=[1], seed=[1,1]:
- i=0: fb=1 → out=1, fb^=sr[1]=1 → fb=0, sr=[1,0]
- i=1: fb=1 → out=1, fb^=sr[1]=0 → fb=1, sr=[0,1]
- i=2: fb=0 → out=0, fb^=sr[1]=1 → fb=1, sr=[1,1]

### Known sequence for n=3
`generateMLS(3)` should return `[1, 1, 1, 0, 1, 0, 0]`.  
Derivable by hand: taps=[2], seed=[1,1,1].

### Invalid nbits throws
- `generateMLS(1)` — taps not defined, `mls()` throws `BitError`
- `generateMLS(17)` — taps not defined, throws `BitError`
- `generateMLS(0)` — throws `BitError`

---

## Test Cases — `worker.test.js`

### Setup

Import at top of file:
```js
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
```

Store and restore `postMessage` around each test using a manual spy array:
```js
let originalPostMessage
let postMessageCalls

beforeEach(() => {
  originalPostMessage = globalThis.postMessage
  postMessageCalls = []
  globalThis.postMessage = (message) => postMessageCalls.push(message)
})

afterEach(() => {
  if (originalPostMessage === undefined) {
    delete globalThis.postMessage
  } else {
    globalThis.postMessage = originalPostMessage
  }
})
```

### `calculateCrossCorrelation`

**Output length:**  
For any inputs, `postMessage` is called with `correlation.length === maxLag + 1`.

**Auto-correlation peak at lag 0:**  
When `data1 === data2` (same non-trivial signal), the correlation value at index 0 should be the maximum in the array. Uses the MLS sequence itself as input.

**Known shifted impulse:**  
```
data1 = [0, 0, 0, 1, 0, 0, 0, 0, 0, 0]   (impulse at index 3)
data2 = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0]   (impulse at index 0)
maxLag = 5
```
Expected: correlation peak at index 3 (i.e., `correlation[3]` is the maximum value).

**Zero input:**  
All-zero `data1` and `data2` → all-zero correlation array.

**Channel passthrough:**  
`postMessage` called with `{ channel: 7 }` when `channel = 7`.

**`postMessage` shape:**  
Called exactly once; verify with:
```js
assert.strictEqual(postMessageCalls.length, 1)
assert.ok(Array.isArray(postMessageCalls[0].correlation))
assert.ok(typeof postMessageCalls[0].channel === 'number')
```

**`debug=false` — no console output:**  
Swap `console.debug` before the call, restore in `finally`:
```js
const orig = console.debug
const debugCalls = []
console.debug = (...args) => debugCalls.push(args)
try {
  calculateCrossCorrelation(data, data, maxLag, 0, false)
  assert.strictEqual(debugCalls.length, 0)
} finally {
  console.debug = orig
}
```

**`debug=true` — console output fires:**  
Same pattern; assert `debugCalls.length > 0`.

---

### `findPeakAndMean`

**Clear mid-array peak:**  
```
input = [0, 0, 5, 0, 0]
```
Expected: `peakIndex = 2`, `peakValuePow = 25`.

**Peak at index 0:**  
```
input = [3, 1, 0]
```
Expected: `peakIndex = 0`, `peakValuePow = 9`.

**Peak at last index:**  
```
input = [0, 0, 4]
```
Expected: `peakIndex = 2`, `peakValuePow = 16`.

**Mean calculation — document current behaviour:**  
The loop accumulates energy from index 1 onward (index 0 is excluded from `energy`). Tests must document and lock in this behaviour, since changing it would recalibrate the 18 dB threshold:
```
input = [2, 2, 2]
energy = 4 + 4 = 8   (i=1 and i=2 only)
mean   = 8 / 3 ≈ 2.667
```
Expected: `mean ≈ 2.667` (not 4, which would be the true squared mean).

**Channel passthrough:**  
`postMessage` called with `{ channel: 3 }` when `channel = 3`.

**`postMessage` shape:**  
Called exactly once; verify each field is a number:
```js
assert.strictEqual(postMessageCalls.length, 1)
const msg = postMessageCalls[0]
for (const key of ['peakValuePow', 'peakIndex', 'mean', 'channel']) {
  assert.ok(typeof msg[key] === 'number')
}
```

**`debug=false` — no console output:**  
Same swap pattern as in `calculateCrossCorrelation` tests.

**`debug=true` — console output fires:**  
Same swap pattern; assert at least one call.

---

## Known Behaviour to Lock In (Do Not "Fix")

- **`findPeakAndMean` mean excludes index 0** — `energy` accumulates from `i=1`. This is the current calibrated behaviour. Tests assert the current result, not the mathematically "correct" one. Do not change this without re-evaluating the 18 dB threshold.
- **`calculateCrossCorrelation` normalises by `(n1 - lag)`** — values at higher lags are smaller due to fewer overlapping samples. Tests should not assume raw correlation magnitudes are equal across lags.

---

## Implementation Tasks

### Setup
- [x] Add `"test": "node --test"` to `package.json` scripts
- [x] No packages to install, no config file needed

### `worker.js` refactor
- [x] Add `export` to `calculateCrossCorrelation` and `findPeakAndMean`
- [x] Guard `addEventListener` call with `WorkerGlobalScope` check
- [x] Verify `npm run dev` and `npm run build:component` still work after refactor (esbuild bundles the worker inline — confirm the export keywords don't break bundling). Build verified on 2026-05-29 after maxLag floor, error-routing, and mediarecorder-2ch guard changes. Subsequent source change was a comment removal only — no bundle impact.

### Test files
- [x] Create `tests/mls.test.js` with all cases above
- [x] Create `tests/worker.test.js` with all cases above
- [x] `npm test` passes with zero failures

### Validation
- [x] Run tests in Node.js 18 (match `.nvmrc`)
- [ ] Confirm worker.js still functions correctly in the browser after the refactor (run the demo, verify a latency measurement completes)

---

## Notes for LLMs

- Do not add tests for browser-API-dependent code (`latency-test-element.js`, `test.js`). Mocking `AudioContext` or `MediaRecorder` would not test real behaviour and would give false confidence.
- The `findPeakAndMean` mean calculation excluding index 0 is intentional from a test-locking perspective — test the current output, not the mathematically ideal output.
- `performance` is available globally in Node.js 18 — no stub needed for the debug log calls inside the functions.
- Use `node:test` and `node:assert/strict` — no Vitest or other third-party test library. Globals (`postMessage`, `console.debug`) are stubbed by direct assignment to `globalThis` and restored in `afterEach`. `mock` is not available in Node 18.12.1 — use manual spy arrays instead.
- After the `worker.js` refactor, the build pipeline must be re-verified. The worker is inlined via a Blob URL in the esbuild plugin — the `export` keywords should be harmless, but confirm.
