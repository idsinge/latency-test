export interface LatencyResultDetail {
  latency: number
  ratio: number
  reliable: boolean
  timestamp: number
  mode: 'mediarecorder' | 'mediarecorder-1ch' | 'audioworklet'
}

export interface LatencyCompleteDetail {
  results: LatencyResultDetail[]
  mean: number
  std: number
  min: number
  max: number
  aborted?: true
}

export interface LatencyErrorDetail {
  message: string
}

type EmptyDetail = Record<string, never>

export interface LatencyTestEventMap extends HTMLElementEventMap {
  'latency-start':      CustomEvent<EmptyDetail>
  'latency-recording':  CustomEvent<EmptyDetail>
  'latency-processing': CustomEvent<EmptyDetail>
  'latency-result':     CustomEvent<LatencyResultDetail>
  'latency-complete':   CustomEvent<LatencyCompleteDetail>
  'latency-error':      CustomEvent<LatencyErrorDetail>
}

export interface LatencyTestElement extends HTMLElement {
  start(): Promise<void>
  stop(): void
  /** Must be assigned by the host before calling start(). The component never closes this context — the host owns the lifetime. */
  audioContext: AudioContext | null
  /** Must be assigned by the host before calling start(). The component never stops these tracks — the host owns the lifetime. */
  inputStream: MediaStream | null
  numberOfTests: number
  mlsBits: number
  maxLagMs: number
  bufferSize: number
  /** `'mediarecorder'` (default) uses 2-channel capture — emits `latency-error` if the browser downmixes to mono; use `'mediarecorder-1ch'` as fallback in that case. */
  recordingMode: 'mediarecorder' | 'mediarecorder-1ch' | 'audioworklet'
  /** Only `'mls'` is implemented in v1. `'chirp'` and `'golay'` are planned for v2. */
  signalType: 'mls'
  debug: boolean
  addEventListener<K extends keyof LatencyTestEventMap>(
    type: K,
    listener: (this: LatencyTestElement, ev: LatencyTestEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions
  ): void
  removeEventListener<K extends keyof LatencyTestEventMap>(
    type: K,
    listener: (this: LatencyTestElement, ev: LatencyTestEventMap[K]) => void,
    options?: boolean | EventListenerOptions
  ): void
}

declare global {
  interface HTMLElementTagNameMap {
    'latency-test': LatencyTestElement
  }
}
