# Host-Controlled Input Gain

Some recording setups require amplifying the microphone signal before the component can cross-correlate reliably. The component does not apply gain internally — the host builds a Web Audio gain chain and passes the processed stream via `element.inputStream`.

## When to use

- Any scenario where the raw mic stream has insufficient level for a reliable cross-correlation result.
- **Safari ≥ 16 with `echoCancellation: false`**: disabling echo cancellation on Safari can produce a very low input level. An empirical gain of 50× has been found effective. The `input-gain` attribute (planned for v2) will allow this to be set directly on the element without the extra stream round-trip described below.

## Signal chain

```
getUserMedia stream
  → MediaStreamSource
  → ChannelSplitterNode (2 outputs)
  → output[0]  ← left channel (or only channel for mono sources)
  → GainNode
  → MediaStreamDestinationNode (channelCount = 1)
  → dest.stream  →  element.inputStream
```

The `ChannelSplitterNode` routes output index 0 — the left channel — to the gain stage. For mono inputs, output 0 carries the full signal. For stereo inputs (e.g. wired earpods on Safari, which force a stereo stream with signal only on the left channel), this isolates the useful channel before applying gain.

## Measurement note

This pattern introduces an extra browser-managed Web Audio / MediaStream bridge. The component measures the latency of that pipeline, not a direct mic path. Results are internally consistent but should not be compared directly to measurements taken in direct-stream mode.

## Example

```js
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1
  }
})
const ac = new AudioContext({ latencyHint: 0 })

// Build the gain chain.
// Adjust gainValue as needed — 50 is a starting point for Safari >= 16
// with echoCancellation: false.
const gainValue = 1
const source = ac.createMediaStreamSource(stream)
const splitter = ac.createChannelSplitter(2)
const gainNode = ac.createGain()
gainNode.gain.value = gainValue
const dest = ac.createMediaStreamDestination()
dest.channelCount = 1

source.connect(splitter)
splitter.connect(gainNode, 0)  // left channel only
gainNode.connect(dest)

const tester = document.querySelector('latency-test')
tester.audioContext = ac
tester.inputStream = dest.stream

tester.addEventListener('latency-result', e => {
  console.log(`Latency: ${e.detail.latency.toFixed(2)} ms — ratio: ${e.detail.ratio.toFixed(2)} dB`)
})

tester.start()
```

## Adjusting gain at runtime

The `gainNode` is created once at session setup and can be updated between test runs without disconnecting or re-acquiring the mic:

```js
gainNode.gain.value = 50  // update before or between test runs
```

## AudioWorklet mode

The same pattern works with `recording-mode="audioworklet"`. The `dest.stream` is passed as `inputStream` and the component creates a `MediaStreamSource` from it internally. This introduces a second stream round-trip, so the pipeline differs from a direct AudioWorklet path. The `input-gain` attribute (v2) will apply gain inside the component's signal chain without this extra hop.
