export interface LatencyResultDetail {
  latency: number
  ratio: number
  reliable: boolean
  timestamp: number
  mode: 'mediarecorder' | 'mediarecorder-2ch' | 'audioworklet'
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
  audioContext: AudioContext | null
  inputStream: MediaStream | null
  numberOfTests: number
  mlsBits: number
  maxLagMs: number
  bufferSize: number
  /** `'mediarecorder-2ch'` is reserved for Phase 3b — emits `latency-error` in v1. */
  recordingMode: 'mediarecorder' | 'mediarecorder-2ch' | 'audioworklet'
  /** Only `'mls'` is implemented in v1. `'chirp'` and `'golay'` are planned for v2. */
  signalType: 'mls'
  /** Observed and settable, but has no effect in v1. Use the host-gain pattern instead — see docs/examples/host-gain.md. */
  inputGain: number
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
