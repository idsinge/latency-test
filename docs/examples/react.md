<div style="display:flex;align-items:center;gap:14px;margin-bottom:1.5rem">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/react/react-original.svg" width="52" height="52" alt="React">
<span style="font-size:2rem;font-weight:700;line-height:1">React Integration</span>
</div>


---

## Setup

```bash
npm install @adasp/latency-test
```

Import once at your app entry point (e.g. `main.jsx` or `index.js`) to register the custom element globally:

```js
import '@adasp/latency-test'
```

---

## Basic usage

The recommended pattern is a two-step flow: connect audio first, then run tests. This keeps the mic stream warm between repeated clicks and avoids cold-start instability.

```jsx
import { useRef, useEffect, useState } from 'react'

const MIC_CONSTRAINTS = {
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }
}

export function LatencyTester({ numberOfTests = 5 }) {
  const ltRef = useRef(null)
  const micStreamRef = useRef(null)
  const audioCtxRef = useRef(null)
  const [isConnected, setIsConnected] = useState(false)
  const [result, setResult] = useState(null)
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)

  async function connect() {
    try {
      const ac = new AudioContext({ latencyHint: 0 })
      audioCtxRef.current = ac
      const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS)
      micStreamRef.current = stream
      ltRef.current.inputStream = stream
      ltRef.current.audioContext = ac
      setIsConnected(true)
    } catch (e) {
      micStreamRef.current?.getTracks().forEach(t => t.stop())
      micStreamRef.current = null
      setError(`Could not access mic: ${e.message}`)
    }
  }

  useEffect(() => {
    const el = ltRef.current
    if (!el) return
    const onResult = (e) => setResult(e.detail)
    const onComplete = (e) => setStats(e.detail)
    const onError = (e) => setError(e.detail.message)
    el.addEventListener('latency-result', onResult)
    el.addEventListener('latency-complete', onComplete)
    el.addEventListener('latency-error', onError)
    return () => {
      el.removeEventListener('latency-result', onResult)
      el.removeEventListener('latency-complete', onComplete)
      el.removeEventListener('latency-error', onError)
      micStreamRef.current?.getTracks().forEach(t => t.stop())
      audioCtxRef.current?.close()
    }
  }, [])

  return (
    <div>
      <latency-test ref={ltRef} number-of-tests={numberOfTests} />
      {!isConnected
        ? <button onClick={connect}>Connect Audio</button>
        : <button onClick={() => ltRef.current?.start()}>Test Latency</button>
      }
      {result && (
        <p>{result.latency.toFixed(2)} ms — ratio: {result.ratio.toFixed(2)} dB{result.reliable ? '' : ' ⚠️'}</p>
      )}
      {stats && stats.results?.length > 1 && (
        <p>Mean: {stats.mean.toFixed(2)} ms | SD: {stats.std.toFixed(2)} | Min: {stats.min.toFixed(2)} | Max: {stats.max.toFixed(2)}</p>
      )}
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  )
}
```

> **Real-world use:** In an application that already manages a mic stream and `AudioContext` (e.g. a Web Audio DAW), pass both directly — no Connect Audio step needed. See [Sharing audio resources from a host app](#sharing-audio-resources-from-a-host-app).

---

## Sharing audio resources from a host app

When your application already owns a mic stream and `AudioContext`, pass both to the element. The component will not stop the stream or close the context — the host owns both lifetimes.

```jsx
import { useRef, useEffect } from 'react'

export function LatencyTesterWithContext({ audioContext, inputStream }) {
  const ltRef = useRef(null)

  useEffect(() => {
    const el = ltRef.current
    if (!el) return
    if (audioContext) el.audioContext = audioContext
    if (inputStream) el.inputStream = inputStream
  }, [audioContext, inputStream])

  return <latency-test ref={ltRef} />
}
```

---

## TypeScript

Types ship with the package. Import `LatencyTestElement` directly:

```ts
import type { LatencyTestElement } from '@adasp/latency-test'

const el = ltRef.current as LatencyTestElement
el?.start()
el?.audioContext  // ✅ typed
```

**React 19+** — `<latency-test>` in JSX picks up types from `HTMLElementTagNameMap` automatically. No manual declarations needed.

**React < 19** — add a JSX namespace declaration to avoid template type errors:

```ts
// src/custom-elements.d.ts
declare namespace JSX {
  interface IntrinsicElements {
    'latency-test': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      'number-of-tests'?: number
      'mls-bits'?: number
      'max-lag-ms'?: number
      'recording-mode'?: 'mediarecorder' | 'mediarecorder-1ch' | 'audioworklet'
      'signal-type'?: 'mls'
      'input-gain'?: number
    }
  }
}
```
