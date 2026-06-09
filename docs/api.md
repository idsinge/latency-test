# API Reference — `@adasp/latency-test`

> Items marked `(implemented)` are active in the current version.
> Items marked `(planned)` are reserved for future versions.

---

## Element

```html
<latency-test></latency-test>
```

Register the element by importing the package:

```js
import '@adasp/latency-test'
```

---

## Attributes

Attributes can be set in HTML or via JavaScript property assignment. Setting an attribute updates the corresponding JS property via `attributeChangedCallback`. Setting a JS property directly does not update the HTML attribute (reflection is one-way).

| Attribute | Property | Type | Default | Description | Status |
|---|---|---|---|---|---|
| `number-of-tests` | `numberOfTests` | `number` | `1` | How many consecutive measurements to run. When > 1, a `latency-complete` event is fired after the last run with aggregate statistics. | implemented |
| `recording-mode` | `recordingMode` | `string` | `"mediarecorder"` | Capture backend. `"mediarecorder"` — dual-channel via `ChannelMergerNode` + `MediaStreamDestinationNode`, mic and reference captured in one stereo stream sharing a timeline, no start-timing bias (default, implemented). Emits `latency-error` if the browser downmixes the stereo stream to mono — use `"mediarecorder-1ch"` as fallback in that case. `"mediarecorder-1ch"` — single-channel, mic stream used directly, start-timing bias present; use when `"mediarecorder"` fails due to mono downmix, or to measure the direct-mic capture pipeline (implemented). `"audioworklet"` — raw Float32 PCM, shared AudioContext clock, no codec round-trip, accuracy reference for the component's own minimal capture graph (implemented). Each mode measures the latency of its own pipeline — the differences between modes are intentional and informative. | implemented |
| `signal-type` | `signalType` | `string` | `"mls"` | Test signal used for the round-trip measurement. Only `"mls"` is implemented. See signal types table below. | planned (v2) |
| `input-gain` | `inputGain` | `number` | `0` | Gain multiplier applied to the input stream before capture. `0` means no gain applied. Attribute observed but gain node not yet wired. | planned (v2) |
| `mls-bits` | `mlsBits` | `number` | `15` | Order of the MLS sequence. Sequence length = 2^n − 1. Valid range: 2–16. Only applies when `signal-type="mls"`. | implemented |
| `max-lag-ms` | `maxLagMs` | `number` | `600` | Cross-correlation search window in milliseconds. Determines the maximum measurable round-trip latency. | implemented |
| `buffer-size` | `bufferSize` | `number` | `0` | AudioWorklet accumulation buffer in samples. `0` accumulates everything and posts once on stop. Available for future intermediate flush behavior — the value is wired through to the processor. | implemented |
| `debug` | `debug` | `boolean` | `false` | Enables `console.debug('[latency-test]', ...)` logging at key internal checkpoints — host resource validation, recording start, worker messages, and result computation. **For development and debugging only; has no effect on measurement output.** Caution: `startPairSpanMs` in the log output is an upper-bound span that includes both `mediaRecorder.start()` and `noiseSource.start()` execution time — it is not a pure inter-call gap. Additionally, debug logging elsewhere (and DevTools being open) can perturb console and scheduling performance. Do not use debug mode for measurements you intend to record. Toggle at runtime without page reload: `element.debug = true`. | implemented |

### Recording mode and pipeline validity

Choose `recording-mode` to match the host application's real capture pipeline. The component measures the latency of the selected pipeline, not an abstract browser latency value.

For `recording-mode="audioworklet"`, the current implementation captures a minimal direct chain: mic stream → `MediaStreamAudioSourceNode` → component `AudioWorkletNode`, with the reference signal captured in the same `process()` call. This removes start-timing bias, but it is a lower-bound estimate for host apps with more complex AudioWorklet graphs.

Three factors affect whether the result represents the host app's real latency: the render quantum / effective buffer size, the number and type of nodes between the mic source and the worklet, and scheduling jitter introduced by the host graph. `mediarecorder` and `mediarecorder-1ch` are less sensitive to host graph topology because MediaRecorder is a browser-managed capture pipeline.

`mediarecorder` (2-channel default) and `mediarecorder-1ch` measure different pipelines. The 2-channel path routes the mic through a `ChannelMergerNode` and `MediaStreamDestinationNode` — this removes the start-timing offset but adds Web Audio graph overhead whose direction is browser-dependent. `mediarecorder-1ch` uses the raw mic stream directly — closest to a production DAW capture path, but subject to an unknown per-run start-timing offset between `mediaRecorder.start()` and `noiseSource.start()`. Use `mediarecorder-1ch` when `mediarecorder` fails (mono downmix), or deliberately when you want to measure the direct-mic pipeline.

