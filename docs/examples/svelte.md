<div style="display:flex;align-items:center;gap:14px;margin-bottom:1.5rem">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/svelte/svelte-original.svg" width="52" height="52" alt="Svelte">
<span style="font-size:2rem;font-weight:700;line-height:1">Svelte / SvelteKit Integration</span>
</div>


---

## Setup

```bash
npm install @adasp/latency-test
```

Svelte works natively with custom elements — no special configuration needed. Import the package in the component that uses it.

---

## Basic usage

The recommended pattern is a two-step flow: connect audio first, then run tests. This keeps the mic stream warm between repeated clicks and avoids cold-start instability.

```svelte
<script>
  import '@adasp/latency-test'
  import { onMount, onDestroy } from 'svelte'

  const MIC_CONSTRAINTS = {
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }
  }

  let lt
  let micStream = null
  let audioCtx = null
  let isConnected = false
  let result = null
  let stats = null
  let error = null

  async function connect() {
    error = null
    try {
      audioCtx = new AudioContext({ latencyHint: 0 })
      micStream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS)
      lt.inputStream = micStream
      lt.audioContext = audioCtx
      isConnected = true
    } catch (e) {
      micStream?.getTracks().forEach(t => t.stop())
      micStream = null
      await audioCtx?.close()
      audioCtx = null
      error = `Could not access mic: ${e.message}`
    }
  }

  function onResult(e) { result = e.detail }
  function onComplete(e) { stats = e.detail }
  function onError(e) { error = e.detail.message }

  onMount(() => {
    lt.addEventListener('latency-result', onResult)
    lt.addEventListener('latency-complete', onComplete)
    lt.addEventListener('latency-error', onError)
  })

  onDestroy(() => {
    lt.removeEventListener('latency-result', onResult)
    lt.removeEventListener('latency-complete', onComplete)
    lt.removeEventListener('latency-error', onError)
    micStream?.getTracks().forEach(t => t.stop())
    audioCtx?.close()
  })
</script>

<latency-test bind:this={lt} number-of-tests="5"></latency-test>

{#if !isConnected}
  <button on:click={connect}>Connect Audio</button>
{:else}
  <button on:click={() => lt.start()}>Test Latency</button>
{/if}

{#if result}
  <p>{result.latency.toFixed(2)} ms — ratio: {result.ratio.toFixed(2)} dB{result.reliable ? '' : ' ⚠️ unreliable'}</p>
{/if}

{#if stats && stats.results?.length > 1}
  <p>
    Mean: {stats.mean.toFixed(2)} ms | SD: {stats.std.toFixed(2)} |
    Min: {stats.min.toFixed(2)} | Max: {stats.max.toFixed(2)}
  </p>
{/if}

{#if error}
  <p style="color: red">{error}</p>
{/if}
```

> **Real-world use:** In an application that already manages a mic stream and `AudioContext` (e.g. a Web Audio DAW), pass both directly — no Connect Audio step needed. See [Sharing audio resources from a host app](#sharing-audio-resources-from-a-host-app).

---

## Sharing audio resources from a host app

When your application already owns a mic stream and `AudioContext`, pass both to the element. The component will not stop the stream or close the context — the host owns both lifetimes.

```svelte
<script>
  import '@adasp/latency-test'
  import { onMount } from 'svelte'

  export let audioContext
  export let inputStream

  let lt

  onMount(() => {
    if (audioContext) lt.audioContext = audioContext
    if (inputStream) lt.inputStream = inputStream
  })

  $: if (lt && audioContext) lt.audioContext = audioContext
  $: if (lt && inputStream) lt.inputStream = inputStream
</script>

<latency-test bind:this={lt}></latency-test>
```

---

## SvelteKit note

SvelteKit runs components on the server during SSR. Custom elements that access `navigator` or `AudioContext` must be guarded:

```svelte
<script>
  import { browser } from '$app/environment'
  import { onMount, onDestroy } from 'svelte'

  let lt
  let micStream = null
  let audioCtx = null
  let isReady = false
  let isConnected = false

  const MIC_CONSTRAINTS = {
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }
  }

  onMount(async () => {
    if (browser) {
      await import('@adasp/latency-test')
      await customElements.whenDefined('latency-test')
      isReady = true
    }
  })

  onDestroy(() => {
    micStream?.getTracks().forEach(t => t.stop())
    audioCtx?.close()
  })

  async function connect() {
    try {
      audioCtx = new AudioContext({ latencyHint: 0 })
      micStream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS)
      lt.inputStream = micStream
      lt.audioContext = audioCtx
      isConnected = true
    } catch (e) {
      micStream?.getTracks().forEach(t => t.stop())
      micStream = null
      await audioCtx?.close()
      audioCtx = null
      console.error('Could not access mic:', e.message)
    }
  }
</script>

{#if browser && isReady}
  <latency-test bind:this={lt}></latency-test>
  {#if !isConnected}
    <button on:click={connect}>Connect Audio</button>
  {:else}
    <button on:click={() => lt.start()}>Test Latency</button>
  {/if}
{/if}
```

---

## TypeScript

Types ship with the package. Import `LatencyTestElement` directly:

```ts
import type { LatencyTestElement } from '@adasp/latency-test'

let lt: LatencyTestElement
// <latency-test bind:this={lt}></latency-test>

lt?.start()
lt?.audioContext  // ✅ typed
```
