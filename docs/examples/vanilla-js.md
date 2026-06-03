<div style="display:flex;align-items:center;gap:14px;margin-bottom:1.5rem">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/javascript/javascript-original.svg" width="52" height="52" alt="JavaScript">
<span style="font-size:2rem;font-weight:700;line-height:1">Vanilla JS Integration</span>
</div>


No framework required. Import the package and use the element directly in HTML.

---

## Basic usage

The recommended pattern is a two-step flow: connect audio first, then run tests. This keeps the mic stream warm between repeated clicks and avoids cold-start instability.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <script type="module" src="https://cdn.jsdelivr.net/npm/@adasp/latency-test/dist/latency-test.esm.js"></script>
</head>
<body>
  <button id="connect-btn">Connect Audio</button>

  <div id="test-ui" hidden>
    <button id="start-btn">Test Latency</button>
    <p id="result"></p>
    <p id="stats"></p>
  </div>

  <latency-test id="lt" number-of-tests="5"></latency-test>

  <script>
    const lt = document.getElementById('lt')
    const connectBtn = document.getElementById('connect-btn')
    const testUi = document.getElementById('test-ui')
    const startBtn = document.getElementById('start-btn')
    const result = document.getElementById('result')
    const stats = document.getElementById('stats')

    const MIC_CONSTRAINTS = {
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }
    }

    let micStream = null
    let audioCtx = null

    connectBtn.addEventListener('click', async () => {
      connectBtn.disabled = true
      try {
        micStream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS)
        audioCtx = new AudioContext({ latencyHint: 0 })
        lt.inputStream = micStream
        lt.audioContext = audioCtx
        connectBtn.hidden = true
        testUi.hidden = false
      } catch (e) {
        micStream?.getTracks().forEach(t => t.stop())
        micStream = null
        connectBtn.disabled = false
        result.textContent = `Could not access mic: ${e.message}`
      }
    })

    window.addEventListener('beforeunload', () => {
      micStream?.getTracks().forEach(t => t.stop())
      audioCtx?.close()
    })

    startBtn.addEventListener('click', () => lt.start())

    lt.addEventListener('latency-result', (e) => {
      const { latency, ratio, reliable } = e.detail
      result.textContent = `${latency.toFixed(2)} ms — ratio: ${ratio.toFixed(2)} dB${reliable ? '' : ' ⚠️ unreliable'}`
    })

    lt.addEventListener('latency-complete', (e) => {
      const { results, mean, std, min, max } = e.detail
      if (results.length > 1)
        stats.textContent = `Mean: ${mean.toFixed(2)} ms | SD: ${std.toFixed(2)} | Min: ${min.toFixed(2)} | Max: ${max.toFixed(2)}`
    })

    lt.addEventListener('latency-error', (e) => {
      result.textContent = `Error: ${e.detail.message}`
    })
  </script>
</body>
</html>
```

> **Real-world use:** In an application that already manages a mic stream and `AudioContext` (e.g. a Web Audio DAW), pass both directly — no Connect Audio step needed. See [Sharing audio resources from a host app](#sharing-audio-resources-from-a-host-app).

---

## Sharing audio resources from a host app

When your application already owns a mic stream and `AudioContext`, pass both to the element. The component will not stop the stream or close the context — the host owns both lifetimes.

```html
<latency-test id="lt"></latency-test>

<script type="module">
import '@adasp/latency-test'

// Host already has a stream and AudioContext (e.g. a DAW)
const lt = document.getElementById('lt')
lt.inputStream = existingStream
lt.audioContext = existingAudioContext

lt.addEventListener('latency-result', (e) => {
  console.log(e.detail.latency, 'ms')
})

document.getElementById('startBtn').addEventListener('click', () => lt.start())
</script>
```

---

## Stopping an in-progress test

```js
const lt = document.querySelector('latency-test')

document.getElementById('stopBtn').addEventListener('click', () => {
  lt.stop()
})
```

---

## TypeScript

Types ship with the package. `querySelector` returns the correct type automatically:

```ts
import '@adasp/latency-test'

const el = document.querySelector('latency-test') // → LatencyTestElement
el?.start()        // ✅ typed
el?.audioContext   // ✅ typed
el?.addEventListener('latency-result', (e) => {
  console.log(e.detail.latency) // ✅ typed
})
```
