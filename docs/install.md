# Installation & Setup — `@adasp/latency-test`

---

## Requirements

- Node.js v18 or above (project pins v18.12.1 via `.nvmrc`)
- A browser with Web Audio API, AudioWorklet, and `getUserMedia` support
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

---

## CDN (no build step)

Choose the approach that fits your project:

**ESM (modern browsers — recommended):**
```html
<!-- jsDelivr -->
<script type="module" src="https://cdn.jsdelivr.net/npm/@adasp/latency-test/dist/latency-test.esm.js"></script>

<!-- unpkg -->
<script type="module" src="https://unpkg.com/@adasp/latency-test/dist/latency-test.esm.js"></script>
```

**IIFE (universal — no module support required):**
```html
<!-- jsDelivr -->
<script src="https://cdn.jsdelivr.net/npm/@adasp/latency-test/dist/latency-test.iife.js"></script>

<!-- unpkg -->
<script src="https://unpkg.com/@adasp/latency-test/dist/latency-test.iife.js"></script>
```

Both register the `<latency-test>` element globally. Place either in the `<head>` of your HTML file.

---

## Basic usage

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <script type="module" src="https://cdn.jsdelivr.net/npm/@adasp/latency-test/dist/latency-test.esm.js"></script>
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
      if (!el.audioContext) {
        el.inputStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        })
        el.audioContext = new AudioContext({ latencyHint: 0 })
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

Both must come from a user gesture (browsers require it for microphone access and AudioContext creation):

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@adasp/latency-test/dist/latency-test.esm.js"></script>

<latency-test id="el"></latency-test>
<button id="startBtn">Test Latency</button>

<script type="module">
const el = document.getElementById('el')

el.addEventListener('latency-result', (e) => {
  console.log(e.detail.latency, 'ms')
})

document.getElementById('startBtn').addEventListener('click', async () => {
  if (!el.audioContext) {
    el.inputStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    })
    el.audioContext = new AudioContext({ latencyHint: 0 })
  }
  el.start()
})
</script>
```

If your application already has an `AudioContext` (e.g. a DAW), pass it directly — no need to create a second one:

```js
el.inputStream = myExistingStream   // still required
el.audioContext = myExistingAudioContext
el.start()
```

---

## Running the demo locally

```bash
git clone https://github.com/idsinge/latency-test.git
cd latency-test
npm install
npm run dev
# open http://localhost:3000
```
