---
layout: home

hero:
  name: "@adasp/latency-test"
  text: "Round-trip audio latency measurement"
  tagline: "Web Component powered by Web Audio API. Headless API, multiple signal types, easy to embed in any Web Audio project."
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
  - title: Multiple Signal Types
    details: MLS (Maximum Length Sequence) — the current default. Chirp and Golay are planned for a future release.
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
<latency-test id="lt"></latency-test>
<button onclick="document.getElementById('lt').start()">Test</button>

<script type="module">
  import '@adasp/latency-test'

  document.getElementById('lt').addEventListener('latency-result', (e) => {
    console.log(`${e.detail.latency} ms — ratio: ${e.detail.ratio.toFixed(2)} dB`)
  })
</script>
```

## Key concepts

- The component is **headless by default** — it exposes `start()` / `stop()` and fires events. No built-in button or result display.
- Results are delivered via the `latency-result` CustomEvent (`{ latency, ratio, reliable, timestamp, mode }`).
- A reliability ratio above **18 dB** indicates a trustworthy measurement.
- Microphone access is requested on the first `start()` call.
- For DAW or multi-context applications, pass your existing `AudioContext` via `element.audioContext = ac` before calling `start()`.
- Use `recording-mode` to select the capture backend: `"mediarecorder"` (v1 default, implemented) or `"audioworklet"` (v2 default, implemented). `"mediarecorder-2ch"` is planned (Phase 3b).
- Use `signal-type` to select the measurement signal: `"mls"` (implemented), `"chirp"`, or `"golay"` (planned).
- `input-gain` is reserved for a future gain multiplier — it is not yet wired in the current version.

## Try it live

An interactive demo is live at **[idsinge.github.io/latency-test/demo](https://idsinge.github.io/latency-test/demo/)**. It loads the built IIFE bundle and lets you test round-trip latency in your browser — with your own microphone and audio setup — across all available capture backends and usage patterns.

## Origin

This component is the web component development branch of [gilpanal/weblatencytest](https://github.com/gilpanal/weblatencytest), a proof-of-concept associated with the paper presented at [WAC 2025](https://wac-2025.ircam.fr/).
