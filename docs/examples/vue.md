<div style="display:flex;align-items:center;gap:14px;margin-bottom:1.5rem">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/vuejs/vuejs-original.svg" width="52" height="52" alt="Vue">
<span style="font-size:2rem;font-weight:700;line-height:1">Vue 3 Integration</span>
</div>


---

## Setup

```bash
npm install @adasp/latency-test
```

Import once in `main.js` / `main.ts` to register the custom element globally:

```js
import '@adasp/latency-test'
```

Tell Vue to treat `latency-test` as a custom element so it does not try to resolve it as a Vue component. In `vite.config.js`:

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag === 'latency-test'
        }
      }
    })
  ]
})
```

---

## Basic usage (Composition API)

The recommended pattern is a two-step flow: connect audio first, then run tests. This keeps the mic stream warm between repeated clicks and avoids cold-start instability.

```vue
<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const MIC_CONSTRAINTS = {
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }
}

const ltRef = ref(null)
const micStream = ref(null)
const audioCtx = ref(null)
const isConnected = ref(false)
const result = ref(null)
const stats = ref(null)
const error = ref(null)

async function connect() {
  try {
    micStream.value = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS)
    audioCtx.value = new AudioContext({ latencyHint: 0 })
    ltRef.value.inputStream = micStream.value
    ltRef.value.audioContext = audioCtx.value
    isConnected.value = true
  } catch (e) {
    micStream.value?.getTracks().forEach(t => t.stop())
    micStream.value = null
    error.value = `Could not access mic: ${e.message}`
  }
}

function onResult(e) { result.value = e.detail }
function onComplete(e) { stats.value = e.detail }
function onError(e) { error.value = e.detail.message }

onMounted(() => {
  ltRef.value.addEventListener('latency-result', onResult)
  ltRef.value.addEventListener('latency-complete', onComplete)
  ltRef.value.addEventListener('latency-error', onError)
})

onBeforeUnmount(() => {
  ltRef.value.removeEventListener('latency-result', onResult)
  ltRef.value.removeEventListener('latency-complete', onComplete)
  ltRef.value.removeEventListener('latency-error', onError)
  micStream.value?.getTracks().forEach(t => t.stop())
  audioCtx.value?.close()
})
</script>

<template>
  <div>
    <latency-test ref="ltRef" number-of-tests="5" />
    <button v-if="!isConnected" @click="connect">Connect Audio</button>
    <button v-else @click="ltRef.start()">Test Latency</button>
    <p v-if="result">
      {{ result.latency.toFixed(2) }} ms — ratio: {{ result.ratio.toFixed(2) }} dB
      <span v-if="!result.reliable"> ⚠️ unreliable</span>
    </p>
    <p v-if="stats && stats.results?.length > 1">
      Mean: {{ stats.mean.toFixed(2) }} ms | SD: {{ stats.std.toFixed(2) }} |
      Min: {{ stats.min.toFixed(2) }} | Max: {{ stats.max.toFixed(2) }}
    </p>
    <p v-if="error" style="color: red">{{ error }}</p>
  </div>
</template>
```

> **Real-world use:** In an application that already manages a mic stream and `AudioContext` (e.g. a Web Audio DAW), pass both directly — no Connect Audio step needed. See [Sharing audio resources from a host app](#sharing-audio-resources-from-a-host-app).

---

## Sharing audio resources from a host app

When your application already owns a mic stream and `AudioContext`, pass both to the element. The component will not stop the stream or close the context — the host owns both lifetimes.

```vue
<script setup>
import { ref, onMounted, watch } from 'vue'

const props = defineProps({ audioContext: Object, inputStream: Object })
const ltRef = ref(null)

function assignResources(ac, stream) {
  if (ltRef.value) {
    if (ac) ltRef.value.audioContext = ac
    if (stream) ltRef.value.inputStream = stream
  }
}

onMounted(() => assignResources(props.audioContext, props.inputStream))
watch(() => [props.audioContext, props.inputStream], ([ac, stream]) => assignResources(ac, stream))
</script>

<template>
  <latency-test ref="ltRef" />
</template>
```

---

## TypeScript

Types ship with the package. Import `LatencyTestElement` directly:

```ts
import type { LatencyTestElement } from '@adasp/latency-test'

const ltRef = ref<LatencyTestElement | null>(null)
ltRef.value?.start()
ltRef.value?.audioContext  // ✅ typed
```

To prevent Vue from warning about an unknown element, mark it as a custom element in `vite.config.ts`:

```ts
plugins: [
  vue({
    template: {
      compilerOptions: {
        isCustomElement: (tag) => tag === 'latency-test'
      }
    }
  })
]
```
