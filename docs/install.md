# Installation & Setup — `@adasp/latency-test`

---

## Requirements

- Node.js v18 or above (matches the package `engines` field; development pins Node 22 via `.nvmrc`)
- A browser with Web Audio API and `getUserMedia` support (AudioWorklet required only for `recording-mode="audioworklet"`)
- HTTPS or `localhost` (required for microphone access)

---

## npm

```bash
npm install @adasp/latency-test
```

Then import in your entry point:

```js
import '@adasp/latency-test'
```

This registers the `<latency-test>` custom element globally. After the import, use the element anywhere in your HTML or component templates.

For older browsers (Chrome 74–79, Firefox &lt; 72, Safari 14 — `recording-mode="mediarecorder"` only; see [Legacy IIFE](#cdn-no-build-step) below for details), import the legacy build via the `./legacy` subpath instead:

```js
import '@adasp/latency-test/legacy'
```

---

## CDN (no build step)

Choose the approach that fits your project:

**ESM (modern browsers — recommended):**
```html
<!-- jsDelivr -->
<script type="module" src="https://cdn.jsdelivr.net/npm/@adasp/latency-test@1.2.1/dist/latency-test.esm.js"></script>

<!-- unpkg -->
<script type="module" src="https://unpkg.com/@adasp/latency-test@1.2.1/dist/latency-test.esm.js"></script>
```

**IIFE (modern browsers, no module support required):**
```html
<!-- jsDelivr -->
<script src="https://cdn.jsdelivr.net/npm/@adasp/latency-test@1.2.1/dist/latency-test.iife.js"></script>

<!-- unpkg -->
<script src="https://unpkg.com/@adasp/latency-test@1.2.1/dist/latency-test.iife.js"></script>
```

**Legacy IIFE (older MediaRecorder-capable browsers — Chrome 74–79, Firefox &lt; 72, Safari 14 — `recording-mode="mediarecorder"` only; `"audioworklet"` emits `latency-error` on Chrome 74–79):**
```html
<!-- jsDelivr -->
<script src="https://cdn.jsdelivr.net/npm/@adasp/latency-test@1.2.1/dist/latency-test.legacy.iife.js"></script>

<!-- unpkg -->
<script src="https://unpkg.com/@adasp/latency-test@1.2.1/dist/latency-test.legacy.iife.js"></script>
```

All three register the `<latency-test>` element globally. Place either in the `<head>` of your HTML file.

For the full list of files in `dist/` and which build command produces each, see [Build Output](./build-output.md).

---

## Basic usage

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <script type="module" src="https://cdn.jsdelivr.net/npm/@adasp/latency-test@1.2.1/dist/latency-test.esm.js"></script>
</head>
<body>
  <latency-test id="el"></latency-test>
  <button id="start">Test Latency</button>

  <script>
    const el = document.getElementById('el')

    el.addEventListener('latency-result', (e) => {
      console.log(`Latency: ${e.detail.latency} ms — Ratio: ${e.detail.ratio.toFixed(2)} dB`)
    })

    el.addEventListener('latency-error', (e) => {
      console.error('Test failed:', e.detail.message)
    })

    // audioContext and inputStream must be assigned before start() — create them from a user gesture
    document.getElementById('start').addEventListener('click', async () => {
      if (!el.inputStream) {
        const ac = new AudioContext({ latencyHint: 0 })
        try {
          el.inputStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
          })
          el.audioContext = ac
        } catch (e) {
          await ac.close()
          console.error('Could not access mic:', e.message)
          return
        }
      }
      el.start()
    })
  </script>
</body>
</html>
```

---

## Providing AudioContext and stream

Before calling `start()`, both `audioContext` and `inputStream` must be assigned. The component never creates audio resources itself — it emits `latency-error` if either is missing.

Both must come from a user gesture (browsers require it for microphone access and AudioContext creation). Create the `AudioContext` synchronously inside the gesture handler, **before** `await getUserMedia()` — an `AudioContext` created after an `await` starts in `suspended` state in Firefox.

For a complete runnable page — including the click handler that assigns both properties and calls `start()` — see [Basic usage](#basic-usage) above.

If your application already has an `AudioContext` (e.g. a DAW), pass it directly — no need to create a second one:

```js
el.inputStream = myExistingStream   // still required
el.audioContext = myExistingAudioContext
el.start()
```

---

## Sample rate

`new AudioContext()` without an explicit `sampleRate` uses the output device's native rate. On some configurations — observed on Chrome 124+ on macOS 15 with certain audio interfaces — the mic input track runs at a different native rate (for example, AC at 44100 Hz, mic at 96000 Hz). The browser resamples the input transparently via `createMediaStreamSource()`, so measurements remain valid, but the internal resampling may contribute to latency variance.

Two workarounds were tested and are not recommended:

- Passing `sampleRate: ac.sampleRate` as an ideal constraint to `navigator.mediaDevices.getUserMedia()` — Chrome reports the actual hardware rate and ignores this constraint.
- Creating the `AudioContext` after `await getUserMedia()` using `track.getSettings().sampleRate` — did not produce correct results (not investigated further), and additionally breaks the Firefox user-gesture requirement: an `AudioContext` created after an `await` starts in `suspended` state in Firefox, making `outputLatency` unavailable.

There is no reliable cross-browser API to force both devices to share the same sample rate from JavaScript. If you observe higher variance, check your operating system's audio settings and configure all devices to the same native rate.

---

## Running the demo locally

The demo page loads the built legacy IIFE bundle, so build it first:

```bash
git clone https://github.com/idsinge/latency-test.git
cd latency-test
npm install
npm run build:component:legacy
npm run demo
# open http://localhost:3000/demo/
```

Other local servers, for reference:

- `npm run dev` — internal dev/test pages, served natively from `src/` (no build step needed)
- `npm run docs:dev` — this documentation site
