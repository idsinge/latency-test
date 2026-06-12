---
layout: home

hero:
  name: "@adasp/latency-test"
  text: "Round-trip audio latency measurement"
  tagline: "Web Component powered by Web Audio API. Headless API, MLS-based latency measurement, easy to embed in any Web Audio project."
  actions:
    - theme: brand
      text: Get Started
      link: /install
    - theme: alt
      text: API Reference
      link: /api
    - theme: alt
      text: Live Demo
      link: https://idsinge.github.io/latency-test/demo/
    - theme: alt
      text: GitHub
      link: https://github.com/idsinge/latency-test

features:
  - title: MLS-Based Measurement
    details: Uses a Maximum Length Sequence signal and cross-correlation for accurate round-trip latency estimation. Chirp and Golay are planned for a future release.
  - title: Dual Capture Backends
    details: MediaRecorder and AudioWorklet — both implemented and selectable via the recording-mode attribute.
  - title: Headless by Default
    details: Exposes start() / stop() methods and fires CustomEvents. No built-in UI — drop it into any host application or DAW without styling conflicts.
  - title: Framework Ready
    details: Works with Vanilla JS, React, Vue, Svelte, Angular, and Next.js. Zero dependencies at runtime.
---

## Quick start

```bash
npm install @adasp/latency-test
```

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@adasp/latency-test@1.2.0/dist/latency-test.esm.js"></script>

<latency-test id="lt"></latency-test>
<button id="btn">Test</button>

<script type="module">
  const lt = document.getElementById('lt')

  lt.addEventListener('latency-result', (e) => {
    console.log(`${e.detail.latency} ms — ratio: ${e.detail.ratio.toFixed(2)} dB`)
  })

  // audioContext and inputStream must be assigned before start() — create them from a user gesture
  document.getElementById('btn').addEventListener('click', async () => {
    if (!lt.audioContext) {
      lt.audioContext = new AudioContext({ latencyHint: 0 })
      lt.inputStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      })
    }
    lt.start()
  })
</script>
```

## Key concepts

- The component is **headless by default** — it exposes `start()` / `stop()` and fires events. No built-in button or result display.
- Results are delivered via the `latency-result` CustomEvent (`{ latency, ratio, reliable, timestamp, mode }`).
- A reliability ratio above **18 dB** indicates a trustworthy measurement.
- Before calling `start()`, assign `element.inputStream` (a `MediaStream`) and `element.audioContext` (an `AudioContext`) — the component never creates audio resources itself. If your app already has an `AudioContext`, pass it directly to avoid creating a second one.
- Use `recording-mode` to select the capture backend: `"mediarecorder"` (2-channel, v1 default — no start-timing bias), `"mediarecorder-1ch"` (1-channel fallback for browsers that downmix stereo to mono), or `"audioworklet"` (planned v2 default, sample-accurate raw PCM).
- `signal-type` is `"mls"` in v1. `"chirp"` and `"golay"` are planned for v2.

## Try it live

An interactive demo is live at **[idsinge.github.io/latency-test/demo](https://idsinge.github.io/latency-test/demo/)**. It loads the built IIFE bundle and lets you test round-trip latency in your browser — with your own microphone and audio setup — across all available capture backends and usage patterns.

## Origin

This component is the web component development branch of [gilpanal/weblatencytest](https://github.com/gilpanal/weblatencytest), a proof-of-concept associated with the paper presented at [WAC 2025](https://wac-2025.ircam.fr/).
