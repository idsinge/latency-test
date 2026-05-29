# Installation & Setup — `@hi-audio/latency-test`

> **Draft.** The package is not yet published to npm. This document describes the intended installation workflow once it is.

---

## Requirements

- Node.js v18 or above (project pins v18.12.1 via `.nvmrc`)
- A browser with Web Audio API, AudioWorklet, and `getUserMedia` support
- HTTPS or `localhost` (required for microphone access)

---

## npm

```bash
npm install @hi-audio/latency-test
```

Then import in your entry point:

```js
import '@hi-audio/latency-test'
```

This registers the `<latency-test>` custom element globally. After the import, use the element anywhere in your HTML or component templates.

---

## CDN (no build step)

Choose the approach that fits your project:

**ESM (modern browsers — recommended):**
```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@hi-audio/latency-test/dist/latency-test.esm.js"></script>
```

**IIFE (universal — no module support required):**
```html
<script src="https://cdn.jsdelivr.net/npm/@hi-audio/latency-test/dist/latency-test.iife.js"></script>
```

Both register the `<latency-test>` element globally. Place either in the `<head>` of your HTML file.

---

## Basic usage

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <script type="module" src="https://cdn.jsdelivr.net/npm/@hi-audio/latency-test/dist/latency-test.esm.js"></script>
</head>
<body>
  <latency-test></latency-test>
  <button id="start">Test Latency</button>

  <script>
    const el = document.querySelector('latency-test')

    el.addEventListener('latency-result', (e) => {
      console.log(`Latency: ${e.detail.latency} ms — Ratio: ${e.detail.ratio.toFixed(2)} dB`)
    })

    el.addEventListener('latency-error', (e) => {
      console.error('Test failed:', e.detail.message)
    })

    // Must be called from a user gesture — AudioContext requires it
    document.getElementById('start').addEventListener('click', () => el.start())
  </script>
</body>
</html>
```

---

## Sharing an existing AudioContext

If your application already has an `AudioContext` (e.g. a DAW or audio workstation), pass it to the element before calling `start()` to avoid creating a second context:

```html
<!-- Assumes: <button id="startBtn">Test Latency</button> in your HTML -->
<script type="module">
import '@hi-audio/latency-test'

const el = document.querySelector('latency-test')
el.audioContext = myExistingAudioContext

el.addEventListener('latency-result', (e) => {
  console.log(e.detail.latency, 'ms')
})

// Must be called from a user gesture — getUserMedia requires it
document.getElementById('startBtn').addEventListener('click', () => el.start())
</script>
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
