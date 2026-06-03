<div style="display:flex;align-items:center;gap:14px;margin-bottom:1.5rem">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/nextjs/nextjs-original.svg" width="52" height="52" alt="Next.js">
<span style="font-size:2rem;font-weight:700;line-height:1">Next.js Integration</span>
</div>


---

## Important: SSR constraint

`<latency-test>` uses `navigator.mediaDevices`, `AudioContext`, and `AudioWorklet` — browser-only APIs. These do not exist in the Node.js environment where Next.js runs server-side rendering. **The component must be loaded client-side only.**

---

## Setup

```bash
npm install @adasp/latency-test
```

---

## App Router (Next.js 13+)

Use a Client Component with a `useEffect` lazy import. The `'use client'` directive ensures the component only renders in the browser; the lazy import inside `useEffect` guarantees the module (which references browser-only APIs) is never evaluated on the server.

The recommended pattern is a two-step flow: connect audio first, then run tests. This keeps the mic stream warm between repeated clicks and avoids cold-start instability.

```tsx
// components/LatencyTester.tsx
'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import type { LatencyTestElement, LatencyResultDetail, LatencyCompleteDetail, LatencyErrorDetail } from '@adasp/latency-test'

const MIC_CONSTRAINTS = {
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }
}

function useLatencyTest(onReady: () => void) {
  useEffect(() => {
    import('@adasp/latency-test').then(() =>
      customElements.whenDefined('latency-test').then(onReady)
    )
  }, [onReady])
}

export function LatencyTester({ numberOfTests = 5 }: { numberOfTests?: number }) {
  const ltRef = useRef<LatencyTestElement | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const [elementReady, setElementReady] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [result, setResult] = useState<LatencyResultDetail | null>(null)
  const [stats, setStats] = useState<LatencyCompleteDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onReady = useCallback(() => setElementReady(true), [])
  useLatencyTest(onReady)

  async function connect() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS)
      micStreamRef.current = stream
      const ac = new AudioContext({ latencyHint: 0 })
      audioCtxRef.current = ac
      ltRef.current!.inputStream = stream
      ltRef.current!.audioContext = ac
      setIsConnected(true)
    } catch (e: any) {
      micStreamRef.current?.getTracks().forEach(t => t.stop())
      micStreamRef.current = null
      setError(`Could not access mic: ${e.message}`)
    }
  }

  useEffect(() => {
    const el = ltRef.current
    if (!el) return
    const onResult = (e: CustomEvent<LatencyResultDetail>) => setResult(e.detail)
    const onComplete = (e: CustomEvent<LatencyCompleteDetail>) => setStats(e.detail)
    const onError = (e: CustomEvent<LatencyErrorDetail>) => setError(e.detail.message)
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
      {!elementReady
        ? <button disabled>Loading…</button>
        : !isConnected
          ? <button onClick={connect}>Connect Audio</button>
          : <button onClick={() => ltRef.current?.start()}>Test Latency</button>
      }
      {result && <p>{result.latency.toFixed(2)} ms — ratio: {result.ratio.toFixed(2)} dB{result.reliable ? '' : ' ⚠️'}</p>}
      {stats && stats.results?.length > 1 && (
        <p>Mean: {stats.mean.toFixed(2)} ms | SD: {stats.std.toFixed(2)} | Min: {stats.min.toFixed(2)} | Max: {stats.max.toFixed(2)}</p>
      )}
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  )
}
```

> **Real-world use:** In an application that already manages a mic stream and `AudioContext` (e.g. a Web Audio DAW), pass both directly — no Connect Audio step needed. See [Sharing audio resources from a host app](#sharing-audio-resources-from-a-host-app).

Use in a Server Component page by importing the Client Component:

```tsx
// app/page.tsx
import { LatencyTester } from '@/components/LatencyTester'

export default function Page() {
  return (
    <main>
      <h1>Audio Latency Test</h1>
      <LatencyTester />
    </main>
  )
}
```

---

## Sharing audio resources from a host app

When your application already owns a mic stream and `AudioContext`, pass both to the element. The component will not stop the stream or close the context — the host owns both lifetimes.

```tsx
'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import type { LatencyTestElement } from '@adasp/latency-test'

export function LatencyTesterWithContext({
  audioContext,
  inputStream
}: {
  audioContext: AudioContext
  inputStream: MediaStream
}) {
  const ltRef = useRef<LatencyTestElement | null>(null)
  const [elementReady, setElementReady] = useState(false)
  const onReady = useCallback(() => setElementReady(true), [])

  useEffect(() => {
    import('@adasp/latency-test').then(() =>
      customElements.whenDefined('latency-test').then(onReady)
    )
  }, [onReady])

  useEffect(() => {
    if (!elementReady) return
    const el = ltRef.current
    if (!el) return
    if (audioContext) el.audioContext = audioContext
    if (inputStream) el.inputStream = inputStream
  }, [elementReady, audioContext, inputStream])

  return <latency-test ref={ltRef} />
}
```

---

## Pages Router (Next.js 12 and earlier)

Use `next/dynamic` with `ssr: false`:

```tsx
// pages/index.tsx
import dynamic from 'next/dynamic'

const LatencyTester = dynamic(
  () => import('../components/LatencyTester').then((m) => m.LatencyTester),
  { ssr: false }
)

export default function Home() {
  return (
    <main>
      <h1>Audio Latency Test</h1>
      <LatencyTester />
    </main>
  )
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

**React < 19** (most current Next.js projects) — add a JSX namespace declaration:

```ts
// types/custom-elements.d.ts
declare namespace JSX {
  interface IntrinsicElements {
    'latency-test': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      'number-of-tests'?: number
      'mls-bits'?: number
      'max-lag-ms'?: number
      'recording-mode'?: 'mediarecorder' | 'mediarecorder-2ch' | 'audioworklet'
      'signal-type'?: 'mls'
      'input-gain'?: number
      'buffer-size'?: number
    }
  }
}
```