### Example

```html
<latency-test
  number-of-tests="5"
  recording-mode="mediarecorder"
  signal-type="mls"
  mls-bits="15"
  max-lag-ms="600"
  input-gain="0">
</latency-test>
```

### Signal types

| Value | Description | Status |
|---|---|---|
| `"mls"` | **Maximum Length Sequence** — binary pseudorandom signal generated by a Linear Feedback Shift Register. Optimal for cross-correlation. Default. | Available |
| `"chirp"` | **Logarithmic sine sweep** — sweeps across a frequency range over a fixed duration. Cross-correlated with a matched filter (time-reversed chirp) to estimate the impulse response. | Planned |
| `"golay"` | **Golay complementary sequence pair** — two sequences (A and B) whose autocorrelations sum to a perfect impulse. Requires two measurement passes. Best SNR in reverberant or noisy environments. | Planned |

### ScriptProcessor (older browsers)

`ScriptProcessor` is deprecated and removed from the Web Audio spec, but is documented here as a reference for very old browser environments. It is not exposed as a `recording-mode` value. Implementations should detect support and fall back to `"mediarecorder"` in environments where `AudioWorklet` is unavailable.

Reference: [superpoweredSDK/WebBrowserAudioLatencyMeasurement](https://github.com/superpoweredSDK/WebBrowserAudioLatencyMeasurement)

---

## Debug Mode

The `debug` attribute enables `console.debug('[latency-test]', ...)` logging at key internal checkpoints. It is intended for development and troubleshooting only.

> **Chrome / Edge:** `console.debug` is a Verbose-level log. Open DevTools Console, click the log-level dropdown (defaults to **Default levels**), and check **Verbose** — otherwise no `[latency-test]` entries will appear.

### Enabling

```html
<!-- HTML attribute -->
<latency-test debug></latency-test>
```

```js
// JS property — can be toggled at runtime without page reload
element.debug = true
```

> **Enable debug before calling `start()` for full coverage.**
> The `debug` flag is passed to the controller and worker at run start — their logs are snapshotted at that point. Element-level lifecycle logs (e.g. `latency-complete`) read `debug` live, so changes mid-run may still affect those.

### What gets logged

Each line is prefixed `[latency-test]` with a timestamp in ms — main-thread logs use `performance.now()` (relative to page load); worker logs use `performance.timeOrigin + performance.now()` (absolute wall-clock ms). Checkpoints include:

- Host resource validation (stream and context state at `start()` time)
- `AudioContext` state and sample rate at start
- Recording start — mode, MIME type, MLS buffer length
- Worker message sends (correlation command, `maxLag`, buffer sizes)
- Worker results (peak index, ratio, mode)
- `startPairSpanMs` — wall-clock span between `mediaRecorder.start()` and `noiseSource.start()`. This is an **upper-bound diagnostic** that spans the execution time of both calls; it is not a pure inter-call gap and should not be interpreted as the start-timing bias between the two clocks.

### Warning: do not use for production measurements

> Debug logging — and having DevTools open — can perturb browser scheduling and affect latency estimates. Results collected while `debug` is enabled should not be recorded, published, or compared against non-debug measurements.

---

## Properties (JS only)

These are set via JavaScript, not HTML attributes.

| Property | Type | Description |
|---|---|---|
| `audioContext` | `AudioContext` | Required before calling `start()`. Assign the host's `AudioContext` to this property. If not set when `start()` is called, a `latency-error` is emitted immediately. The component never calls `.close()` — the host owns the lifetime. **Sample rate:** create the `AudioContext` without specifying `sampleRate` so the browser matches the output device — this gives the best MLS playback accuracy. If the input device runs at a different rate the browser resamples the mic transparently; the component logs a `console.warn` but the measurement remains correct. **Suspend:** browsers may auto-suspend an idle `AudioContext`; the component logs a `console.warn` if suspended at `start()` time. Call `audioContext.resume()` from a user gesture before `start()` if the context may have been idle. |
| `inputStream` | `MediaStream` | Required before calling `start()`. Assign the host's mic `MediaStream` to this property. If not set when `start()` is called, a `latency-error` is emitted immediately. The component never stops the tracks — the host owns the lifetime. |

### Example

```js
const element = document.querySelector('latency-test')
element.audioContext = existingAudioContext
```

---

## Methods

### `start()`

Begins a latency measurement. If `number-of-tests` > 1, runs that many consecutive measurements automatically.

Requires `inputStream` and `audioContext` to be assigned before calling. Emits `latency-error` immediately if either is missing.

```js
element.start()
```

### `stop()`

Aborts an in-progress measurement. The component returns to its idle state. If runs were pending, a `latency-complete` event fires with `{ aborted: true }` and partial results. No `latency-result` fires for the aborted run.

```js
element.stop()
```

---

## Events

All events bubble and are composed (they cross shadow DOM boundaries).

### `latency-result`

Fired once per completed test run with the measurement result.

```js
element.addEventListener('latency-result', (e) => {
  const { latency, ratio, reliable, timestamp, mode } = e.detail
  // latency   — round-trip latency in milliseconds (number)
  // ratio     — correlation reliability in dB (number); values > 18 dB are considered reliable
  // reliable  — boolean, true when ratio > 18 dB
  // timestamp — Unix timestamp of the measurement (number)
  // mode      — recording-mode that produced this result: "mediarecorder" | "mediarecorder-1ch" | "audioworklet"
})
```

### `latency-complete`

Fired when all runs complete (or when `stop()` aborts mid-sequence). Contains all results and aggregate statistics. When aborted, `e.detail.aborted` is `true`.

```js
element.addEventListener('latency-complete', (e) => {
  const { results, mean, std, min, max, aborted } = e.detail
  // results — array of { latency, ratio, reliable, timestamp, mode } objects
  // mean    — mean latency in ms
  // std     — standard deviation of latency in ms
  // min     — minimum latency in ms
  // max     — maximum latency in ms
  // aborted — true when stop() was called mid-sequence (undefined otherwise)
})
```

### `latency-error`

Fired when the measurement cannot proceed (e.g. `inputStream` or `audioContext` not set, controller initialisation failed).

```js
element.addEventListener('latency-error', (e) => {
  const { message } = e.detail
  console.error('Latency test failed:', message)
})
```

### Lifecycle events

These fire with no meaningful payload (`e.detail` is an empty object `{}`). Use them to update host UI state — disable buttons, show spinners, etc.

| Event | When fired | Notes |
|---|---|---|
| `latency-start` | Host resources validated; test is about to begin | Always fires during `start()`, followed by `latency-recording` when signal playback begins. |
| `latency-recording` | Signal playback started; capture is running | |
| `latency-processing` | Recording stopped; cross-correlation worker is running | |

---

## Algorithm constants

These values are fixed by the research methodology and are not configurable:

| Constant | Value | Description |
|---|---|---|
| Reliability threshold | `18 dB` | Minimum correlation ratio for a trustworthy measurement — empirically chosen in the WAC 2025 experiments |
| MLS amplitude | `±1.0` | Binary MLS sequence mapped to `+1.0` / `−1.0` float samples |
| Chirp frequency range | `1500–8000 Hz` | Planned — bandlimited to avoid input aliasing above 12 kHz present on some iOS devices. Not yet implemented. |
| Mic constraints | `echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: false` | Recommended constraints for the host to apply when acquiring the mic stream. The component does not call `getUserMedia` — the host is responsible for setting constraints on the stream passed via `element.inputStream`. |

---

## Browser requirements

- `getUserMedia` (microphone access)
- Web Audio API (`AudioContext`)
- Web Workers
- HTTPS or `localhost`
- `AudioWorklet` — required only for `recording-mode="audioworklet"`; the `"mediarecorder"` and `"mediarecorder-1ch"` modes do not use it. Chrome 80+ is the practical minimum: earlier Chrome versions (66–79) may load the worklet without error but fail to deliver audio to multi-input `AudioWorkletNode` inputs, resulting in a `latency-error` event with an empty-capture message. Use `"mediarecorder"` as the fallback for older browsers.
- Stereo `MediaRecorder` output — required for the default `recording-mode="mediarecorder"` (2-channel). If the browser downmixes to mono, the component emits `latency-error`; use `recording-mode="mediarecorder-1ch"` as fallback

Safari may require manual gain compensation on some devices (common with `echoCancellation` disabled on Safari > v16). The `input-gain` attribute is designed for this but is not yet wired to a GainNode — it is a v2 item. In the current version there is no gain adjustment available.
